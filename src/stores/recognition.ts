import { defineStore } from 'pinia'
import type { RecognitionSource } from '../db/models'
import type { ImportJob } from '../core/ocr/models'
import { releasePreviews } from '../core/ocr/preview'

export interface RecognitionRun {
    id: number
    checked: boolean
    found: number
    recorded: number
    updated: number
    failed: number
    skipped: number
    canceled: boolean
    error?: string
}
export interface RecognitionTask {
    id: number
    busy: boolean
    phase: 'idle' | 'checking' | 'importing'
    jobs: ImportJob[]
    slow: boolean
    viewing: boolean
    error: string
    run?: RecognitionRun
}
const initialTask = (): RecognitionTask => ({
    id: 0, busy: false, phase: 'idle', jobs: [], slow: false, viewing: false, error: '',
})

export const useRecognitionStore = defineStore('recognition', {
    state: () => ({ tasks: { manual: initialTask(), album: initialTask() } }),
    getters: {
        activeSource(state): RecognitionSource | undefined {
            if (state.tasks.manual.busy) return 'manual'
            if (state.tasks.album.busy) return 'album'
        },
    },
    actions: {
        begin(source: RecognitionSource, phase: RecognitionTask['phase'] = 'importing') {
            const task = this.tasks[source]
            if (task.busy) return false
            releasePreviews(task.jobs)
            Object.assign(task, { id: task.id + 1, busy: true, phase, jobs: [], slow: false, error: '', run: undefined })
            return true
        },
        finish(source: RecognitionSource, run: Omit<RecognitionRun, 'id' | 'failed' | 'skipped'>) {
            const task = this.tasks[source]
            const count = (status: ImportJob['status']) => task.jobs.filter(job => job.status === status).length
            task.run = { ...run, id: task.id, failed: count('failed'), skipped: count('skipped') }
            task.busy = false
            task.phase = 'idle'
            if (!task.viewing) releasePreviews(task.jobs)
        },
    },
})
