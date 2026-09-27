import type { ScoreAchievements } from '../../db/models'

export const MAX_SCORE = 1050000
export function isValidScore(score: unknown): score is number {
    return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE
}

export function validateAchievements(
    value: ScoreAchievements,
): ScoreAchievements {
    for (const flag of [value.fc, value.ap])
        if (flag !== undefined && typeof flag !== 'boolean')
            throw new Error('FC / AP 必须为布尔值。')
    if (
        value.maxChain !== undefined &&
        (!Number.isSafeInteger(value.maxChain) || value.maxChain < 0)
    )
        throw new Error('Max Chain 必须为非负整数，或留空。')
    if (value.ap && value.fc === false)
        throw new Error('AP 成绩必须同时为 FC。')
    return {
        fc: value.ap ? true : value.fc,
        ap: value.ap,
        maxChain: value.maxChain,
    }
}
export function validateScore(score: number) {
    if (!isValidScore(score))
        throw new Error('Score 必须为 0～1,050,000 范围内的整数。')
}
