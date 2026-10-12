import type { ScoreAchievements, ScoreRecord } from '../../db/models'
import { songService } from '../song/songService'
import { validateAchievements, validateScore } from './validation'
import { t } from '../../i18n'

export interface ImportedScore extends ScoreAchievements {
    songId: string
    chartId: string
    score: number
    updatedAt?: number
}
export function validateImportedScore(value: ImportedScore): ImportedScore {
    validateScore(value.score)
    songService.getChart(value.songId, value.chartId)
    if (value.updatedAt !== undefined && (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || value.updatedAt > 8640000000000000))
        throw new Error(t('errors.time'))
    return { ...value, ...validateAchievements(value) }
}
export function scoreIdentity(value: ImportedScore) {
    const flags = validateAchievements(value)
    return JSON.stringify([value.chartId, value.score, flags.maxChain ?? null, flags.fc, flags.ap])
}
export function selectExcelScores(incoming: ImportedScore[]) {
    const selected = new Map<string, ImportedScore>()
    const identities = new Set<string>()
    let duplicates = 0
    for (const input of incoming) {
        const row = validateImportedScore(input)
        const identity = scoreIdentity(row)
        if (identities.has(identity)) duplicates++
        identities.add(identity)
        const old = selected.get(row.chartId)
        if (!old || row.score > old.score || (row.score === old.score && (row.updatedAt ?? -1) >= (old.updatedAt ?? -1))) selected.set(row.chartId, row)
    }
    return { rows: [...selected.values()], duplicates, ignored: incoming.length - selected.size - duplicates }
}
export function mergeBest(old: ScoreRecord | undefined, next: ScoreRecord): ScoreRecord {
    if (!old || next.score > old.score) return next
    if (next.score < old.score) return old
    // 完成标记已规范化为布尔值，同分只补未记录的 Max Chain
    return old.maxChain === undefined && next.maxChain !== undefined
        ? { ...old, maxChain: next.maxChain }
        : old
}
