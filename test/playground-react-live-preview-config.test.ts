import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('playground-react live preview config', () => {
  it('keeps the shared React playground custom scope in one place', () => {
    const sharedSource = readSource('playground-react18/src/shared/markstreamPlayground.ts')

    expect(sharedSource).toContain('PLAYGROUND_CUSTOM_ID = \'playground-demo\'')
    expect(sharedSource).toContain('PLAYGROUND_CUSTOM_HTML_TAGS = [\'thinking\'] as const')
  })

  it('wires React 18 preview surfaces to the shared custom html config', () => {
    const appSource = readSource('playground-react18/src/App.tsx')
    const testLabSource = readSource('playground-react18/src/shared/TestLab.tsx')
    const migrationSource = readSource('playground-react18/src/shared/MigrationDemoPage.tsx')
    const thinkingSource = readSource('playground-react18/src/components/ThinkingNode.tsx')

    expect(appSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from \'./shared/markstreamPlayground\'')
    expect(appSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')

    expect(testLabSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from \'./markstreamPlayground\'')
    expect(testLabSource).toContain('customId={PLAYGROUND_CUSTOM_ID}')
    expect(testLabSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')

    expect(migrationSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from \'./markstreamPlayground\'')
    expect(migrationSource).toContain('customId={PLAYGROUND_CUSTOM_ID}')
    expect(migrationSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')

    expect(thinkingSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS } from \'../shared/markstreamPlayground\'')
    expect(thinkingSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(thinkingSource).toContain('props.children')
  })

  it('wires React 19 preview surfaces to the shared custom html config', () => {
    const appSource = readSource('playground-react19/src/App.tsx')
    const thinkingSource = readSource('playground-react19/src/components/ThinkingNode.tsx')

    expect(appSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from \'../../playground-react18/src/shared/markstreamPlayground\'')
    expect(appSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')

    expect(thinkingSource).toContain('import { PLAYGROUND_CUSTOM_HTML_TAGS } from \'../../../playground-react18/src/shared/markstreamPlayground\'')
    expect(thinkingSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(thinkingSource).toContain('props.children')
  })
})
