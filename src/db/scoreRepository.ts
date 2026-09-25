import versions from '../data/metadata.json'
import { songService } from '../core/song/songService'
import { getChartRating } from '../core/rating/calculator'
import { database, type ScoreDatabase } from './database'
export function validateScore(score: number) {
    if (!Number.isInteger(score) || score < 0 || score > 1050000)
        throw new Error('Score 必须为 0～1,050,000 范围内的整数。')
}
export function createScoreRepository(
    db: ScoreDatabase,
    library = songService,
    version = versions,
) {
    const rating = (songId: string, chartId: string, score: number) => {
        validateScore(score)
        return getChartRating(
            score,
            library.getChart(songId, chartId).chart.level,
        )
    }
    return {
        async initialize() {
            await db.transaction('rw', db.scores, db.metadata, async () => {
                const previous = await db.metadata.get('calculation')
                if (
                    previous?.ratingRuleVersion === version.ratingRuleVersion &&
                    previous.songLibraryVersion === version.songLibraryVersion
                )
                    return
                for (const record of await db.scores.toArray()) {
                    await db.scores.update(record.id!, {
                        rating: rating(
                            record.songId,
                            record.chartId,
                            record.score,
                        ),
                    })
                }
                await db.metadata.put({ key: 'calculation', ...version })
            })
        },
        list: () => db.scores.orderBy('updatedAt').reverse().toArray(),
        async add(
            songId: string,
            chartId: string,
            score: number,
            source: 'manual' | 'ocr' = 'manual',
        ) {
            const value = rating(songId, chartId, score)
            if (source !== 'manual' && source !== 'ocr')
                throw new Error('无效的成绩来源。')
            return db.transaction('rw', db.scores, async () => {
                const existing = await db.scores
                    .where('[songId+chartId]')
                    .equals([songId, chartId])
                    .first()
                if (existing) {
                    if (source === 'manual')
                        throw new Error('该谱面已有成绩，请从成绩列表编辑。')
                    if (score <= existing.score) return existing.id!
                    await db.scores.update(existing.id!, {
                        score,
                        rating: value,
                        source,
                        updatedAt: Date.now(),
                    })
                    return existing.id!
                }
                const now = Date.now()
                return db.scores.add({
                    songId,
                    chartId,
                    score,
                    rating: value,
                    source,
                    createdAt: now,
                    updatedAt: now,
                })
            })
        },
        async edit(id: number, score: number, allowLower = false) {
            validateScore(score)
            await db.transaction('rw', db.scores, async () => {
                const record = await db.scores.get(id)
                if (!record) throw new Error('成绩已不存在，请刷新列表。')
                if (score < record.score && !allowLower)
                    throw new Error('调低成绩需要确认。')
                if (score === record.score) return
                await db.scores.update(id, {
                    score,
                    rating: rating(record.songId, record.chartId, score),
                    source: 'manual',
                    updatedAt: Date.now(),
                })
            })
        },
        remove: (id: number) => db.scores.delete(id),
        clear: () => db.scores.clear(),
    }
}
export const scoreRepository = createScoreRepository(database)
