import Dexie, { type Table } from 'dexie'
import type { ScoreRecord, ScoreHistory, RatingSnapshot, RatingCalculationMetadata } from './models'
export class ScoreDatabase extends Dexie {
    scores!: Table<ScoreRecord, number>
    scoreHistory!: Table<ScoreHistory, number>
    ratingSnapshots!: Table<RatingSnapshot, number>
    metadata!: Table<RatingCalculationMetadata, string>
    constructor(name = 'groove-archive-fp-history') {
        super(name)
        this.version(1).stores({
            scores: '++id,&[songId+chartId],songId,chartId,score,rating,updatedAt',
            metadata: '&key',
            scoreHistory: '++id,songId,chartId,importedAt,[chartId+importedAt]',
            ratingSnapshots: '++id,importedAt',
        })
    }
}
export const database = new ScoreDatabase()
