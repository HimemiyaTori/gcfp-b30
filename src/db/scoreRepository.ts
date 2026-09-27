import versions from '../data/metadata.json'
import { songService } from '../core/song/songService'
import { getChartRating } from '../core/rating/calculator'
import { database, type ScoreDatabase } from './database'
import type { ScoreAchievements } from './models'
import Dexie from 'dexie'
import { validateScore, validateAchievements } from '../core/score/validation'
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
    async function addScore(
        songId: string,
        chartId: string,
        score: number,
        source: 'manual' | 'ocr',
        achievements: ScoreAchievements,
        signal?: AbortSignal,
    ) {
        const details = validateAchievements(achievements)
        const value = rating(songId, chartId, score)
        return db.transaction('rw', db.scores, async () => {
            signal?.throwIfAborted()
            const transaction = Dexie.currentTransaction!
            const abort = () => transaction.abort()
            const cleanup = () => signal?.removeEventListener('abort', abort)
            signal?.addEventListener('abort', abort, { once: true })
            transaction.on('complete', cleanup)
            transaction.on('abort', cleanup)
            const existing = await db.scores
                .where('[songId+chartId]')
                .equals([songId, chartId])
                .first()
            signal?.throwIfAborted()
            if (existing) {
                if (source === 'manual')
                    throw new Error('该谱面已有成绩，请从成绩列表编辑。')
                if (score < existing.score)
                    return { id: existing.id!, skipped: true }
                if (score === existing.score) {
                    const merged = {
                        fc: existing.fc ?? details.fc,
                        ap: existing.ap ?? details.ap,
                        maxChain: existing.maxChain ?? details.maxChain,
                    }
                    if (merged.ap && merged.fc === false) {
                        merged.fc = existing.fc
                        merged.ap = existing.ap
                    }
                    const achievementChanged =
                        merged.fc !== existing.fc || merged.ap !== existing.ap
                    const maxChainChanged =
                        merged.maxChain !== existing.maxChain
                    if (achievementChanged || maxChainChanged)
                        await db.scores.update(existing.id!, {
                            ...(achievementChanged
                                ? { fc: merged.fc, ap: merged.ap }
                                : {}),
                            ...(maxChainChanged
                                ? { maxChain: merged.maxChain }
                                : {}),
                            source,
                            ...(achievementChanged
                                ? { updatedAt: Date.now() }
                                : {}),
                        })
                    return {
                        id: existing.id!,
                        skipped: !achievementChanged && !maxChainChanged,
                    }
                }
                await db.scores.update(existing.id!, {
                    ...details,
                    score,
                    rating: value,
                    source,
                    updatedAt: Date.now(),
                })
                return { id: existing.id!, skipped: false }
            }
            const now = Date.now()
            const id = await db.scores.add({
                ...details,
                songId,
                chartId,
                score,
                rating: value,
                source,
                createdAt: now,
                updatedAt: now,
            })
            return { id, skipped: false }
        })
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
        async addManual(
            songId: string,
            chartId: string,
            score: number,
            achievements: ScoreAchievements = {},
        ) {
            return (await addScore(songId, chartId, score, 'manual', achievements)).id
        },
        addOcr(
            songId: string,
            chartId: string,
            score: number,
            achievements: ScoreAchievements = {},
            signal?: AbortSignal,
        ) {
            return addScore(
                songId,
                chartId,
                score,
                'ocr',
                achievements,
                signal,
            )
        },
        async edit(
            id: number,
            score: number,
            allowLower = false,
            achievements?: ScoreAchievements,
        ) {
            validateScore(score)
            const details =
                achievements === undefined
                    ? undefined
                    : validateAchievements(achievements)
            await db.transaction('rw', db.scores, async () => {
                const record = await db.scores.get(id)
                if (!record) throw new Error('成绩已不存在，请刷新列表。')
                if (score < record.score && !allowLower)
                    throw new Error('调低成绩需要确认。')
                const scoreChanged = score !== record.score
                const achievementChanged =
                    details !== undefined &&
                    (details.fc !== record.fc || details.ap !== record.ap)
                const maxChainChanged =
                    details !== undefined && details.maxChain !== record.maxChain
                if (!scoreChanged && !achievementChanged && !maxChainChanged) return
                await db.scores.update(id, {
                    ...details,
                    score,
                    rating: rating(record.songId, record.chartId, score),
                    source: 'manual',
                    ...(scoreChanged || achievementChanged
                        ? { updatedAt: Date.now() }
                        : {}),
                })
            })
        },
        remove: (id: number) => db.scores.delete(id),
        clear: () => db.scores.clear(),
    }
}
export const scoreRepository = createScoreRepository(database)
