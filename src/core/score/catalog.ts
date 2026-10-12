import type { SongCategory } from '../../data/categories'
import type { ScoreRow } from '../../db/models'
import { formatLevel, getSongArtist, getSongTitle, songService } from '../song/songService'

export interface UnplayedChartRow {
    chartId: string
    songId: string
    ja: string
    en: string
    artist: string
    category: SongCategory
    difficulty: string
    mode: string
    level: string
    coverSourceUrl: string
}

export type ChartListRow = ScoreRow | UnplayedChartRow

export function isPlayedChart(row: ChartListRow): row is ScoreRow {
    return 'score' in row
}

export function listLibraryCharts(scores: readonly ScoreRow[], language: 'ja' | 'en'): ChartListRow[] {
    const played = new Map(scores.map(score => [score.chartId, score]))
    return songService.songs.flatMap(song => song.charts.map(chart => played.get(chart.id) ?? {
        chartId: chart.id,
        songId: song.id,
        ja: getSongTitle(song, 'ja'),
        en: getSongTitle(song, 'en'),
        artist: getSongArtist(song, language),
        category: song.genre,
        difficulty: chart.difficulty.toUpperCase(),
        mode: chart.mode.toUpperCase(),
        level: formatLevel(chart.level),
        coverSourceUrl: song.coverSourceUrl,
    }))
}
