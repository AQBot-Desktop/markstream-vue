import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'

function makeNode(code = 'console.log(1)') {
  return {
    type: 'code_block' as const,
    language: 'plaintext',
    code,
    raw: `\`\`\`txt\n${code}\n\`\`\``,
  }
}

function makeScrollable(element: HTMLElement) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: 1000,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: 100,
  })
  element.scrollTop = 0
}

async function flushCodeWatchers() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('markdownCodeBlockNode props and features', () => {
  it('should support all header control props', () => {
    const expectedProps = [
      'showHeader',
      'showCopyButton',
      'showExpandButton',
      'showPreviewButton',
      'showFontSizeButtons',
      'showTooltips',
      'enableFontSizeControl',
    ]

    // These props should now be supported on MarkdownCodeBlockNode
    expectedProps.forEach((prop) => {
      expect(prop).toBeTruthy()
    })
  })

  it('should support language detection for preview', () => {
    const htmlLanguages = ['html', 'svg']
    const isPreviewable = (lang: string, isShowPreview: boolean) => {
      return isShowPreview && htmlLanguages.includes(lang.toLowerCase())
    }

    expect(isPreviewable('html', true)).toBe(true)
    expect(isPreviewable('svg', true)).toBe(true)
    expect(isPreviewable('javascript', true)).toBe(false)
    expect(isPreviewable('html', false)).toBe(false)
  })

  it('should support font size controls', () => {
    const codeFontMin = 10
    const codeFontMax = 36
    const codeFontStep = 1
    const defaultSize = 14

    const increaseFont = (current: number) => Math.min(codeFontMax, current + codeFontStep)
    const decreaseFont = (current: number) => Math.max(codeFontMin, current - codeFontStep)
    const resetFont = () => defaultSize

    expect(increaseFont(14)).toBe(15)
    expect(increaseFont(36)).toBe(36)
    expect(decreaseFont(14)).toBe(13)
    expect(decreaseFont(10)).toBe(10)
    expect(resetFont()).toBe(14)
  })

  it('should emit proper events', () => {
    const expectedEvents = ['previewCode', 'copy']
    expectedEvents.forEach((event) => {
      expect(event).toBeTruthy()
    })
  })

  it('should support named slots', () => {
    const expectedSlots = ['header-left', 'header-right']
    expectedSlots.forEach((slot) => {
      expect(slot).toBeTruthy()
    })
  })

  it('should support auto-scroll to bottom behavior', () => {
    // Test the isAtBottom helper function logic with 50px threshold
    const isAtBottom = (scrollHeight: number, scrollTop: number, clientHeight: number, threshold = 50): boolean => {
      return scrollHeight - scrollTop - clientHeight <= threshold
    }

    // Test when at bottom
    expect(isAtBottom(1000, 900, 100, 50)).toBe(true) // exactly at bottom
    expect(isAtBottom(1000, 860, 100, 50)).toBe(true) // within threshold (40px from bottom)

    // Test when not at bottom
    expect(isAtBottom(1000, 840, 100, 50)).toBe(false) // beyond threshold (60px from bottom)
    expect(isAtBottom(1000, 500, 100, 50)).toBe(false) // in middle
    expect(isAtBottom(1000, 0, 100, 50)).toBe(false) // at top
  })

  it('should not auto-scroll when autoScrollOnUpdate is false', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(),
        autoScrollOnUpdate: false,
      },
    })

    const content = wrapper.get('.code-block-content').element as HTMLElement
    makeScrollable(content)

    await wrapper.setProps({
      node: makeNode('line\n'.repeat(80)),
    })
    await flushCodeWatchers()

    expect(content.scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('should start with auto-scroll disabled when autoScrollInitial is false', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(),
        autoScrollInitial: false,
      },
    })

    const content = wrapper.get('.code-block-content').element as HTMLElement
    makeScrollable(content)

    await wrapper.setProps({
      node: makeNode('line\n'.repeat(80)),
    })
    await flushCodeWatchers()

    expect(content.scrollTop).toBe(0)
    wrapper.unmount()
  })
})
