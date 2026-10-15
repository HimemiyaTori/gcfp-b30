import Dexie, { type Table } from 'dexie'
import type { ScoreRecord, ScoreHistory, RatingSnapshot, RatingCalculationMetadata, RecognitionRun, RecognitionSource } from './models'
import type { AlbumItem, AlbumState, ChartProtection } from './albumModels'
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
    }
}
export const database = new ScoreDatabase()
