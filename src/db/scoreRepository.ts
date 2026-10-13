import versions from '../data/metadata.json'
import { songService } from '../core/song/songService'
import { getChartRating, getTotalRating } from '../core/rating/calculator'
import { database, type ScoreDatabase } from './database'
import type { ScoreAchievements, ScoreHistory, ScoreRecord } from './models'
import Dexie from 'dexie'
import { t } from '../i18n'
import { validateScore, validateAchievements } from '../core/score/validation'
import { mergeBest, scoreIdentity, selectExcelScores, type ImportedScore } from '../core/score/import'
import { initialAlbumState } from './albumModels'

export function createScoreRepository(db: ScoreDatabase, library = songService, version = versions) {
    const tables = [db.scores, db.scoreHistory, db.ratingSnapshots, db.metadata, db.albumItems, db.albumState, db.chartProtections]
    const rating = (row: ImportedScore) => {
        validateScore(row.score)
        return getChartRating(row.score, library.getChart(row.songId, row.chartId).chart.level)
    }
    async function rebuild() {
        const history = (await db.scoreHistory.toArray()).sort((a, b) => (a.playedAt ?? a.importedAt) - (b.playedAt ?? b.importedAt) || a.id! - b.id!)
        const best = new Map<string, ScoreRecord>()
        const snapshots: { playedAt: number; basic: number; advanced: number }[] = []
        for (let i = 0; i < history.length; i++) {
            const entry = history[i]!
            const playedAt = entry.playedAt ?? entry.importedAt
            if (entry.playedAt === undefined) await db.scoreHistory.update(entry.id!, { playedAt })
            const value = rating(entry)
            if (entry.rating !== value) await db.scoreHistory.update(entry.id!, { rating: value })
            const next: ScoreRecord = { id: entry.id, historyId: entry.id!, songId: entry.songId, chartId: entry.chartId, score: entry.score, rating: value, source: entry.source, updatedAt: entry.updatedAt, ...validateAchievements(entry) }
            best.set(entry.chartId, mergeBest(best.get(entry.chartId), next))
            if ((history[i + 1]?.playedAt ?? history[i + 1]?.importedAt) === playedAt) continue
            const total = (mode: 'basic' | 'advanced') => getTotalRating([...best.values()]
                .filter(record => library.getChart(record.songId, record.chartId).chart.mode === mode)
                .map(record => record.rating))
            snapshots.push({ playedAt, basic: total('basic'), advanced: total('advanced') })
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
        return db.scoreHistory.add({ songId: input.songId, chartId: input.chartId, score: input.score, ...details, rating: rating(input), source, importedAt: now, playedAt: source === 'nso_ocr' ? input.updatedAt : now, updatedAt: input.updatedAt ?? now, batchId })
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
        history: () => db.scoreHistory.orderBy('playedAt').reverse().toArray(),
        snapshots: () => db.ratingSnapshots.orderBy('playedAt').toArray(),
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
                if (await db.scores.where('chartId').equals(chartId).count()) throw new Error(t('errors.chartExists'))
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
                if (!record) throw new Error(t('errors.scoreMissing'))
                if (score < record.score && !allowLower) throw new Error(t('errors.lowerUnconfirmed'))
                const details = validateAchievements(achievements ?? record)
                if (scoreIdentity({ ...record, ...details, score }) === scoreIdentity(record)) return
                const onlyChain = record.score === score && record.fc === details.fc && record.ap === details.ap
                await db.scoreHistory.update(record.historyId, { score, ...details, updatedAt: record.source === 'nso_ocr' || onlyChain ? record.updatedAt : Date.now(), correctedAt: Date.now() })
                await db.chartProtections.put({ chartId: record.chartId, reason: 'edit', updatedAt: Date.now() })
                await rebuild()
            })
        },
        async removeHistory(id: number) {
            await db.transaction('rw', tables, async () => {
                const record = await db.scoreHistory.get(id)
                if (record) await db.chartProtections.put({ chartId: record.chartId, reason: 'delete', updatedAt: Date.now() })
                await db.scoreHistory.delete(id)
                await rebuild()
            })
        },
        async clear() {
            await db.transaction('rw', tables, async () => {
                const state = await db.albumState.get('album') ?? initialAlbumState()
                await db.albumState.put({ ...state, datasetEpoch: state.datasetEpoch + 1, autoImport: false })
                await db.scores.clear()
                await db.scoreHistory.clear()
                await db.ratingSnapshots.clear()
            })
        },
        async commitAlbum(accountId: string, mediaId: string, candidate: ImportedScore, reviewedProtectionAt: number) {
            return db.transaction('rw', tables, async () => {
                const item = await db.albumItems.get([accountId, mediaId])
                const state = await db.albumState.get('album')
                if (!item || !state || state.accountId !== accountId || item.datasetEpoch !== state.datasetEpoch || item.bindingGeneration !== state.bindingGeneration) throw new Error(t('album.stale'))
                if (item.stage === 'imported' || item.stage === 'skipped') return { recorded: false, updated: false }
                if (item.stage !== 'needs_review' && item.stage !== 'pending_commit') throw new Error(t('album.stale'))
                const protection = await db.chartProtections.get(candidate.chartId)
                if ((protection?.updatedAt ?? 0) !== reviewedProtectionAt) throw new Error(t('album.protected'))
                const time = candidate.updatedAt
                if (!Number.isSafeInteger(time) || time! < Date.UTC(2017, 0, 1) || time! > Date.now() + 86400000) throw new Error(t('album.invalidTime'))
                const details = validateAchievements(candidate)
                rating(candidate)
                const old = await db.scores.where('chartId').equals(candidate.chartId).first()
                const id = await append({ ...candidate, ...details }, 'nso_ocr', crypto.randomUUID(), Date.now())
                if (id !== undefined) await rebuild()
                await db.albumItems.put({ ...item, candidate: { ...candidate, ...details }, capturedAt: time!, stage: id === undefined ? 'skipped' : 'imported', historyId: id, reason: undefined })
                if (id !== undefined) await db.albumState.put({ ...state, lastImportedAt: Date.now() })
                return { recorded: id !== undefined, updated: id !== undefined && (!old || candidate.score > old.score || (candidate.score === old.score && old.maxChain === undefined && details.maxChain !== undefined)) }
            })
        },
    }
}
export const scoreRepository = createScoreRepository(database)
