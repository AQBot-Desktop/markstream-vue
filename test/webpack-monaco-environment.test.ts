import { describe, expect, it, vi } from 'vitest'

describe('webpack MonacoEnvironment interop', () => {
  it('calls stream-monaco preload when MonacoEnvironment is absent', async () => {
    vi.resetModules()
    delete (globalThis as any).MonacoEnvironment

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco, isCodeBlockRuntimeReady } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).toHaveBeenCalledTimes(1)
    expect(isCodeBlockRuntimeReady()).toBe(true)
  })

  it('exposes a code block runtime preload API', async () => {
    vi.resetModules()
    delete (globalThis as any).MonacoEnvironment

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { isCodeBlockRuntimeReady, preloadCodeBlockRuntime } = await import('../src/components/CodeBlockNode/monaco')

    expect(isCodeBlockRuntimeReady()).toBe(false)
    await expect(preloadCodeBlockRuntime()).resolves.toBe(true)
    expect(isCodeBlockRuntimeReady()).toBe(true)
    expect(streamMonaco.preloadMonacoWorkers).toHaveBeenCalledTimes(1)
  })

  it('does not override existing MonacoEnvironment.getWorkerUrl (webpack plugin)', async () => {
    vi.resetModules()
    ;(globalThis as any).MonacoEnvironment = { getWorkerUrl: () => '/editor.worker.js' }

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).not.toHaveBeenCalled()
  })

  it('does not override existing MonacoEnvironment.getWorker (webpack plugin)', async () => {
    vi.resetModules()
    ;(globalThis as any).MonacoEnvironment = { getWorker: () => new (globalThis as any).Worker('') }

    const streamMonaco = await import('stream-monaco')
    ;(streamMonaco.preloadMonacoWorkers as any).mockClear?.()
    const { getUseMonaco } = await import('../src/components/CodeBlockNode/monaco')

    await getUseMonaco()

    expect(streamMonaco.preloadMonacoWorkers).not.toHaveBeenCalled()
  })

  it('retries preload after a transient worker warmup failure', async () => {
    vi.resetModules()
    delete (globalThis as any).MonacoEnvironment

    const streamMonaco = await import('stream-monaco')
    const preloadMock = streamMonaco.preloadMonacoWorkers as any
    preloadMock.mockReset()
    preloadMock
      .mockRejectedValueOnce(new Error('warmup failed'))
      .mockResolvedValue(undefined)

    const { getUseMonaco, isCodeBlockRuntimeReady } = await import('../src/components/CodeBlockNode/monaco')

    await expect(getUseMonaco()).resolves.toBeNull()
    expect(isCodeBlockRuntimeReady()).toBe(false)
    await expect(getUseMonaco()).resolves.toBe(streamMonaco)
    expect(isCodeBlockRuntimeReady()).toBe(true)
    expect(preloadMock).toHaveBeenCalledTimes(2)
  })
})
