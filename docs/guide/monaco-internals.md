# Monaco Internals

This page covers build and runtime tips for `monaco-editor` when using the library.

## Installation

```bash
pnpm add stream-monaco
```

## Vite bundling tips
- Monaco requires worker configuration for production builds. Use `vite-plugin-monaco-editor-esm` or `vite-plugin-monaco-editor`.
- In Vite config:
  ```ts
  import { defineConfig } from 'vite'
  import monacoEditorPlugin from 'vite-plugin-monaco-editor'

  export default defineConfig({ plugins: [monacoEditorPlugin()] })
  ```

## Avoid worker-not-found errors
- Ensure the plugin packages Monaco workers where your site expects them (e.g., via `customDistPath`) and verify worker file urls after build.
- If bundling into a library, make sure the peer `stream-monaco` is installed in consuming applications.

## Packaging notes
- The library lazy-loads Monaco only when a `CodeBlockNode` mounts. This reduces initial bundle size and avoids SSR failures.
- If the host app wants to warm Monaco earlier, call markstream-vue's `preloadCodeBlockRuntime()` instead of importing `stream-monaco` directly. This keeps markstream-vue's code block runtime readiness in sync with the worker preload.

## Troubleshooting
- If you see `Failed to load Monaco worker`, check that the worker files are present in `dist` and accessible by the built site. The plugin's `customDistPath` can help relocate them.

Quick try — preload the code block runtime at app startup so editor mounts faster and warm remounts skip the loading fallback:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

`getUseMonaco()` remains supported for existing integrations and has the same runtime-ready side effect.
