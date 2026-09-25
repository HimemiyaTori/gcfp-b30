import type { SongCategory } from '../../data/categories'
export interface LocalizedText { ja: string; en?: string }
export interface Chart {
    id: string
    mode: 'basic' | 'advanced'
    difficulty: 'easy' | 'normal' | 'hard' | 'master'
    level: number
    target?: number; special?: number; combo?: number
    note?: number; goldNote?: number; hold?: number; goldHold?: number
    arrow?: number; goldArrow?: number; square?: number; goldSquare?: number
    advNote?: number; blueNote?: number; redNote?: number; advHold?: number
    advArrow?: number; blueArrow?: number; redArrow?: number
}
export interface Song {
    id: string
    title: LocalizedText
    artist: LocalizedText
    vocal?: LocalizedText
    genre: SongCategory
    coverSourceUrl: string
    coverUrl?: string
    bpm: number
    bpmMax?: number
    pack?: string
    updateAt?: string
    searchAliases?: string[]
    charts: Chart[]
}
