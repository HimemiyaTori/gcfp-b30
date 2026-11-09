import type { SongCategory } from '../../data/categories'
export interface LocalizedText {
    ja: string
    en?: string
}
export type ChartMode = 'basic' | 'advanced'
export type ChartDifficulty = 'easy' | 'normal' | 'hard' | 'master'
export interface Chart {
    id: string
    mode: ChartMode
    difficulty: ChartDifficulty
    level: number
    note: number | null
    special: number | null
    combo: number | null
    circle: number | null
    goldCircle?: number
    hold: number | null
    goldHold?: number
    arrow: number | null
    goldArrow?: number
    square: number | null
    goldSquare?: number
    advCircle?: number | null
    leftRightCircle?: number | null
    advHold?: number | null
    advArrow?: number | null
    leftRightArrow?: number | null
}
export interface SongUpdate {
    kind: 'free' | 'dlc'
    number: number
    date: string
}
// 曲库文件按难度合并物量。null 表示尚未录入，0 表示已确认是 0
export interface ChartNotes {
    circle: number | null
    advCircle: number | null
    leftRightCircle: number | null
    square: number | null
    hold: number | null
    advHold: number | null
    arrow: number | null
    advArrow: number | null
    leftRightArrow: number | null
}
export interface ChartStats {
    level: number
    combo: number | null
    special: number | null
}
export interface StoredDifficulty {
    notes: ChartNotes
    basic: ChartStats
    advanced: ChartStats
}
export interface StoredSong {
    id: string
    title: LocalizedText
    artist: LocalizedText
    vocal?: LocalizedText
    genre: SongCategory
    coverSourceUrl: string
    bpm: number
    bpmMax?: number
    pack?: string
    updateAt?: SongUpdate
    searchAliases?: string[]
    charts: Record<ChartDifficulty, StoredDifficulty>
}
export interface Song {
    id: string
    title: LocalizedText
    artist: LocalizedText
    vocal?: LocalizedText
    genre: SongCategory
    coverSourceUrl: string
    bpm: number
    bpmMax?: number
    pack?: string
    updateAt?: SongUpdate
    searchAliases?: string[]
    charts: Chart[]
}
