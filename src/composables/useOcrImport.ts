import { computed, onUnmounted, ref } from 'vue'
import { createRecognizer } from '../core/ocr/recognizer'
import { scoreRepository } from '../db/scoreRepository'
import { scoreIdentity } from '../core/score/import'
import { t } from '../i18n'

export const MAX_IMPORT_FILES = 60

export interface ImportJob {
    name: string
    index: number
    status: 'queued' | 'running' | 'success' | 'failed' | 'skipped'
    error: string
}
export function useOcrImport() {
    const jobs = ref<ImportJob[]>([])
    const edgeSecurityHint = ref(false)
    let edgeSecurityHintDismissed = false
    function dismissEdgeSecurityHint() {
        edgeSecurityHint.value = false
        edgeSecurityHintDismissed = true
    }
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
        // 仅中断进行中的批次，关闭已完成的弹窗时保留模型会话
        if (controller) {
            controller.abort()
            recognizer?.dispose()
            recognizer = undefined
            controller = undefined
        }
        pending.fill(undefined)
        pending = []
        jobs.value = []
    }
    async function start(files: File[]) {
        if (files.length > MAX_IMPORT_FILES) throw new Error(t('ocr.tooMany', { count: MAX_IMPORT_FILES }))
        cancel()
        if (!files.length) return
        const current = new AbortController()
        const seen = new Set<string>()
        controller = current
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
                        throw new Error(t('ocr.errors.type'))
                    if (!file.size || file.size > 20 * 1024 * 1024)
                        throw new Error(t('ocr.errors.size'))
                    // 正常批次复用工作线程，超时或初始化失败后按需重建
                    if (!recognizer || recognizer.disposed)
                        recognizer = createRecognizer(undefined, {
                            onSlowInference: () => {
                                if (!edgeSecurityHintDismissed)
                                    edgeSecurityHint.value = true
                            },
                        })
                    const result = await recognizer.recognize(
                        file,
                        current.signal,
                    )
                    file = undefined
                    current.signal.throwIfAborted()
                    if (result.kind === 'skipped') {
                        job.status = 'skipped'
                        job.error = result.reason
                    } else {
                        const identity = scoreIdentity({ ...result, ...result.achievements })
                        if (seen.has(identity)) { job.status = 'skipped'; job.error = t('ocr.errors.batchDuplicate'); continue }
                        const saved = await scoreRepository.addOcr(
                            result.songId,
                            result.chartId,
                            result.score,
                            result.achievements,
                            current.signal,
                        )
                        current.signal.throwIfAborted()
                        seen.add(identity)
                        job.status = saved.skipped ? 'skipped' : 'success'
                        job.error = saved.skipped
                            ? t('ocr.errors.recentDuplicate')
                            : ''
                    }
                } catch (error) {
                    if (current.signal.aborted) return
                    job.status = 'failed'
                    job.error =
                        error instanceof Error
                            ? error.message
                            : t('ocr.errors.unknown')
                } finally {
                    file = undefined
                }
            }
        } finally {
            queue.fill(undefined)
            if (controller === current) {
                pending = []
                controller = undefined
            }
        }
    }
    onUnmounted(() => {
        cancel()
        recognizer?.dispose()
        recognizer = undefined
    })
    return {
        jobs,
        completed,
        failures,
        skipped,
        importing,
        edgeSecurityHint,
        dismissEdgeSecurityHint,
        start,
        cancel,
    }
}
