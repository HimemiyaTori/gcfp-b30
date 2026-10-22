import Dexie, { type Table } from 'dexie'
import type { ScoreRecord, ScoreHistory, RatingSnapshot, RatingCalculationMetadata, RecognitionRun, RecognitionSource } from './models'
import type { AlbumItem, AlbumState, ChartProtection } from './albumModels'
import { localDay } from '../core/rating/calendar'
import { databaseName } from './accountContext'
export class ScoreDatabase extends Dexie {
    scores!: Table<ScoreRecord, number>
    scoreHistory!: Table<ScoreHistory, number>
    ratingSnapshots!: Table<RatingSnapshot, number>
    metadata!: Table<RatingCalculationMetadata, string>
    albumItems!: Table<AlbumItem, [string, string]>
    albumState!: Table<AlbumState, string>
    chartProtections!: Table<ChartProtection, string>
    recognitionRuns!: Table<RecognitionRun, RecognitionSource>
    constructor(name = 'groove-archive-fp-history') {
        super(name)
        this.version(1).stores({
            scores: '++id,&[songId+chartId],songId,chartId,score,rating,updatedAt',
            metadata: '&key',
            scoreHistory: '++id,songId,chartId,importedAt,[chartId+importedAt]',
            ratingSnapshots: '++id,importedAt',
        })
        this.version(2).stores({
            scoreHistory: '++id,songId,chartId,importedAt,playedAt,[chartId+importedAt]',
            ratingSnapshots: '++id,playedAt',
            albumItems: '[accountId+mediaId],accountId,[accountId+contentHash],stage',
            albumState: '&key',
            chartProtections: '&chartId',
        }).upgrade(async transaction => {
            await transaction.table('scoreHistory').toCollection().modify(row => { row.playedAt = row.importedAt })
            await transaction.table('metadata').delete('calculation')
        })
        this.version(3).stores({ recognitionRuns: '&key' })
        this.version(4).stores({
            scoreHistory: '++id,songId,chartId,importedAt,playedAt,[chartId+importedAt],[songId+playedAt]',
        })
        this.version(5).stores({
            scoreHistory: '++id,songId,chartId,source,importedAt,playedAt,[chartId+importedAt],[songId+playedAt]',
            albumItems: '[accountId+mediaId],accountId,[accountId+contentHash],stage,[accountId+datasetEpoch+stage]',
        })
        this.version(6).stores({
            scoreHistory: '++id,songId,chartId,source,importedAt,playedAt,[chartId+importedAt],[songId+playedAt],[chartId+playedAt]',
            ratingSnapshots: '++id,&day',
        }).upgrade(async transaction => {
            const table = transaction.table('ratingSnapshots')
            const rows = await table.toArray() as { id: number; playedAt?: number; importedAt?: number; basic: number; advanced: number }[]
            const daily = new Map<string, RatingSnapshot>()
            const recordedAt = (row: typeof rows[number]) => row.playedAt ?? row.importedAt!
            // 按原时间和主键确定每天最后一份记录，只迁移日期，不重算过去的 Rating
            rows.sort((a, b) => recordedAt(a) - recordedAt(b) || a.id - b.id)
            for (const row of rows) {
                const time = recordedAt(row)
                if (!Number.isFinite(time)) throw new Error('旧 Rating 快照缺少有效时间')
                const day = localDay(time)
                daily.set(day, { id: row.id, day, recordedAt: time, basic: row.basic, advanced: row.advanced })
            }
            await table.clear()
            await table.bulkPut([...daily.values()])
        })
    }
}
export const database = new ScoreDatabase(databaseName)

// 早期按账号拆开的库并入唯一本地库，成功后删除，避免同一成绩留两份
export const databaseReady = adoptSplitAccountLibraries(database)

async function adoptSplitAccountLibraries(target: ScoreDatabase) {
    if (typeof indexedDB === 'undefined' || !indexedDB.databases) return
    const names = (await indexedDB.databases()).map(item => item.name || '').filter(name => name.startsWith('groove-archive-fp-account-'))
    for (const name of names) {
        const source = new ScoreDatabase(name)
        try {
            await source.open()
            const history = await source.scoreHistory.toArray()
            const items = await source.albumItems.toArray()
            await target.transaction('rw', target.scoreHistory, target.albumItems, target.metadata, async () => {
                for (const row of history) {
                    const { id: _ignored, ...copy } = row
                    await target.scoreHistory.add(copy)
                }
                for (const item of items) await target.albumItems.put(item)
                if (history.length) await target.metadata.delete('calculation')
            })
            source.close()
            await source.delete()
        } catch {
            source.close()
        }
    }
}
