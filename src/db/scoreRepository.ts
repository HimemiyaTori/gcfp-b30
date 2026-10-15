import versions from '../data/metadata.json'
import { songService } from '../core/song/songService'
import { getChartRating, getTotalRating } from '../core/rating/calculator'
import { database, type ScoreDatabase } from './database'
import type { RatingSnapshot, ScoreAchievements, ScoreHistory, ScoreRecord } from './models'
import Dexie from 'dexie'
import { t } from '../i18n'
import { validateScore, validateAchievements, normalizeAchievements } from '../core/score/validation'
import { DomainError } from '../core/errors'
import { mergeBest, scoreIdentity, selectExcelScores, type ImportedScore } from '../core/score/import'
import { initialAlbumState } from './albumModels'

export function createScoreRepository(db: ScoreDatabase, library = songService, version = versions) {
    const tables = [db.scores, db.scoreHistory, db.ratingSnapshots, db.metadata, db.albumItems, db.albumState]
    const rating = (row: ImportedScore) => {
        validateScore(row.score)
        return getChartRating(row.score, library.getChart(row.songId, row.chartId).chart.level)
    }
    const playedAt = (row: ScoreHistory) => row.playedAt ?? row.importedAt
    const chronological = (a: ScoreHistory, b: ScoreHistory) => playedAt(a) - playedAt(b) || a.id! - b.id!
    const recordFrom = (entry: ScoreHistory, value = entry.rating): ScoreRecord => ({
        id: entry.id, historyId: entry.id!, songId: entry.songId, chartId: entry.chartId,
        score: entry.score, rating: value, source: entry.source, updatedAt: entry.updatedAt,
        // 旧历史保留原始完成信息，新上限只校验录入与修改，避免阻断整个成绩库
        ...normalizeAchievements(entry),
    })
    function projection(records: ScoreRecord[] = []) {
        const best = new Map(records.map(record => [record.chartId, record]))
        const ratings = { basic: new Map<string, number>(), advanced: new Map<string, number>() }
        type Mode = keyof typeof ratings
        const dirty = new Set<Mode>(['basic', 'advanced'])
        const totals = { basic: 0, advanced: 0 }
        for (const record of records) ratings[library.getChart(record.songId, record.chartId).chart.mode].set(record.chartId, record.rating)
        return {
            best,
            merge(entry: ScoreHistory, value = entry.rating) {
                const old = best.get(entry.chartId)
                const next = mergeBest(old, recordFrom(entry, value))
                best.set(entry.chartId, next)
                if (old?.rating !== next.rating) {
                    const mode = library.getChart(next.songId, next.chartId).chart.mode
                    ratings[mode].set(next.chartId, next.rating)
                    dirty.add(mode)
                }
                return next !== old
            },
            snapshot(time: number): RatingSnapshot {
                for (const mode of dirty) totals[mode] = getTotalRating([...ratings[mode].values()])
                dirty.clear()
                return { playedAt: time, ...totals }
            },
        }
    }
    async function rebuild() {
        const history = (await db.scoreHistory.toArray()).sort(chronological)
        const current = projection()
        const snapshots: RatingSnapshot[] = []
        for (let i = 0; i < history.length; i++) {
            const entry = history[i]!
            const time = playedAt(entry)
            if (entry.playedAt === undefined) await db.scoreHistory.update(entry.id!, { playedAt: time })
            const value = rating(entry)
            if (entry.rating !== value) await db.scoreHistory.update(entry.id!, { rating: value })
            current.merge(entry, value)
            if (history[i + 1] && playedAt(history[i + 1]!) === time) continue
            snapshots.push(current.snapshot(time))
        }
        await db.scores.clear()
        await db.ratingSnapshots.clear()
        await db.scores.bulkPut([...current.best.values()])
        await db.ratingSnapshots.bulkAdd(snapshots)
    }
    async function projectAppended(entries: ScoreHistory[]) {
        if (!entries.length) return
        entries.sort(chronological)
        const latest = await db.ratingSnapshots.orderBy('playedAt').last()
        // 旧图补录或系统时间回拨会改变后续走势，交回完整重建
        if (latest && playedAt(entries[0]!) < latest.playedAt) return rebuild()
        const records = await db.scores.toArray()
        const current = projection(records)
        const changed = new Set<string>()
        const snapshots: RatingSnapshot[] = []
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!
            if (current.merge(entry)) changed.add(entry.chartId)
            const time = playedAt(entry)
            if (entries[i + 1] && playedAt(entries[i + 1]!) === time) continue
            const snapshot = current.snapshot(time)
            // 同一毫秒的批次合并为一个快照，保留原快照主键
            if (latest?.playedAt === time) await db.ratingSnapshots.put({ ...snapshot, id: latest.id })
            else snapshots.push(snapshot)
        }
        const replacements = [...changed].map(chartId => current.best.get(chartId)!)
        await db.scores.bulkDelete(records.filter(record => changed.has(record.chartId) && current.best.get(record.chartId)!.id !== record.id).map(record => record.id!))
        await db.scores.bulkPut(replacements)
        await db.ratingSnapshots.bulkAdd(snapshots)
    }
    async function rebuildChart(chartId: string) {
        const history = (await db.scoreHistory.where('chartId').equals(chartId).toArray()).sort(chronological)
        let best: ScoreRecord | undefined
        for (const entry of history) best = mergeBest(best, recordFrom(entry))
        const old = await db.scores.where('chartId').equals(chartId).first()
        if (old && old.id !== best?.id) await db.scores.delete(old.id!)
        if (best) await db.scores.put(best)
    }
    async function append(input: ImportedScore, source: ScoreHistory['source'], batchId: string, now: number) {
        const details = validateAchievements(input, library.getChart(input.songId, input.chartId).chart)
        const latest = await db.scoreHistory.where('[chartId+importedAt]').between([input.chartId, Dexie.minKey], [input.chartId, Dexie.maxKey]).reverse().first()
        if (latest && scoreIdentity(latest) === scoreIdentity(input)) return undefined
        const entry: ScoreHistory = { songId: input.songId, chartId: input.chartId, score: input.score, ...details, rating: rating(input), source, importedAt: now, playedAt: source === 'nso_ocr' ? input.updatedAt : now, updatedAt: input.updatedAt ?? now, batchId }
        const id = await db.scoreHistory.add(entry)
        return { ...entry, id }
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
                const entries: ScoreHistory[] = []
                for (const row of selected) {
                    const entry = await append(row, 'excel', batch, now)
                    if (entry) entries.push(entry)
                }
                await projectAppended(entries)
                return summary
            })
        },
        async addManual(songId: string, chartId: string, score: number, achievements: ScoreAchievements = {}) {
            return db.transaction('rw', tables, async () => {
                if (await db.scores.where('chartId').equals(chartId).count()) throw new Error(t('errors.chartExists'))
                const entry = await append({ songId, chartId, score, ...achievements }, 'manual', crypto.randomUUID(), Date.now())
                if (entry) await projectAppended([entry])
                return entry!.id
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
                const entry = await append({ songId, chartId, score, ...achievements }, 'ocr', crypto.randomUUID(), Date.now())
                if (entry) await projectAppended([entry])
                signal?.throwIfAborted()
                return { id: entry?.id, skipped: !entry }
            })
        },
        async edit(id: number, score: number, allowLower = false, achievements?: ScoreAchievements) {
            return db.transaction('rw', tables, async () => {
                validateScore(score)
                const record = await db.scores.get(id)
                if (!record) throw new Error(t('errors.scoreMissing'))
                if (score < record.score && !allowLower) throw new Error(t('errors.lowerUnconfirmed'))
                const details = validateAchievements(achievements ?? record, library.getChart(record.songId, record.chartId).chart)
                if (scoreIdentity({ ...record, ...details, score }) === scoreIdentity(record)) return
                const onlyChain = record.score === score && record.fc === details.fc && record.ap === details.ap
                await db.scoreHistory.update(record.historyId, { score, ...details, updatedAt: record.source === 'nso_ocr' || onlyChain ? record.updatedAt : Date.now(), correctedAt: Date.now() })
                if (score === record.score) await rebuildChart(record.chartId)
                else await rebuild()
            })
        },
        async removeHistory(id: number) {
            await db.transaction('rw', tables, async () => {
                await db.scoreHistory.delete(id)
                await rebuild()
            })
        },
        async clear() {
            await db.transaction('rw', [...tables, db.recognitionRuns], async () => {
                const state = await db.albumState.get('album') ?? initialAlbumState()
                await db.albumState.put({ ...state, datasetEpoch: state.datasetEpoch + 1, autoImport: false })
                await db.scores.clear()
                await db.scoreHistory.clear()
                await db.ratingSnapshots.clear()
                await db.recognitionRuns.clear()
            })
        },
        async commitAlbum(accountId: string, mediaId: string, candidate: ImportedScore) {
            return db.transaction('rw', tables, async () => {
                const item = await db.albumItems.get([accountId, mediaId])
                const state = await db.albumState.get('album')
                if (!item || !state || state.accountId !== accountId || item.datasetEpoch !== state.datasetEpoch || item.bindingGeneration !== state.bindingGeneration) throw new DomainError('album.stale')
                if (item.stage === 'imported' || item.stage === 'skipped') return { recorded: false, updated: false }
                if (item.stage !== 'needs_review' && item.stage !== 'pending_commit') throw new DomainError('album.stale')
                const time = candidate.updatedAt
                if (!Number.isSafeInteger(time) || time! < Date.UTC(2017, 0, 1) || time! > Date.now() + 86400000) throw new Error(t('album.invalidTime'))
                const details = validateAchievements(candidate, library.getChart(candidate.songId, candidate.chartId).chart)
                rating(candidate)
                const old = await db.scores.where('chartId').equals(candidate.chartId).first()
                const entry = await append({ ...candidate, ...details }, 'nso_ocr', crypto.randomUUID(), Date.now())
                if (entry) await projectAppended([entry])
                const id = entry?.id
                await db.albumItems.put({ ...item, candidate: { ...candidate, ...details }, capturedAt: time!, stage: id === undefined ? 'skipped' : 'imported', historyId: id, reason: undefined })
                if (id !== undefined) await db.albumState.put({ ...state, lastImportedAt: Date.now() })
                return { recorded: id !== undefined, updated: id !== undefined && (!old || candidate.score > old.score || (candidate.score === old.score && old.maxChain === undefined && details.maxChain !== undefined)) }
            })
        },
    }
}
export const scoreRepository = createScoreRepository(database)
