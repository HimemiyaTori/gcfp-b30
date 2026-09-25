import type { SongCategory } from '../data/categories'
export interface ScoreAchievements {
    // undefined means unknown (including records created before OCR support).
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
    source: 'ocr' | 'manual'
    createdAt: number
    updatedAt: number
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
    coverSourceUrl: string
}
