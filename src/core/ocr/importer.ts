import { liveQuery } from 'dexie'
import { database } from '../../db/database'
import { scoreRepository } from '../../db/scoreRepository'
import { saveRecognition } from '../../db/recognitionRepository'
import { pinia } from '../../stores'
import { useRecognitionStore } from '../../stores/recognition'
import { scoreIdentity } from '../score/import'
import { createPreview } from './preview'
import { createSharedRecognizer } from './shared'
import { errorMessage, t } from '../../i18n'

export const MAX_IMPORT_FILES = 60
let controller: AbortController | undefined
let pending: (File | undefined)[] = []

export function cancelManualImport() {
    controller?.abort()
    pending.fill(undefined)
}

export async function startManualImport(files: File[]) {
    if (files.length > MAX_IMPORT_FILES) throw new Error(t('ocr.tooMany', { count: MAX_IMPORT_FILES }))
    if (!files.length) return
    const store = useRecognitionStore(pinia)
    if (!store.begin('manual')) return
    const task = store.tasks.manual
    const current = new AbortController()
    controller = current
    const queue: (File | undefined)[] = [...files]
    files.length = 0
    pending = queue
    task.jobs = queue.map((file, i) => ({ name: file!.name, index: i + 1, status: 'queued', error: '' }))
    const jobs = task.jobs
    const previews: (Blob | undefined)[] = []
    const sources = queue.slice()
    const seen = new Set<string>()
    let epoch: number | undefined
    let subscription: { unsubscribe(): void } | undefined
    let recognizer: ReturnType<typeof createSharedRecognizer> | undefined
    let recorded = 0
    let failure: string | undefined
    const previewTask = (async () => {
        for (let i = 0; i < sources.length; i++) {
            if (current.signal.aborted) return
            const file = sources[i]
            sources[i] = undefined
            if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) continue
            try {
                const preview = await createPreview(file)
                previews[i] = preview
                if (current.signal.aborted) return
                jobs[i]!.preview = URL.createObjectURL(preview)
            } catch {
                // 预览失败不阻断识别
            }
        }
    })()
    try {
        epoch = (await database.albumState.get('album'))?.datasetEpoch ?? 0
        // 清空成绩后停止旧批次，入库事务还会再次校验代次
        subscription = liveQuery(async () => (await database.albumState.get('album'))?.datasetEpoch ?? 0).subscribe({
            next: value => { if (value !== epoch) current.abort() },
            error: () => current.abort(),
        })
        for (let i = 0; i < queue.length; i++) {
            if (current.signal.aborted) break
            const job = jobs[i]!
            let file = queue[i]
            queue[i] = undefined
            job.status = 'running'
            try {
                if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(t('ocr.errors.type'))
                if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(t('ocr.errors.size'))
                if (!recognizer || recognizer.disposed) recognizer = createSharedRecognizer(undefined, { onSlowInference: () => { task.slow = true } })
                const result = await recognizer.recognize(file, current.signal)
                file = undefined
                current.signal.throwIfAborted()
                if (result.kind === 'skipped') {
                    Object.assign(job, { status: 'skipped', error: result.reason })
                    continue
                }
                const identity = scoreIdentity({ ...result, ...result.achievements })
                if (seen.has(identity)) {
                    Object.assign(job, { status: 'skipped', error: t('ocr.errors.batchDuplicate') })
                    continue
                }
                const saved = await scoreRepository.addOcr(result.songId, result.chartId, result.score, result.achievements, current.signal, epoch)
                current.signal.throwIfAborted()
                seen.add(identity)
                recorded += Number(!saved.skipped)
                Object.assign(job, { status: saved.skipped ? 'skipped' : 'success', error: saved.skipped ? t('ocr.errors.recentDuplicate') : '' })
            } catch (error) {
                if (current.signal.aborted) break
                Object.assign(job, { status: 'failed', error: errorMessage(error, 'ocr.errors.unknown') })
            } finally {
                file = undefined
            }
        }
    } catch (error) {
        if (!current.signal.aborted) failure = task.error = errorMessage(error, 'ocr.errors.unknown')
    } finally {
        subscription?.unsubscribe()
        await previewTask
        if (epoch !== undefined) await saveRecognition('manual', jobs, previews, t('ocr.errors.canceled'), { datasetEpoch: epoch }).catch(() => {})
        for (const job of jobs) if (job.status === 'queued' || job.status === 'running') Object.assign(job, { status: 'skipped', error: failure ?? t('ocr.errors.canceled') })
        queue.fill(undefined)
        sources.fill(undefined)
        pending = []
        controller = undefined
        store.finish('manual', { checked: true, found: jobs.length, recorded, updated: 0, canceled: current.signal.aborted, error: failure })
    }
}
