import type { ScoreAchievements } from '../../db/models'
import { t } from '../../i18n'

export const MAX_SCORE = 1050000
export function isValidScore(score: unknown): score is number {
    return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE
}

export function validateAchievements(
    value: ScoreAchievements,
): ScoreAchievements {
    for (const flag of [value.fc, value.ap])
        if (flag !== undefined && typeof flag !== 'boolean')
            throw new Error(t('errors.achievementType'))
    if (
        value.maxChain !== undefined &&
        (!Number.isSafeInteger(value.maxChain) || value.maxChain < 0)
    )
        throw new Error(t('errors.maxChain'))
    if (value.ap && value.fc === false)
        throw new Error(t('errors.apWithoutFc'))
    return {
        fc: value.ap ? true : value.fc ?? false,
        ap: value.ap ?? false,
        maxChain: value.maxChain,
    }
}
export function validateScore(score: number) {
    if (!isValidScore(score))
        throw new Error(t('errors.score'))
}
