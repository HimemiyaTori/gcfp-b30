import type { ImportedScore } from '../core/score/import'
export type AlbumStage = 'discovered' | 'downloading' | 'recognizing' | 'needs_review' | 'pending_commit' | 'imported' | 'skipped' | 'rejected' | 'retry_wait' | 'failed' | 'expired' | 'canceled'
export interface AlbumState {
    key: 'album'
    accountId?: string
    bindingId?: string
    datasetEpoch: number
    bindingGeneration: number
    nextAllowedAt: number
    lastCheckedAt?: number
    lastImportedAt?: number
    autoImport: boolean
}
export interface AlbumItem {
    accountId: string
    mediaId: string
    applicationId: string
    capturedAt: number | null
    contentHash?: string
    datasetEpoch: number
    bindingGeneration: number
    stage: AlbumStage
    attempts: number
    retryAt?: number
    candidate?: ImportedScore
    evidence?: string[]
    reason?: string
    recognitionVersion: string
    historyId?: number
}
export interface ChartProtection { chartId: string; updatedAt: number; reason: 'edit' | 'delete' }
export const initialAlbumState = (): AlbumState => ({ key: 'album', datasetEpoch: 0, bindingGeneration: 0, nextAllowedAt: 0, autoImport: false })
