import { createRecognizer } from './recognizer'
// 手动导入和相册队列共用一个模型，串行识别并在取消后按需重建
let engine: ReturnType<typeof createRecognizer> | undefined
let pending = Promise.resolve()
let currentTrace: Parameters<typeof createRecognizer>[0]
let currentSlow: (() => void) | undefined
export function createSharedRecognizer(trace?: Parameters<typeof createRecognizer>[0], options: { onSlowInference?: () => void } = {}) {
    let disposed = false
    return {
        get disposed() { return disposed },
        dispose() { disposed = true },
        async recognize(file: Blob, signal: AbortSignal) {
            const previous = pending
            let release!: () => void
            pending = new Promise<void>(resolve => { release = resolve })
            await previous
            try {
                signal.throwIfAborted()
                if (disposed) throw new DOMException('取消识别', 'AbortError')
                currentTrace = trace
                currentSlow = options.onSlowInference
                if (!engine || engine.disposed) engine = createRecognizer((area, text) => currentTrace?.(area, text), { onSlowInference: () => currentSlow?.() })
                return await engine.recognize(file, signal)
            } finally { currentTrace = undefined; currentSlow = undefined; release() }
        },
    }
}
