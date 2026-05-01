import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const angularCompilerEntry = require.resolve('@angular/compiler', {
  paths: [resolve(process.cwd(), 'node_modules/.pnpm/node_modules')],
})
await import(angularCompilerEntry)
const { TextNodeComponent } = await import('../packages/markstream-angular/src/components/TextNode/TextNode.component')

describe('markstream-angular text node streaming consistency', () => {
  it('settles a finished text delta when a later stream tick keeps the same text', () => {
    const textStreamState = new Map<string, string>()
    const component = new TextNodeComponent()

    component.indexKey = 'stream-0'
    component.context = {
      events: {},
      textStreamState,
      typewriter: true,
      streamRenderVersion: 1,
    }
    component.node = {
      type: 'text',
      content: '记忆化递归（动态规划）',
      raw: '记忆化递归（动态规划）',
    } as any

    textStreamState.set('stream-0', '记忆化递归（动态规划')
    component.ngOnChanges()

    expect(component.settledText).toBe('记忆化递归（动态规划')
    expect(component.streamedDelta).toBe('）')

    component.context = {
      ...component.context,
      streamRenderVersion: 2,
    }
    component.ngOnChanges()

    expect(component.settledText).toBe('记忆化递归（动态规划）')
    expect(component.streamedDelta).toBe('')
  })

  it('ships pre-wrap text styles so softbreaks stay visible in Angular', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'packages/markstream-angular/src/index.css'),
      'utf8',
    )

    expect(css).toContain('.markstream-angular .markstream-angular-text-node')
    expect(css).toContain('white-space: pre-wrap;')
  })
})
