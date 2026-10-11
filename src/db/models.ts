import type { SongCategory } from '../data/categories'
export interface ScoreAchievements {
    // 未提供完成标记时按 false 处理，Max Chain 缺省表示未记录
    fc?: boolean
    ap?: boolean
    maxChain?: number
}
export interface ScoreRecord extends ScoreAchievements {
    id?: number
    songId: string
    chartId: string
    score: number
    rating: number
    source: 'ocr' | 'manual' | 'excel'
    historyId: number
    updatedAt: number
}
export interface ScoreHistory extends Omit<ScoreRecord, 'historyId'> {
    importedAt: number
    batchId: string
    correctedAt?: number
}
export interface RatingSnapshot {
    id?: number
    importedAt: number
    basic: number
    advanced: number
}
export interface RatingCalculationMetadata {
    key: 'calculation'
    ratingRuleVersion: string
    songLibraryVersion: string
}
export interface ScoreRow extends ScoreAchievements {
    id: number
    songId: string
    chartId: string
    ja: string
    en: string
    artist: string
    category: SongCategory
    difficulty: string
    mode: string
    level: string
    score: number
    rating: number
    updatedAt: number
    importedAt?: number
    coverSourceUrl: string
}
