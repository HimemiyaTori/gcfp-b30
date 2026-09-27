import type { ScoreRow } from '../../db/models'
import type { SongCategory } from '../../data/categories'
import { searchSongs } from '../search/songSearch'

export interface ScoreFiltersState {
    query: string
    category: SongCategory | 'ALL'
    mode: string
    difficulty: string
}
export function createScoreFilters(): ScoreFiltersState {
    return { query: '', category: 'ALL', mode: 'ALL', difficulty: 'ALL' }
}
export function hasScoreFilters(filters: ScoreFiltersState) {
    return Boolean(filters.query.trim()) || filters.category !== 'ALL' || filters.mode !== 'ALL' || filters.difficulty !== 'ALL'
}
export function filterScores(items: readonly ScoreRow[], filters: ScoreFiltersState) {
    const matches = new Set(searchSongs(filters.query).map(song => song.id))
    return items.filter(score => matches.has(score.songId)
        && (filters.category === 'ALL' || score.category === filters.category)
        && (filters.mode === 'ALL' || score.mode === filters.mode)
        && (filters.difficulty === 'ALL' || score.difficulty === filters.difficulty))
}
