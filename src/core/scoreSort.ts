import type { DemoScore } from '../data/demo'
import { getRankByScore } from './rating/rank'

export type ScoreSortKey = 'title' | 'difficulty' | 'level' | 'score' | 'rank' | 'rating'

const difficulties = ['EASY', 'NORMAL', 'HARD', 'MASTER']
const ranks = ['E', 'D', 'C', 'B', 'A', 'AA', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+']

function levelValue(score: DemoScore): number {
    return Number(score.level.replace('+', '')) + (score.level.includes('+') ? .5 : 0)
}

export function createScoreComparator(
    key: ScoreSortKey,
    language: 'ja' | 'en',
    { primaryOnly = false }: { primaryOnly?: boolean } = {},
) {
    const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' })
    return (a: DemoScore, b: DemoScore): number => {
        const title = collator.compare(a[language], b[language])
        const level = levelValue(a) - levelValue(b)
        const difficulty = difficulties.indexOf(a.difficulty) - difficulties.indexOf(b.difficulty)
        const mode = Number(a.mode === 'ADVANCED') - Number(b.mode === 'ADVANCED')
        const score = a.score - b.score
        const rating = a.rating - b.rating

        switch (key) {
            case 'title': return primaryOnly ? title : title || rating || level || difficulty || mode
            case 'difficulty': return primaryOnly ? difficulty : difficulty || level || mode || rating || title
            case 'level': return primaryOnly ? level : level || difficulty || mode || rating || title
            case 'score': return primaryOnly ? score : score || rating || level || difficulty || mode || title
            case 'rank': {
                const rank = ranks.indexOf(getRankByScore(a.score)) - ranks.indexOf(getRankByScore(b.score))
                return primaryOnly ? rank : rank || score || rating || level || difficulty || mode || title
            }
            case 'rating': return primaryOnly ? rating : rating || score || level || difficulty || mode || title
        }
    }
}
