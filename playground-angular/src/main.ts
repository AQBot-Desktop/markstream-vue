import 'katex/dist/katex.min.css'
import './app.css'
import './test-page.css'
import '../../packages/markstream-angular/src/index.css'
import '@angular/compiler'

async function main() {
  const { bootstrapPlayground } = await import('./bootstrap-app')
  return bootstrapPlayground()
}

main().catch((error) => {
  console.error('[playground-angular] bootstrap failed', error)
})
