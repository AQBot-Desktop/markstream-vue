<script setup lang="ts">
import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { computed, defineComponent } from 'vue'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    type: 'html_inline'
    tag?: string
    content: string
    loading?: boolean
    autoClosed?: boolean
  }
  customId?: string
}>()

// Get custom components from global registry
const customComponents = computed(() => {
  // Track revision so we re-parse when mappings change.
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    nodes: {
      type: Array as () => any[],
      required: true,
    },
  },
  render() {
    return this.nodes
  },
})

// Computed property to determine render mode and content
const renderMode = computed(() => {
  const content = props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  if (props.node.loading && !props.node.autoClosed)
    return { mode: 'text', content }

  // When the inline HTML node is in a streaming mid-state and the parser has
  // auto-closed it for rendering (`autoClosed: true`), prefer VNode rendering.
  // Using `innerHTML` repeatedly replaces the subtree and can cause flicker.
  if (props.node.loading && props.node.autoClosed) {
    const nodes = parseHtmlToVNodes(content, customComponents.value)
    if (nodes !== null)
      return { mode: 'dynamic', nodes }
  }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content: sanitizeHtmlContent(content) }

  // Parse and build VNode tree
  const nodes = parseHtmlToVNodes(content, customComponents.value)
  if (nodes === null)
    return { mode: 'html', content: sanitizeHtmlContent(content) } // Fallback to sanitized DOM rendering if parsing fails

  return { mode: 'dynamic', nodes }
})
</script>

<template>
  <span
    v-if="renderMode.mode === 'dynamic'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >
    <DynamicRenderer :nodes="renderMode.nodes" />
  </span>
  <span
    v-else-if="renderMode.mode === 'text'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >{{ renderMode.content }}</span>
  <span
    v-else
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
    v-html="renderMode.content"
  />
</template>

<style scoped>
.html-inline-node {
  display: inline;
}

.html-inline-node--loading {
  opacity: 0.85;
}
</style>
