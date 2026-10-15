import type { ScoreAchievements } from '../../db/models'
import type { Chart } from '../song/models'
import { t } from '../../i18n'

export const MAX_SCORE = 1050000
export const DEFAULT_MAX_CHAIN = 2000
export function getMaxChainLimit(chart?: Pick<Chart, 'combo'>) {
    const combo = chart?.combo
    return Number.isSafeInteger(combo) && combo! >= 0 ? combo! : DEFAULT_MAX_CHAIN
}
export function isValidScore(score: unknown): score is number {
    return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE
}

export function normalizeAchievements(
    value: ScoreAchievements,
): ScoreAchievements {
    for (const flag of [value.fc, value.ap])
        if (flag !== undefined && typeof flag !== 'boolean')
            throw new Error(t('errors.achievementType'))
    if (value.ap && value.fc === false)
        throw new Error(t('errors.apWithoutFc'))
    return {
        fc: value.ap ? true : value.fc ?? false,
        ap: value.ap ?? false,
        maxChain: value.maxChain,
    }
}
export function validateAchievements(value: ScoreAchievements, chart?: Pick<Chart, 'combo'>): ScoreAchievements {
    const max = getMaxChainLimit(chart)
    if (value.maxChain !== undefined && (!Number.isSafeInteger(value.maxChain) || value.maxChain < 0 || value.maxChain > max))
        throw new Error(t('errors.maxChain', { max }))
    return normalizeAchievements(value)
}
export function validateScore(score: number) {
    if (!isValidScore(score))
        throw new Error(t('errors.score'))
}
