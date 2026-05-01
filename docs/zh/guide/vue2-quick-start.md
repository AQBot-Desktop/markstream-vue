# Vue 2 快速开始

在你的 Vue 2 项目中开始使用 markstream-vue2。

## 基础设置

### 1. 安装

首先，安装包：

```bash
pnpm add markstream-vue2
```

### 2. 导入样式

在你的主入口文件（如 `main.js` 或 `main.ts`）中：

```js
import Vue from 'vue'
import App from './App.vue'
import 'markstream-vue2/index.css'

// 对于 Vue 2.6.x，还需要安装并配置 @vue/composition-api
// import VueCompositionAPI from '@vue/composition-api'
// Vue.use(VueCompositionAPI)

new Vue({
  render: h => h(App)
}).$mount('#app')
```

### 3. 使用组件

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  name: 'App',
  components: {
    MarkdownRender
  },
  data() {
    return {
      markdown: `# Hello Vue 2!

这是 **markstream-vue2** - 适用于 Vue 2 的流式 Markdown 渲染器。

## 功能

- 代码语法高亮
- Mermaid 图表
- 数学公式
- 还有更多功能！

\`\`\`javascript
console.log('Hello from Vue 2!')
\`\`\`
`
    }
  }
}
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## 使用 Vue 2.7+（Composition API）

Vue 2.7 内置了 Composition API 支持：

```vue
<script>
import MarkdownRender from 'markstream-vue2'
import { defineComponent, ref } from 'vue'

export default defineComponent({
  name: 'App',
  components: {
    MarkdownRender
  },
  setup() {
    const markdown = ref(`# Hello Vue 2.7!

这使用了 Composition API。

\`\`\`javascript
const message = 'Hello from Vue 2.7!'
console.log(message)
\`\`\`
`)
    return { markdown }
  }
})
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## 使用 Vue 2.6.x（@vue/composition-api）

对于 Vue 2.6.x，安装 `@vue/composition-api`：

```bash
pnpm add @vue/composition-api
```

```js
import VueCompositionAPI from '@vue/composition-api'
// main.js
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
```

然后使用方式与 Vue 2.7 相同：

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api'
import MarkdownRender from 'markstream-vue2'

export default defineComponent({
  name: 'App',
  components: {
    MarkdownRender
  },
  setup() {
    const markdown = ref(`# Hello Vue 2.6!

这使用了 @vue/composition-api。
`)
    return { markdown }
  }
})
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## 启用可选功能

### 代码语法高亮

安装依赖：

```bash
pnpm add stream-markdown
```

```vue
<script>
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue2'

// 在 MarkdownRender 中使用 Shiki 代码块
setCustomComponents({ code_block: MarkdownCodeBlockNode })

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `\`\`\`javascript
const hello = 'world'
console.log(hello)
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### Mermaid 图表

安装 mermaid：

```bash
pnpm add mermaid
```

导入样式。默认 loader 已经启用，只有在你手动关闭或需要自定义 loader 时才需要调用 `enableMermaid()`：

```js
import { enableMermaid } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

// 可选：重新启用或覆盖 loader
enableMermaid()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]
    B -->|否| D[继续尝试]
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### D2 图表

安装 D2：

```bash
pnpm add @terrastruct/d2
```

导入样式。默认 loader 已经启用，只有在你手动关闭或需要自定义 loader 时才需要调用 `enableD2()`：

```js
import { enableD2 } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

// 可选：重新启用或覆盖 loader
enableD2()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### D2 图表

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### 数学公式（KaTeX）

安装 katex：

```bash
pnpm add katex
```

导入样式。默认 loader 已经启用，只有在你手动关闭或需要自定义 loader 时才需要调用 `enableKatex()`：

```js
import { enableKatex } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

import 'katex/dist/katex.min.css'

// 可选：重新启用或覆盖 loader
enableKatex()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### 数学示例

行内数学公式：$E = mc^2$

块级数学公式：

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

## 自定义组件

你可以使用 `setCustomComponents` 自定义特定节点的渲染方式：

```vue
<script>
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'

// 创建自定义标题组件
const CustomHeading = {
  name: 'CustomHeading',
  props: ['node'],
  render(h) {
    const level = this.node.level || 1
    const Tag = `h${level}`
    return h(Tag, { class: 'custom-heading' }, this.node.children.map(c => c.content))
  }
}

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `# 自定义标题

此标题使用自定义组件渲染。
`
    }
  },
  mounted() {
    // 注册自定义组件
    setCustomComponents('my-app', {
      heading: CustomHeading
    })
  }
}
</script>

<template>
  <div>
    <MarkdownRender
      custom-id="my-app"
      :content="markdown"
    />
  </div>
</template>

<style scoped>
.custom-heading {
  color: #e11d48;
  border-bottom: 2px solid #e11d48;
  padding-bottom: 0.5rem;
}
</style>
```

## 流式内容

markstream-vue2 支持流式 markdown 内容，适用于 AI 生成的内容：

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: '',
      fullText: `# 流式传输演示

此内容正在**逐步**流式传输。

## 功能

1. 渐进式渲染
2. 无布局偏移
3. 流畅动画

\`\`\`javascript
const streaming = true
console.log('流式传输已启用:', streaming)
\`\`\`
`
    }
  },
  methods: {
    startStreaming() {
      this.markdown = ''
      let i = 0
      const interval = setInterval(() => {
        if (i < this.fullText.length) {
          this.markdown += this.fullText[i]
          i++
        }
        else {
          clearInterval(interval)
        }
      }, 20)
    }
  }
}
</script>

<template>
  <div>
    <button @click="startStreaming">
      开始流式传输
    </button>
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## VitePress 集成（Vue 2）

对于使用 Vue 2 的 VitePress，你可以在自定义主题中使用 markstream-vue2：

```js
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'
// docs/.vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme'
import 'markstream-vue2/index.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // 全局注册组件
    app.component('MarkdownRender', MarkdownRender)

    // 设置自定义组件（如果需要）
    setCustomComponents('vitepress', {
      // 你的自定义组件
    })
  }
}
```

## 下一步

- 查看 [Vue 2 组件文档](/zh/guide/vue2-components) 了解所有可用组件
- 查看 [API 参考](/zh/guide/api) 获取详细 API 文档
- 查看 [示例](/zh/guide/examples) 获取更多使用示例
