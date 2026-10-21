import type { SongCategory } from '../../data/categories'
export interface LocalizedText { ja: string; en?: string }
export interface Chart {
    id: string
    mode: 'basic' | 'advanced'
    difficulty: 'easy' | 'normal' | 'hard' | 'master'
    level: number
    note?: number; special?: number; combo?: number
    circle?: number; goldCircle?: number; hold?: number; goldHold?: number
    arrow?: number; goldArrow?: number; square?: number; goldSquare?: number
    advNote?: number; leftRightCircle?: number; advHold?: number
    advArrow?: number; leftRightArrow?: number
}
export interface SongUpdate {
    kind: 'free' | 'dlc'
    number: number
    date: string
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
