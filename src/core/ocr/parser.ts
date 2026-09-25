import Fuse from 'fuse.js'
import { songService } from '../song/songService'
import { normalizeSongText } from '../search/songSearch'
import { validateScore } from '../../db/scoreRepository'
import type { ScoreAchievements } from '../../db/models'

export type Layout = 'result' | 'select'
export interface OcrFields {
    layout: Layout
    title: string
    score: string
    status: string
    mode: string
    difficulty: string
    level: string
    maxChain?: string
}
export type Recognition = { kind: 'skipped'; reason: string } | {
    kind: 'score'; songId: string; chartId: string; score: number; achievements: ScoreAchievements
}
const compact = (text: string) => text.normalize('NFKC').toUpperCase().replace(/[\s\p{P}\p{S}]/gu, '')
export function parseInteger(text: string, label: string) {
    const formatted = text.normalize('NFKC').replace(/\s/g, '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1')
    if (formatted.includes(',') && !/^\d{1,3}(,\d{3})+$/.test(formatted)) throw new Error(`${label} 千位分隔不完整。`)
    const value = formatted.replace(/,/g, '')
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`无法识别 ${label}。`)
    return Number(value)
}
export function parseStatus(text: string) {
    const value = compact(text)
    if (/^MISSI?ONCLEAR$/.test(value)) return 'mission'
    if (value === 'ALLPERFECT' || value === 'AP') return 'ap'
    if (value === 'FULLCHAIN' || value === 'FC') return 'fc'
    if (value === 'CLEAR' || value === 'FAILED' || value === 'FAIL') return 'clear'
    if (!value) return 'empty'
    throw new Error('无法确认结算状态，未保存成绩。')
}
const entries = songService.songs.flatMap(song => [song.title.ja, song.title.en, ...(song.searchAliases ?? [])]
    .filter((title): title is string => !!title).map(title => ({ song, title: normalizeSongText(title).replace(/\s/g, '') })))
const fuse = new Fuse(entries, { keys: ['title'], includeScore: true, threshold: 0.25, ignoreLocation: true })
export function matchSong(title: string) {
    const term = normalizeSongText(title).replace(/\s/g, '')
    if (!term) throw new Error('未识别到曲名。')
    const exact = entries.filter(e => e.title === term)
    if (new Set(exact.map(e => e.song.id)).size === 1) return exact[0]!.song
    const matches = fuse.search(term)
    // Fuse sorts best first. Keep each song's best language/alias, not its last hit.
    const candidates = matches.filter((result, index) => matches.findIndex(other => other.item.song.id === result.item.song.id) === index)
    const best = candidates[0]
    if (!best || best.score! > 0.2 || (candidates[1] && candidates[1].score! - best.score! < 0.08))
        throw new Error('曲名匹配不明确，请使用清晰完整截图或手动新增。')
    return best.item.song
}
export function parseFields(fields: OcrFields): Recognition {
    const status = parseStatus(fields.status)
    if (status === 'mission') return { kind: 'skipped', reason: 'MISSION CLEAR：任务结算不存储成绩。' }
    const score = parseInteger(fields.score, 'Score')
    validateScore(score)
    if (fields.layout === 'select' && status === 'empty' && score === 0)
        return { kind: 'skipped', reason: '该谱面尚未游玩，跳过 0 分占位。' }
    if (status === 'empty') throw new Error('缺少成绩状态，未保存成绩。')
    const song = matchSong(fields.title)
    const mode = compact(fields.mode).toLowerCase()
    const difficulty = compact(fields.difficulty).toLowerCase()
    const level = fields.level.normalize('NFKC').replace(/\s/g, '')
    if (!/^\d{1,2}\+?$/.test(level)) throw new Error('无法识别谱面等级。')
    const levelValue = Number(level.replace('+', '')) + (level.endsWith('+') ? 0.5 : 0)
    const charts = song.charts.filter(c => c.mode === mode && c.difficulty === difficulty && c.level === levelValue)
    if (charts.length !== 1) throw new Error('模式、难度或等级与曲库不符，未保存成绩。')
    return { kind: 'score', songId: song.id, chartId: charts[0]!.id, score,
        achievements: { fc: status === 'fc' || status === 'ap', ap: status === 'ap',
            maxChain: fields.layout === 'result' ? parseInteger(fields.maxChain ?? '', 'Max Chain') : undefined } }
}
