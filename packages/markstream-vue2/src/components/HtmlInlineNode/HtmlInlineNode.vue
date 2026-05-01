<script setup lang="ts">
import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { computed, defineComponent } from 'vue-demi'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { getCustomNodeComponents } from '../../utils/nodeComponents'

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
  return getCustomNodeComponents(props.customId)
})

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    content: {
      type: String,
      required: true,
    },
    customComponents: {
      type: Object as () => Record<string, any>,
      required: true,
    },
  },
  render() {
    const nodes = parseHtmlToVNodes(this.content, this.customComponents)
    return (nodes || []) as any
  },
})

// Computed property to determine render mode and content
const renderMode = computed(() => {
  const content = props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  if (props.node.loading && !props.node.autoClosed)
    return { mode: 'text', content }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content: sanitizeHtmlContent(content) }

  return { mode: 'dynamic', content }
})
</script>

<template>
  <span
    v-if="renderMode.mode === 'dynamic'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >
    <DynamicRenderer :content="renderMode.content" :custom-components="customComponents" />
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
