import Dexie, { type Table } from 'dexie'
import type { ScoreRecord, RatingCalculationMetadata } from './models'
export class ScoreDatabase extends Dexie {
    scores!: Table<ScoreRecord, number>
    metadata!: Table<RatingCalculationMetadata, string>
    constructor(name = 'groove-archive-fp') {
        super(name)
        this.version(1).stores({
            scores: '++id,&[songId+chartId],songId,chartId,score,rating,updatedAt',
            metadata: '&key',
        })
    }
}
export const database = new ScoreDatabase()
