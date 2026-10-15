import { liveQuery } from 'dexie'
import { onUnmounted, shallowRef } from 'vue'
import { database } from './database'
import type { RecognitionJob, RecognitionSource } from './models'
import type { ImportJob } from '../composables/useOcrImport'

export interface RecognitionSummary { finishedAt: number; total: number; failed: number; skipped: number }
const settled = (job: ImportJob) => job.status !== 'queued' && job.status !== 'running'

// 一张都没处理完就中断的批次不覆盖上一次结果，未完成的截图按 pending 原因保存
export async function saveRecognition(key: RecognitionSource, jobs: ImportJob[], previews: (Blob | undefined)[], pending: string) {
    if (!jobs.some(settled)) return
    await database.recognitionRuns.put({
        key,
        finishedAt: Date.now(),
        jobs: jobs.map((job, i): RecognitionJob => ({
            name: job.name,
            index: job.index,
            ...(settled(job) ? { status: job.status as RecognitionJob['status'], error: job.error } : { status: 'skipped', error: pending }),
            preview: previews[i],
        })),
    })
}
// 返回的预览地址由调用方用 releasePreviews 释放
export async function loadRecognition(key: RecognitionSource) {
    const run = await database.recognitionRuns.get(key)
    if (!run) return
    return {
        finishedAt: run.finishedAt,
        jobs: run.jobs.map(({ preview, ...job }): ImportJob => ({ ...job, preview: preview && URL.createObjectURL(preview) })),
    }
}
export function useRecognitionSummary(key: RecognitionSource) {
    const summary = shallowRef<RecognitionSummary>()
    const subscription = liveQuery(async () => {
        const run = await database.recognitionRuns.get(key)
        if (!run) return
        const count = (status: RecognitionJob['status']) => run.jobs.filter(job => job.status === status).length
        return { finishedAt: run.finishedAt, total: run.jobs.length, failed: count('failed'), skipped: count('skipped') }
    }).subscribe({
        next: value => { summary.value = value },
        error: () => { summary.value = undefined },
    })
    onUnmounted(() => subscription.unsubscribe())
    return summary
}
