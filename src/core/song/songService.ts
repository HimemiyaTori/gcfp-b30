import rawSongs from '../../data/songs.json'
import { songCategories } from '../../data/categories'
import type { Chart, Song } from './models'
export function validateLibrary(songs: Song[]) {
    const ids = new Set<string>(), chartIds = new Set<string>()
    for (const song of songs) {
        if (!song.id || ids.has(song.id) || !song.title.ja || !song.artist.ja || !song.charts.length || !songCategories.some(c => c.id === song.genre)) throw new Error(`曲库歌曲无效：${song.id}`)
        ids.add(song.id)
        const slots = new Set<string>()
        for (const chart of song.charts) {
            const slot = `${chart.mode}-${chart.difficulty}`
            if (chart.id !== `${song.id}-${slot}` || chartIds.has(chart.id) || slots.has(slot) || !['basic', 'advanced'].includes(chart.mode) || !['easy', 'normal', 'hard', 'master'].includes(chart.difficulty) || chart.level <= 0 || !Number.isInteger(chart.level * 2)) throw new Error(`曲库谱面无效：${chart.id}`)
            chartIds.add(chart.id); slots.add(slot)
        }
    }
}
export function createSongService(songs: Song[]) {
    validateLibrary(songs)
    const byId = new Map(songs.map(song => [song.id, song]))
    const charts = new Map<string, { song: Song; chart: Chart }>()
    for (const song of songs) for (const chart of song.charts) charts.set(chart.id, { song, chart })
    return {
        songs,
        getSong: (id: string) => byId.get(id),
        getChart(songId: string, chartId: string) {
            const result = charts.get(chartId)
            if (!result || result.song.id !== songId) throw new Error('曲目与谱面不存在或不匹配，请检查曲库版本。')
            return result
        },
    }
}
export const songService = createSongService(rawSongs as Song[])
export const getSongTitle = (song: Song, lang: 'ja' | 'en') => song.title[lang] || song.title.ja
export const getSongArtist = (song: Song, lang: 'ja' | 'en') => song.artist[lang] || song.artist.ja
export const formatLevel = (level: number) => Number.isInteger(level) ? String(level) : `${Math.floor(level)}+`
