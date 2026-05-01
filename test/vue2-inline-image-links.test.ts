/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import ParagraphNode from '../packages/markstream-vue2/src/components/ParagraphNode/ParagraphNode.vue'

vi.mock('../packages/markstream-vue2/src/components/LinkNode', () => ({
  default: defineComponent({
    name: 'Vue2LinkNodeStub',
    props: {
      node: {
        type: Object,
        required: true,
      },
    },
    render() {
      return h('a', { class: 'link-node', href: (this as any).node.href }, (this as any).$slots.default?.())
    },
  }),
}))

vi.mock('../packages/markstream-vue2/src/components/ImageNode', () => ({
  default: defineComponent({
    name: 'Vue2ImageNodeStub',
    props: {
      node: {
        type: Object,
        required: true,
      },
    },
    render() {
      return h('img', {
        class: 'image-node__img',
        src: (this as any).node.src,
        alt: (this as any).node.alt,
      })
    },
  }),
}))

vi.mock('../packages/markstream-vue2/src/components/TextNode', () => ({
  default: defineComponent({
    name: 'Vue2TextNodeStub',
    props: {
      node: {
        type: Object,
        required: true,
      },
    },
    render() {
      return h('span', { class: 'text-node' }, String((this as any).node.content ?? ''))
    },
  }),
}))

describe('markstream-vue2 paragraph media-only links', () => {
  it('keeps image links inline without inserting text spans between them', () => {
    const wrapper = mount(ParagraphNode as any, {
      props: {
        indexKey: 'paragraph-0',
        node: {
          type: 'paragraph',
          raw: '',
          children: [
            {
              type: 'link',
              href: 'https://www.npmjs.com/package/markstream-vue',
              title: null,
              text: 'NPM version',
              raw: '',
              children: [
                {
                  type: 'image',
                  src: 'https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=',
                  alt: 'NPM version',
                  title: 'NPM version',
                  raw: '',
                },
              ],
            },
            {
              type: 'text',
              content: '\n',
              raw: '\n',
            },
            {
              type: 'link',
              href: 'README.zh-CN.md',
              title: null,
              text: '中文版',
              raw: '',
              children: [
                {
                  type: 'image',
                  src: 'https://img.shields.io/badge/docs-中文文档-blue',
                  alt: '中文版',
                  title: '中文版',
                  raw: '',
                },
              ],
            },
          ],
        },
      },
      global: {
        stubs: {
          'transition': false,
          'transition-group': false,
        },
      },
    })

    const paragraph = wrapper.get('p.paragraph-node')
    const childTagNames = Array.from(paragraph.element.children).map(child => child.tagName)
    const meaningfulNodes = Array.from(paragraph.element.childNodes).filter((node) => {
      return node.nodeType !== Node.TEXT_NODE || node.textContent === ' '
    })
    expect(childTagNames).toEqual(['A', 'A'])
    expect(meaningfulNodes).toHaveLength(3)
    expect(meaningfulNodes[1]?.nodeType).toBe(Node.TEXT_NODE)
    expect(meaningfulNodes[1]?.textContent).toBe(' ')
    expect(paragraph.findAll('.text-node')).toHaveLength(0)
    expect(paragraph.findAll('a.link-node')).toHaveLength(2)
  })
})
