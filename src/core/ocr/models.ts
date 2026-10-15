export type ImportJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped'
export type SettledImportStatus = Exclude<ImportJobStatus, 'queued' | 'running'>

export interface ImportJob {
    name: string
    index: number
    status: ImportJobStatus
    error: string
    preview?: string
}
