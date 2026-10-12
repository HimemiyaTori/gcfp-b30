import { songCategories } from '../../data/categories'
import rawSongs from '../../data/songs.json'
import type { Chart, Song } from './models'
import { t } from '../../i18n'
export function validateLibrary(songs: Song[]) {
    const ids = new Set<string>(),
        chartIds = new Set<string>()
    for (const song of songs) {
        if (
            !song.id ||
            ids.has(song.id) ||
            !song.title.ja ||
            !song.artist.ja ||
            !song.charts.length ||
            !songCategories.some((c) => c.id === song.genre)
        )
            throw new Error(`曲库歌曲无效：${song.id}`)
        ids.add(song.id)
        const slots = new Set<string>()
        for (const chart of song.charts) {
            const slot = `${chart.mode}-${chart.difficulty}`
            if (
                chart.id !== `${song.id}-${slot}` ||
                chartIds.has(chart.id) ||
                slots.has(slot) ||
                !['basic', 'advanced'].includes(chart.mode) ||
                !['easy', 'normal', 'hard', 'master'].includes(
                    chart.difficulty,
                ) ||
                chart.level <= 0 ||
                !Number.isInteger(chart.level * 2)
            )
                throw new Error(`曲库谱面无效：${chart.id}`)
            chartIds.add(chart.id)
            slots.add(slot)
        }
    }
}
export function createSongService(songs: Song[]) {
    validateLibrary(songs)
    const byId = new Map(songs.map((song) => [song.id, song]))
    const charts = new Map<string, { song: Song; chart: Chart }>()
    for (const song of songs)
        for (const chart of song.charts) charts.set(chart.id, { song, chart })
    return {
        songs,
        getSong: (id: string) => byId.get(id),
        getChart(songId: string, chartId: string) {
            const result = charts.get(chartId)
            if (!result || result.song.id !== songId)
                throw new Error(t('errors.chartNotFound'))
            return result
        },
    }
}
export const songService = createSongService(rawSongs as Song[])
const storyRoutes = {
    kakeru: { ja: '閃道カケル', en: 'Sendou Kakeru' },
    aria: { ja: '氷芽川アリア', en: 'Himekawa Aria' },
} as const
export const getSongTitle = (song: Song, lang: 'ja' | 'en') =>
    song.title[lang] || song.title.ja
export const getSongArtist = (song: Song, lang: 'ja' | 'en') =>
    song.artist[lang] || song.artist.ja
export function formatSongPack(
    pack: string | undefined,
    language: 'ja' | 'en',
) {
    const value = pack?.trim() ?? ''
    const matched = /^(kakeru|aria) (\d+-\d+)$/.exec(value)
    if (!matched) return value
    return `${storyRoutes[matched[1] as keyof typeof storyRoutes][language]}篇（${matched[2]}）`
}
export const formatLevel = (level: number) =>
    Number.isInteger(level) ? String(level) : `${Math.floor(level)}+`

export function getSongDisplay(song: Song, language: 'ja' | 'en') {
    return {
        id: song.id,
        ja: getSongTitle(song, 'ja'),
        en: getSongTitle(song, 'en'),
        artist: getSongArtist(song, language),
        coverSourceUrl: song.coverSourceUrl,
    }
}
