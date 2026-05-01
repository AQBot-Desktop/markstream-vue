<script setup lang="ts">
import { normalizeCustomHtmlTags } from 'stream-markdown-parser'
import { computed } from 'vue-demi'
import { getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText } from '../../utils/htmlRenderer'
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteAnchorNode from '../FootnoteAnchorNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import HtmlBlockNode from '../HtmlBlockNode'
import HtmlInlineNode from '../HtmlInlineNode'
import ImageNode from '../ImageNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'paragraph'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
  customHtmlTags?: readonly string[]
}>()

const overrides = getCustomNodeComponents(props.customId)

function isWhitespaceText(child: NodeChild) {
  return child.type === 'text' && String((child as any).content ?? '').trim() === ''
}

function getTextContent(child: NodeChild) {
  return String((child as any).content ?? '')
}

function getMeaningfulLinkChildren(child: NodeChild) {
  if (child.type !== 'link' || !Array.isArray((child as any).children))
    return []

  return (child as any).children.filter((linkChild: NodeChild) => !isWhitespaceText(linkChild))
}

function isImageOnlyLink(child: NodeChild) {
  const linkChildren = getMeaningfulLinkChildren(child)
  return linkChildren.length === 1 && linkChildren[0]?.type === 'image'
}

const meaningfulChildren = computed(() => props.node.children.filter(child => !isWhitespaceText(child)))

const isMediaOnlyParagraph = computed(() => (
  meaningfulChildren.value.length > 0
  && meaningfulChildren.value.every(child => child.type === 'image' || isImageOnlyLink(child))
))

const customHtmlTagsSet = computed<Set<string>>(() => {
  return new Set(normalizeCustomHtmlTags(props.customHtmlTags))
})

const renderedChildren = computed(() => {
  if (!isMediaOnlyParagraph.value || meaningfulChildren.value.length <= 1)
    return props.node.children

  const children: NodeChild[] = []
  for (let i = 0; i < props.node.children.length; i++) {
    const child = props.node.children[i]
    if (!isWhitespaceText(child)) {
      children.push(child)
      continue
    }

    const hasPrevious = children.length > 0
    const hasNext = props.node.children.slice(i + 1).some(nextChild => !isWhitespaceText(nextChild))
    if (!hasPrevious || !hasNext)
      continue

    children.push({
      ...child,
      content: ' ',
      raw: ' ',
    } as NodeChild)
  }

  return children
})

function getChildProps(child: NodeChild, index: number) {
  return {
    'node': child,
    'index-key': `${props.indexKey ?? 'paragraph'}-${index}`,
    'custom-id': props.customId,
    'custom-html-tags': props.customHtmlTags,
  }
}

const nodeComponents = {
  inline_code: InlineCodeNode,
  image: ImageNode,
  link: LinkNode,
  hardbreak: HardBreakNode,
  emphasis: EmphasisNode,
  strong: StrongNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  html_inline: HtmlInlineNode,
  html_block: HtmlBlockNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  math_inline: MathInlineNodeAsync,
  checkbox_input: CheckboxNode,
  reference: ReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  footnote_reference: FootnoteReferenceNode,
  text: TextNode,
  ...overrides,
}

function processChild(child: NodeChild): { child: NodeChild, component: any } {
  if (child.type === 'html_block' || child.type === 'html_inline') {
    const tag = String((child as any).tag ?? '').trim().toLowerCase()
      || getHtmlTagFromContent((child as any).content)

    if (tag && !customHtmlTagsSet.value.has(tag) && shouldRenderUnknownHtmlTagAsText((child as any).content ?? (child as any).raw, tag)) {
      const rawContent = String((child as any).content ?? (child as any).raw ?? '')

      return {
        child: {
          type: 'text',
          content: rawContent,
          raw: rawContent,
        } as NodeChild,
        component: TextNode,
      }
    }
  }

  return { child, component: (nodeComponents as any)[child.type] }
}
</script>

<template>
  <p dir="auto" class="paragraph-node">
    <template v-for="(child, index) in renderedChildren">
      <template v-if="isMediaOnlyParagraph && isWhitespaceText(child)">
        {{ getTextContent(child) }}
      </template>
      <component
        :is="processChild(child).component"
        v-else
        :key="`${indexKey || 'paragraph'}-${index}`"
        v-bind="getChildProps(processChild(child).child, index)"
      />
    </template>
  </p>
</template>

<style scoped>
.paragraph-node{
  margin: 1.25em 0;
}
li .paragraph-node{
  margin: 0;
}
</style>
