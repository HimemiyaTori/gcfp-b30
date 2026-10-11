import versions from '../data/metadata.json'
import { songService } from '../core/song/songService'
import { getChartRating, getTotalRating } from '../core/rating/calculator'
import { database, type ScoreDatabase } from './database'
import type { ScoreAchievements, ScoreHistory, ScoreRecord } from './models'
import Dexie from 'dexie'
import { validateScore, validateAchievements } from '../core/score/validation'
import { mergeBest, scoreIdentity, selectExcelScores, type ImportedScore } from '../core/score/import'

export function createScoreRepository(db: ScoreDatabase, library = songService, version = versions) {
    const tables = [db.scores, db.scoreHistory, db.ratingSnapshots, db.metadata]
    const rating = (row: ImportedScore) => {
        validateScore(row.score)
        return getChartRating(row.score, library.getChart(row.songId, row.chartId).chart.level)
    }
    async function rebuild() {
        const history = (await db.scoreHistory.toArray()).sort((a, b) => a.importedAt - b.importedAt || a.id! - b.id!)
        const best = new Map<string, ScoreRecord>()
        const snapshots: { importedAt: number; basic: number; advanced: number }[] = []
        for (let i = 0; i < history.length; i++) {
            const entry = history[i]!
            const value = rating(entry)
            if (entry.rating !== value) await db.scoreHistory.update(entry.id!, { rating: value })
            const next: ScoreRecord = { id: entry.id, historyId: entry.id!, songId: entry.songId, chartId: entry.chartId, score: entry.score, rating: value, source: entry.source, updatedAt: entry.updatedAt, ...validateAchievements(entry) }
            best.set(entry.chartId, mergeBest(best.get(entry.chartId), next))
            if (history[i + 1]?.batchId === entry.batchId) continue
            const total = (mode: 'basic' | 'advanced') => getTotalRating([...best.values()]
                .filter(record => library.getChart(record.songId, record.chartId).chart.mode === mode)
                .map(record => record.rating))
            snapshots.push({ importedAt: entry.importedAt, basic: total('basic'), advanced: total('advanced') })
        }
        await db.scores.clear()
        await db.ratingSnapshots.clear()
        await db.scores.bulkPut([...best.values()])
        await db.ratingSnapshots.bulkAdd(snapshots)
    }
    async function append(input: ImportedScore, source: ScoreHistory['source'], batchId: string, now: number) {
        const details = validateAchievements(input)
        const latest = await db.scoreHistory.where('[chartId+importedAt]').between([input.chartId, Dexie.minKey], [input.chartId, Dexie.maxKey]).reverse().first()
        if (latest && scoreIdentity(latest) === scoreIdentity(input)) return undefined
        return db.scoreHistory.add({ songId: input.songId, chartId: input.chartId, score: input.score, ...details, rating: rating(input), source, importedAt: now, updatedAt: input.updatedAt ?? now, batchId })
    }
    async function excelPlan(rows: ImportedScore[]) {
        const chosen = selectExcelScores(rows)
        const current = new Map((await db.scores.toArray()).map(row => [row.chartId, row]))
        const selected: ImportedScore[] = []
        const summary = { recorded: 0, added: 0, updated: 0, skipped: chosen.duplicates, ignored: chosen.ignored }
        for (const row of chosen.rows) {
            const latest = await db.scoreHistory.where('[chartId+importedAt]').between([row.chartId, Dexie.minKey], [row.chartId, Dexie.maxKey]).reverse().first()
            if (latest && scoreIdentity(latest) === scoreIdentity(row)) { summary.skipped++; continue }
            selected.push(row)
            summary.recorded++
            const old = current.get(row.chartId)
            if (!old) summary.added++
            else if (row.score > old.score || (row.score === old.score && old.maxChain === undefined && row.maxChain !== undefined)) summary.updated++
        }
        return { selected, summary }
    }
    return {
        async initialize() {
            await db.transaction('rw', tables, async () => {
                const previous = await db.metadata.get('calculation')
                if (previous?.ratingRuleVersion === version.ratingRuleVersion && previous.songLibraryVersion === version.songLibraryVersion) return
                await rebuild()
                await db.metadata.put({ key: 'calculation', ...version })
            })
        },
        list: () => db.scores.orderBy('updatedAt').reverse().toArray(),
        history: () => db.scoreHistory.orderBy('importedAt').reverse().toArray(),
        snapshots: () => db.ratingSnapshots.orderBy('importedAt').toArray(),
        async previewImport(rows: ImportedScore[]) { return db.transaction('r', tables, async () => (await excelPlan(rows)).summary) },
        async importScores(rows: ImportedScore[]) {
            return db.transaction('rw', tables, async () => {
                const { selected, summary } = await excelPlan(rows)
                const now = Date.now(), batch = crypto.randomUUID()
                for (const row of selected) await append(row, 'excel', batch, now)
                if (selected.length) await rebuild()
                return summary
            })
        },
        async addManual(songId: string, chartId: string, score: number, achievements: ScoreAchievements = {}) {
            return db.transaction('rw', tables, async () => {
                if (await db.scores.where('chartId').equals(chartId).count()) throw new Error('该谱面已有成绩，请从成绩列表编辑。')
                const id = await append({ songId, chartId, score, ...achievements }, 'manual', crypto.randomUUID(), Date.now())
                await rebuild()
                return id!
            })
        },
        async addOcr(songId: string, chartId: string, score: number, achievements: ScoreAchievements = {}, signal?: AbortSignal) {
            return db.transaction('rw', tables, async () => {
                signal?.throwIfAborted()
                const transaction = Dexie.currentTransaction!
                const abort = () => transaction.abort()
                signal?.addEventListener('abort', abort, { once: true })
                const cleanup = () => signal?.removeEventListener('abort', abort)
                transaction.on('complete', cleanup)
                transaction.on('abort', cleanup)
                const id = await append({ songId, chartId, score, ...achievements }, 'ocr', crypto.randomUUID(), Date.now())
                if (id !== undefined) await rebuild()
                signal?.throwIfAborted()
                return { id, skipped: id === undefined }
            })
        },
        async edit(id: number, score: number, allowLower = false, achievements?: ScoreAchievements) {
            return db.transaction('rw', tables, async () => {
                validateScore(score)
                const record = await db.scores.get(id)
                if (!record) throw new Error('成绩已不存在，请刷新列表。')
                if (score < record.score && !allowLower) throw new Error('调低成绩需要确认。')
                const details = validateAchievements(achievements ?? record)
                if (scoreIdentity({ ...record, ...details, score }) === scoreIdentity(record)) return
                await db.scoreHistory.update(record.historyId, { score, ...details, updatedAt: Date.now(), correctedAt: Date.now() })
                await rebuild()
            })
        },
        async removeHistory(id: number) {
            await db.transaction('rw', tables, async () => {
                await db.scoreHistory.delete(id)
                await rebuild()
            })
        },
        async clear() {
            await db.transaction('rw', tables, async () => {
                await db.scores.clear()
                await db.scoreHistory.clear()
                await db.ratingSnapshots.clear()
            })
        },
    }
}
export const scoreRepository = createScoreRepository(database)
