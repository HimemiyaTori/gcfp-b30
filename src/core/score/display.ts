import type { ScoreHistory, ScoreRecord, ScoreRow } from '../../db/models'
import { formatLevel, getSongDisplay, songService } from '../song/songService'

export function getScoreRow(record: ScoreRecord | ScoreHistory, language: 'ja' | 'en'): ScoreRow {
    const { song, chart } = songService.getChart(record.songId, record.chartId)
    return {
        ...getSongDisplay(song, language),
        ...record,
        ...('importedAt' in record ? { importedAt: record.playedAt ?? record.importedAt } : {}),
        id: record.id!,
        category: song.genre,
        difficulty: chart.difficulty.toUpperCase(),
        mode: chart.mode.toUpperCase(),
        level: formatLevel(chart.level),
    }
}
