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
            signal.throwIfAborted()
            const previous = pending
            let release!: () => void
            const turn = new Promise<void>(resolve => { release = resolve })
            // 排队时取消可以立即返回，后续任务仍须等待正在运行的识别
            pending = previous.then(() => turn)
            let acquired = false
            let abort!: () => void
            try {
                await new Promise<void>((resolve, reject) => {
                    abort = () => reject(signal.reason)
                    signal.addEventListener('abort', abort, { once: true })
                    previous.then(resolve)
                })
                signal.removeEventListener('abort', abort)
                signal.throwIfAborted()
                if (disposed) throw new DOMException('取消识别', 'AbortError')
                acquired = true
                currentTrace = trace
                currentSlow = options.onSlowInference
                if (!engine || engine.disposed) engine = createRecognizer((area, text) => currentTrace?.(area, text), { onSlowInference: () => currentSlow?.() })
                return await engine.recognize(file, signal)
            } finally {
                signal.removeEventListener('abort', abort)
                if (acquired) { currentTrace = undefined; currentSlow = undefined }
                release()
            }
        },
    }
}
