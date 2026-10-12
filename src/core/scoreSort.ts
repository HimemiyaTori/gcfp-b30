import { getRankByScore } from './rating/rank'

export type ScoreSortKey = 'title' | 'difficulty' | 'level' | 'score' | 'rank' | 'rating' | 'updatedAt' | 'importedAt'
export type ScoreTableSortKey = ScoreSortKey | 'position'
export interface ScoreTableSort {
    key: ScoreTableSortKey
    ascending: boolean
}
export interface SortableChart {
    ja: string
    en: string
    difficulty: string
    mode: string
    level: string
    score?: number
    rating?: number
    updatedAt?: number
    importedAt?: number
}

const difficulties = ['EASY', 'NORMAL', 'HARD', 'MASTER']
const ranks = ['E', 'D', 'C', 'B', 'A', 'AA', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+']

function levelValue(score: SortableChart): number {
    return Number(score.level.replace('+', '')) + (score.level.includes('+') ? .5 : 0)
}
function numberDelta(left?: number, right?: number) {
    if (left == null || right == null) return 0
    return left - right
}

export function lacksSortMetric(row: SortableChart, key: ScoreSortKey) {
    if (key === 'score' || key === 'rank' || key === 'rating') return row.score == null
    if (key === 'updatedAt') return row.updatedAt == null
    if (key === 'importedAt') return row.importedAt == null
    return false
}

export function compareChartIdentity(a: SortableChart, b: SortableChart, language: 'ja' | 'en') {
    const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' })
    const title = collator.compare(a[language], b[language])
    const mode = Number(a.mode === 'ADVANCED') - Number(b.mode === 'ADVANCED')
    const difficulty = difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty)
    return title || mode || difficulty
}

export function createScoreComparator(
    key: ScoreSortKey,
    language: 'ja' | 'en',
    { primaryOnly = false }: { primaryOnly?: boolean } = {},
) {
    const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' })
    return (a: SortableChart, b: SortableChart): number => {
        const title = collator.compare(a[language], b[language])
        const level = levelValue(a) - levelValue(b)
        const difficulty = difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty)
        const mode = Number(a.mode === 'ADVANCED') - Number(b.mode === 'ADVANCED')
        const score = numberDelta(a.score, b.score)
        const rating = numberDelta(a.rating, b.rating)

        switch (key) {
            case 'title': return primaryOnly ? title : title || rating || level || difficulty || mode
            case 'difficulty': return primaryOnly ? difficulty : difficulty || level || mode || rating || title
            case 'level': return primaryOnly ? level : level || difficulty || mode || rating || title
            case 'score': return primaryOnly ? score : score || rating || level || difficulty || mode || title
            case 'rank': {
                if (a.score == null || b.score == null) return 0
                const rank = ranks.indexOf(getRankByScore(a.score)) - ranks.indexOf(getRankByScore(b.score))
                return primaryOnly ? rank : rank || score || rating || level || difficulty || mode || title
            }
            case 'rating': return primaryOnly ? rating : rating || score || level || difficulty || mode || title
            case 'updatedAt': return numberDelta(a.updatedAt, b.updatedAt)
            case 'importedAt': return numberDelta(a.importedAt, b.importedAt)
        }
    }
}
