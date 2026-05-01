#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'

const issueMarkdown = `- 代入数据：$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$，$m=1.1\\ \\text{kg}$，$\\Delta t=40℃$
- 计算得：$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$
- 第（1）问：学生遗漏了比热容的数量级$10^3$，将$0.75\\times10^3\\ \\text{J/(kg·℃)}$错写为$0.75\\ \\text{J/(kg·℃)}$，导致计算出的$Q_1$错误。`

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findFreePort(start = 4291, end = 4330) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
}

function killProcessTree(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        headless: true,
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
  }
}

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
      },
    },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs() {
      return logs.join('')
    },
  }
}

function createIssueUrl(port) {
  return `http://${host}:${port}/test#data=raw:${encodeURIComponent(issueMarkdown)}`
}

async function waitForIssueMath(page) {
  await page.locator('.preview-surface').waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(() => {
    const root = document.querySelector('.preview-surface')
    if (!root)
      return false

    const inlineNodes = Array.from(root.querySelectorAll('[data-markstream-math="inline"]'))
    if (inlineNodes.length !== 8)
      return false

    return inlineNodes.every((node) => {
      const mode = node.getAttribute('data-markstream-mode')
      return mode === 'katex'
        && Boolean(node.querySelector('.katex'))
        && !node.querySelector('.math-inline--fallback')
        && !node.querySelector('.math-inline__loading')
    })
  }, { timeout: 30000 })
}

async function readSummary(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.preview-surface')
    const inlineNodes = Array.from(root?.querySelectorAll('[data-markstream-math="inline"]') || [])
    return {
      inlineCount: inlineNodes.length,
      inlineModes: inlineNodes.map(node => node.getAttribute('data-markstream-mode')),
      katexCount: root?.querySelectorAll('[data-markstream-math="inline"] .katex').length || 0,
      fallbackInlineCount: root?.querySelectorAll('.math-inline--fallback').length || 0,
      fallbackBlockCount: root?.querySelectorAll('.math-block__fallback').length || 0,
      loadingInlineCount: root?.querySelectorAll('.math-inline__loading').length || 0,
      katexErrorCount: root?.querySelectorAll('.katex-error').length || 0,
      previewText: root?.textContent || '',
    }
  })
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)
  let browser
  let page

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })

    const relevantConsoleIssues = []
    const pageErrors = []

    page.on('console', (msg) => {
      if ((msg.type() === 'error' || msg.type() === 'warning') && /katex|cdotp|character metrics|undefined control sequence/i.test(msg.text()))
        relevantConsoleIssues.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)))

    await page.goto(createIssueUrl(port), { waitUntil: 'load' })
    await waitForIssueMath(page)

    const summary = await readSummary(page)

    if (summary.inlineCount !== 8)
      throw new Error(`Expected 8 inline math nodes, got ${summary.inlineCount}`)
    if (summary.katexCount !== 8)
      throw new Error(`Expected 8 rendered KaTeX nodes, got ${summary.katexCount}`)
    if (summary.inlineModes.some(mode => mode !== 'katex'))
      throw new Error(`Expected all inline math nodes to be in katex mode, got ${summary.inlineModes.join(', ')}`)
    if (summary.fallbackInlineCount !== 0 || summary.fallbackBlockCount !== 0)
      throw new Error(`Unexpected fallback nodes: inline=${summary.fallbackInlineCount}, block=${summary.fallbackBlockCount}`)
    if (summary.loadingInlineCount !== 0)
      throw new Error(`Unexpected loading math nodes left in preview: ${summary.loadingInlineCount}`)
    if (summary.katexErrorCount !== 0)
      throw new Error(`Unexpected KaTeX error nodes in preview: ${summary.katexErrorCount}`)
    if (summary.previewText.includes('$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$'))
      throw new Error('Preview still contains raw fallback text for the first issue formula')
    if (relevantConsoleIssues.length)
      throw new Error(`Unexpected KaTeX console issues:\n${relevantConsoleIssues.join('\n')}`)
    if (pageErrors.length)
      throw new Error(`Unexpected page errors:\n${pageErrors.join('\n')}`)

    console.log('KaTeX unicode-unit e2e passed.')
    console.log(JSON.stringify(summary, null, 2))
  }
  catch (error) {
    if (page) {
      try {
        const screenshot = '/tmp/markstream-katex-unicode-unit-regression.png'
        await page.screenshot({ path: screenshot, fullPage: true })
        console.error(`Saved failure screenshot to ${screenshot}`)
      }
      catch {}
    }
    console.error(server.getLogs())
    throw error
  }
  finally {
    await browser?.close().catch(() => {})
    killProcessTree(server.child)
  }
}

main().catch((error) => {
  console.error('[e2e-katex-unicode-unit-regression] failed')
  console.error(error)
  process.exitCode = 1
})
