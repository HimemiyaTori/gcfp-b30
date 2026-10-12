import type { ScoreRow } from '../../db/models'
import type { SongCategory } from '../../data/categories'
import { searchSongs } from '../search/songSearch'

const defaultLevelMin = 1
const defaultLevelMax = 14.5

export interface ScoreFiltersState {
    query: string
    category: SongCategory | 'ALL'
    mode: string
    difficulty: string
    levelMin: string
    levelMax: string
}
export function createScoreFilters(): ScoreFiltersState {
    return { query: '', category: 'ALL', mode: 'ALL', difficulty: 'ALL', levelMin: '', levelMax: '' }
}
export function sanitizeLevelInput(value: string) {
    const cleaned = value.replace(/[^\d+]/g, '').replace(/^\++/, '')
    const digits = /^\d{0,2}/.exec(cleaned)?.[0] ?? ''
    const plus = cleaned.slice(digits.length).includes('+')
    if (!digits) return ''
    return plus ? `${digits}+` : digits
}
function levelValue(level: string) {
    return Number(level.replace('+', '')) + (level.endsWith('+') ? .5 : 0)
}
function levelBound(input: string, fallback: number) {
    return /^\d{1,2}\+?$/.test(input) ? levelValue(input) : fallback
}
export function hasScoreFilters(filters: ScoreFiltersState) {
    const min = levelBound(filters.levelMin, defaultLevelMin)
    const max = levelBound(filters.levelMax, defaultLevelMax)
    return Boolean(filters.query.trim()) || filters.category !== 'ALL' || filters.mode !== 'ALL' || filters.difficulty !== 'ALL' || min !== defaultLevelMin || max !== defaultLevelMax
}
export function filterScores<T extends Pick<ScoreRow, 'songId' | 'category' | 'mode' | 'difficulty' | 'level'>>(items: readonly T[], filters: ScoreFiltersState) {
    const matches = new Set(searchSongs(filters.query).map(song => song.id))
    const min = levelBound(filters.levelMin, defaultLevelMin)
    const max = levelBound(filters.levelMax, defaultLevelMax)
    return items.filter(score => matches.has(score.songId)
        && (filters.category === 'ALL' || score.category === filters.category)
        && (filters.mode === 'ALL' || score.mode === filters.mode)
        && (filters.difficulty === 'ALL' || score.difficulty === filters.difficulty)
        && levelValue(score.level) >= min && levelValue(score.level) <= max)
}
