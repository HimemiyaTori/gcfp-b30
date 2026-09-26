import {
    parseFields,
    parseStatus,
    type Layout,
    type OcrFields,
    type Recognition,
} from './parser'
// 单次区域推理触发慢速提示的时间，单位为毫秒
const SLOW_INFERENCE_MS = 8000
// 每张图片的识别时限，包含模型下载和初始化，单位为毫秒
const RECOGNITION_TIMEOUT_MS = 120000

// 只观察前台推理耗时，无法据此直接确认浏览器的增强安全开关
function watchSlowInference(signal: AbortSignal, onSlow: () => void) {
    if (signal.aborted || document.visibilityState !== 'visible')
        return () => {}
    let stopped = false
    const stop = () => {
        if (stopped) return
        stopped = true
        clearTimeout(timer)
        signal.removeEventListener('abort', stop)
        document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    const onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') stop()
    }
    const timer = setTimeout(() => {
        stop()
        if (!signal.aborted && document.visibilityState === 'visible') onSlow()
    }, SLOW_INFERENCE_MS)
    signal.addEventListener('abort', stop, { once: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    return stop
}

type Rect = readonly [number, number, number, number]
// 坐标以 1280 × 720 的完整界面为基准，并归一化以适配其他 16:9 尺寸
const rect = (x: number, y: number, w: number, h: number): Rect => [
    x / 1280,
    y / 720,
    w / 1280,
    h / 720,
]
export const regions = {
    header: rect(45, 8, 205, 38),
    result: {
        title: rect(150, 55, 478, 37),
        status: rect(275, 184, 690, 103),
        score: rect(202, 315, 365, 72),
        maxChain: rect(470, 473, 91, 41),
        mode: rect(824, 136, 127, 26),
        difficulty: rect(619, 109, 96, 32),
        level: rect(720, 102, 74, 52),
    },
    select: {
        title: rect(57, 309, 453, 43),
        score: rect(792, 440, 236, 52),
        status: rect(1036, 449, 80, 37),
        mode: rect(1072, 625, 134, 32),
        level: rect(527, 322, 55, 34),
    },
} as const
type Engine = Awaited<
    ReturnType<
        (typeof import('@paddleocr/paddleocr-js'))['PaddleOCR']['create']
    >
>
export function createRecognizer(
    trace?: (area: Rect, text: string) => void,
    options: { onSlowInference?: () => void } = {},
) {
    let engine: Engine | undefined
    let worker: Worker | undefined
    let disposed = false
    let initialization: Promise<Engine> | undefined
    let slowInferenceReported = false
    async function initialize() {
        if (disposed) throw new DOMException('取消识别', 'AbortError')
        if (!initialization)
            initialization = (async () => {
                const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
                if (disposed) throw new DOMException('取消识别', 'AbortError')
                engine = await PaddleOCR.create({
                    lang: 'japan',
                    ocrVersion: 'PP-OCRv5',
                    initialize: false,
                    worker: {
                        createWorker: () => {
                            worker = new Worker(
                                `${import.meta.env.BASE_URL}ocr/worker.js`,
                                { type: 'module' },
                            )
                            return worker
                        },
                    },
                    ortOptions: {
                        backend: 'wasm',
                        numThreads: 1,
                        wasmPaths: new URL(
                            `${import.meta.env.BASE_URL}ocr/`,
                            location.href,
                        ).href,
                    },
                })
                if (disposed) {
                    void engine.dispose()
                    throw new DOMException('取消识别', 'AbortError')
                }
                await engine.initialize()
                return engine
            })().catch((error) => {
                dispose()
                throw error
            })
        return initialization
    }
    function dispose() {
        if (disposed) return
        disposed = true
        void engine?.dispose().catch(() => {})
        // 终止工作线程前先拒绝 SDK 传输请求，包括尚未完成的初始化
        worker?.dispatchEvent(new ErrorEvent('error', { message: '取消识别' }))
        worker?.terminate()
    }
    return {
        get disposed() {
            return disposed
        },
        dispose,
        async recognize(file: Blob, signal: AbortSignal): Promise<Recognition> {
            signal.throwIfAborted()
            if (disposed) throw new DOMException('取消识别', 'AbortError')
            // 为模型下载和推理设置时限，取消时终止工作线程
            const deadline = AbortSignal.timeout(RECOGNITION_TIMEOUT_MS)
            signal = AbortSignal.any([signal, deadline])
            const abort = () => dispose()
            signal.addEventListener('abort', abort, { once: true })
            let bitmap: ImageBitmap | undefined
            const canvas = document.createElement('canvas')
            try {
                bitmap = await createImageBitmap(file)
                signal.throwIfAborted()
                if (
                    bitmap.width < 960 ||
                    Math.abs(bitmap.width / bitmap.height - 16 / 9) > 0.025 ||
                    bitmap.width * bitmap.height > 16777216
                )
                    throw new Error(
                        '请使用至少 960px 宽、不超过 1600 万像素的完整 16:9 游戏截图。',
                    )
                const ocr = await initialize()
                const read = async (area: Rect) => {
                    signal.throwIfAborted()
                    const [x, y, w, h] = area
                    const scale = area === regions.result.score ? 1 : 2
                    canvas.width = Math.round(w * 1280 * scale)
                    canvas.height = Math.round(h * 720 * scale)
                    const context = canvas.getContext('2d')!
                    context.drawImage(
                        bitmap!,
                        x * bitmap!.width,
                        y * bitmap!.height,
                        w * bitmap!.width,
                        h * bitmap!.height,
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                    )
                    // 模型就绪后才观察推理，避免把首次下载误判为浏览器设置问题
                    const prediction = ocr.predict(canvas, {
                        textRecScoreThresh: 0.65,
                    })
                    const stopWatching =
                        !slowInferenceReported &&
                        options.onSlowInference &&
                        /\bEdg\/\d/.test(navigator.userAgent)
                            ? watchSlowInference(signal, () => {
                                  slowInferenceReported = true
                                  options.onSlowInference?.()
                              })
                            : undefined
                    const [result] = await prediction
                        .catch((error) => {
                            dispose()
                            throw error
                        })
                        .finally(stopWatching)
                    signal.throwIfAborted()
                    const text =
                        result?.items
                            .sort((a, b) => {
                                const ay = Math.min(...a.poly.map((p) => p[1])),
                                    by = Math.min(...b.poly.map((p) => p[1]))
                                return area === regions.select.status &&
                                    Math.abs(ay - by) > 5
                                    ? ay - by
                                    : Math.min(...a.poly.map((p) => p[0])) -
                                          Math.min(...b.poly.map((p) => p[0]))
                            })
                            .map((item) => item.text)
                            .join(' ') ?? ''
                    trace?.(area, text)
                    return text
                }
                const header = (await read(regions.header))
                    .replace(/\s/g, '')
                    .toLowerCase()
                let layout: Layout
                if (/results?|リザルト/.test(header)) layout = 'result'
                else if (/selectsong|楽曲選択/.test(header)) layout = 'select'
                else
                    return {
                        kind: 'skipped',
                        reason: '不是支持的结算页或选曲页。',
                    }
                const roi = regions[layout]
                const status = await read(roi.status)
                if (parseStatus(status) === 'mission')
                    return {
                        kind: 'skipped',
                        reason: '故事模式成绩不录入。',
                    }
                const score = await read(roi.score)
                if (
                    layout === 'select' &&
                    parseStatus(status) === 'empty' &&
                    /^0$/.test(score.trim())
                )
                    return { kind: 'skipped', reason: '该谱面尚未游玩。' }
                let difficulty: string
                if (layout === 'result')
                    difficulty = await read(regions.result.difficulty)
                else {
                    // 已选难度卡顶部为亮洋红色边框，未选卡没有此标记
                    canvas.width = 1280
                    canvas.height = 720
                    const context = canvas.getContext('2d', {
                        willReadFrequently: true,
                    })!
                    context.drawImage(bitmap, 0, 0, 1280, 720)
                    const selected = [854, 944, 1034, 1124].map((x) => {
                        const pixels = context.getImageData(
                            x - 27,
                            519,
                            55,
                            9,
                        ).data
                        let count = 0
                        for (let i = 0; i < pixels.length; i += 4)
                            if (
                                pixels[i]! > 175 &&
                                pixels[i + 2]! > 95 &&
                                pixels[i]! > pixels[i + 1]! * 1.5
                            )
                                count++
                        return count
                    })
                    const indexes = selected
                        .map((count, i) => ({ count, i }))
                        .sort((a, b) => b.count - a.count)
                    if (
                        indexes[0]!.count < 25 ||
                        indexes[0]!.count - indexes[1]!.count < 20
                    )
                        throw new Error('无法确认选中的难度。')
                    difficulty = ['easy', 'normal', 'hard', 'master'][
                        indexes[0]!.i
                    ]!
                }
                const fields: OcrFields = {
                    layout,
                    status,
                    score,
                    difficulty,
                    title: await read(roi.title),
                    mode: await read(roi.mode),
                    level: await read(roi.level),
                }
                if (layout === 'result')
                    fields.maxChain = await read(regions.result.maxChain)
                return parseFields(fields)
            } catch (error) {
                if (deadline.aborted)
                    throw new Error(
                        '模型下载或识别超时，请检查网络后重新选择截图。',
                    )
                throw error
            } finally {
                signal.removeEventListener('abort', abort)
                bitmap?.close()
                canvas.width = 0
                canvas.height = 0
            }
        },
    }
}
