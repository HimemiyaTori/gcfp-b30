import type { ScoreAchievements, ScoreRecord } from '../../db/models'
import { songService } from '../song/songService'
import { getChartRating } from '../rating/calculator'
import { validateAchievements, validateScore } from './validation'

export interface ImportedScore extends ScoreAchievements {
    songId: string
    chartId: string
    score: number
    createdAt?: number
    updatedAt?: number
}

export function validateImportedScore(value: ImportedScore): ImportedScore {
    validateScore(value.score)
    songService.getChart(value.songId, value.chartId)
    for (const time of [value.createdAt, value.updatedAt]) {
        if (time !== undefined && (!Number.isSafeInteger(time) || time < 0 || time > 8640000000000000))
            throw new Error('时间必须为有效的日期时间。')
    }
    if (value.createdAt !== undefined && value.updatedAt !== undefined && value.createdAt > value.updatedAt)
        throw new Error('创建时间不能晚于更新时间。')
    return { ...value, ...validateAchievements(value) }
}

export function planScoreImport(incoming: ImportedScore[], existing: ScoreRecord[], now = Date.now()) {
    const records = new Map(existing.map(record => [record.chartId, record]))
    const seen = new Set<string>()
    const writes: ScoreRecord[] = []
    const summary = { added: 0, updated: 0, skipped: 0 }
    for (const input of incoming) {
        const row = validateImportedScore(input)
        if (seen.has(row.chartId)) throw new Error('文件中有重复谱面，请每张谱面只保留一行。')
        seen.add(row.chartId)
        const old = records.get(row.chartId)
        if (old && row.score < old.score) { summary.skipped++; continue }
        const rating = getChartRating(row.score, songService.getChart(row.songId, row.chartId).chart.level)
        if (old && row.score === old.score) {
            const details = {
                fc: old.fc ?? row.fc,
                ap: old.ap ?? row.ap,
                maxChain: old.maxChain ?? row.maxChain,
            }
            // 同分仅补未知信息，不能用导入值推翻已有完成标记
            if (details.ap && details.fc === false) details.ap = old.ap
            const achievementsChanged = details.fc !== old.fc || details.ap !== old.ap
            if (!achievementsChanged && details.maxChain === old.maxChain) { summary.skipped++; continue }
            writes.push({ ...old, ...details, rating, source: 'excel', updatedAt: achievementsChanged ? Math.max(old.createdAt, now) : old.updatedAt })
            summary.updated++
        } else {
            const updatedAt = Math.max(old?.createdAt ?? 0, row.updatedAt ?? now, row.createdAt ?? 0)
            writes.push({
                ...(old ? { id: old.id } : {}),
                songId: row.songId, chartId: row.chartId, score: row.score, rating,
                fc: row.fc, ap: row.ap, maxChain: row.maxChain, source: 'excel',
                createdAt: old?.createdAt ?? row.createdAt ?? updatedAt, updatedAt,
            })
            if (old) summary.updated++
            else summary.added++
        }
    }
    return { summary, writes }
}
