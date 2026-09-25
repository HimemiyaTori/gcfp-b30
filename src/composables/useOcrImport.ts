import { computed, onUnmounted, ref } from 'vue'
import { createRecognizer } from '../core/ocr/recognizer'
import { scoreRepository } from '../db/scoreRepository'

export interface ImportJob {
    name: string
    index: number
    status: 'queued' | 'running' | 'success' | 'failed' | 'skipped'
    error: string
}
export function useOcrImport() {
    const jobs = ref<ImportJob[]>([])
    const completed = computed(
        () =>
            jobs.value.filter((j) => !['queued', 'running'].includes(j.status))
                .length,
    )
    const failures = computed(() =>
        jobs.value.filter((j) => j.status === 'failed'),
    )
    const skipped = computed(() =>
        jobs.value.filter((j) => j.status === 'skipped'),
    )
    const importing = computed(() =>
        jobs.value.some((j) => ['queued', 'running'].includes(j.status)),
    )
    let controller: AbortController | undefined
    let recognizer: ReturnType<typeof createRecognizer> | undefined
    let pending: (File | undefined)[] = []
    function cancel() {
        controller?.abort()
        recognizer?.dispose()
        recognizer = undefined
        pending.fill(undefined)
        pending = []
        jobs.value = []
    }
    async function start(files: File[]) {
        cancel()
        if (files.length > 30) throw new Error('每批最多选择 30 张截图。')
        const current = new AbortController()
        controller = current
        const engine = createRecognizer()
        recognizer = engine
        const queue: (File | undefined)[] = [...files]
        files.length = 0
        pending = queue
        jobs.value = queue.map((file, i) => ({
            name: file!.name,
            index: i + 1,
            status: 'queued',
            error: '',
        }))
        try {
            for (let i = 0; i < queue.length; i++) {
                if (current.signal.aborted) return
                const job = jobs.value[i]!
                let file = queue[i]
                queue[i] = undefined
                job.status = 'running'
                try {
                    if (
                        !file ||
                        !['image/png', 'image/jpeg', 'image/webp'].includes(
                            file.type,
                        )
                    )
                        throw new Error('仅支持 PNG、JPG 或 WebP 图片。')
                    if (!file.size || file.size > 20 * 1024 * 1024)
                        throw new Error('图片不能为空，且不得超过 20 MB。')
                    const result = await engine.recognize(file, current.signal)
                    file = undefined
                    current.signal.throwIfAborted()
                    if (result.kind === 'skipped') {
                        job.status = 'skipped'
                        job.error = result.reason
                    } else {
                        const saved = await scoreRepository.addOcr(
                            result.songId,
                            result.chartId,
                            result.score,
                            result.achievements,
                            current.signal,
                        )
                        current.signal.throwIfAborted()
                        job.status = saved.skipped ? 'skipped' : 'success'
                        job.error = saved.skipped
                            ? '重复成绩，已保留最高分。'
                            : ''
                    }
                } catch (error) {
                    if (current.signal.aborted) return
                    job.status = 'failed'
                    job.error =
                        error instanceof Error
                            ? error.message
                            : '识别或保存失败，请重试。'
                } finally {
                    file = undefined
                }
            }
        } finally {
            queue.fill(undefined)
            engine.dispose()
            if (controller === current) {
                pending = []
                recognizer = undefined
            }
        }
    }
    onUnmounted(cancel)
    return { jobs, completed, failures, skipped, importing, start, cancel }
}
