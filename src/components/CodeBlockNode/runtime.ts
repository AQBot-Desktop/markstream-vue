let codeBlockRuntimeReady = false

export function isCodeBlockRuntimeReady() {
  return codeBlockRuntimeReady
}

export function markCodeBlockRuntimeReady() {
  codeBlockRuntimeReady = true
}

export function resetCodeBlockRuntimeReadyForTest() {
  codeBlockRuntimeReady = false
}
