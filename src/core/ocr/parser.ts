import Fuse from 'fuse.js'
import type { ScoreAchievements } from '../../db/models'
import { t } from '../../i18n'
import { validateAchievements, validateScore } from '../score/validation'
import { getSongSearchTitles, normalizeSongText } from '../search/songText'
import { songService } from '../song/songService'

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
export type Recognition =
    | { kind: 'skipped'; reason: string }
    | {
          kind: 'score'
          songId: string
          chartId: string
          score: number
          achievements: ScoreAchievements
      }
const compact = (text: string) =>
    text
        .normalize('NFKC')
        .toUpperCase()
        .replace(/[\s\p{P}\p{S}]/gu, '')
export function parseInteger(text: string, label: string) {
    const formatted = text
        .normalize('NFKC')
        .replace(/\s/g, '')
        .replace(/[Oo]/g, '0')
        .replace(/[Il|]/g, '1')
    if (formatted.includes(',') && !/^\d{1,3}(,\d{3})+$/.test(formatted))
        throw new Error(t('ocr.errors.separator', { label }))
    const value = formatted.replace(/,/g, '')
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error(t('ocr.errors.number', { label }))
    return Number(value)
}
function editDistance(a: string, b: string) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0]!
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const current = row[j]!
            row[j] =
                a[i - 1] === b[j - 1]
                    ? previous
                    : Math.min(previous, row[j]!, row[j - 1]!) + 1
            previous = current
        }
    }
    return row[b.length]!
}
function nearLongStatus(value: string) {
    const words = [
        ['FULLCHAIN', 'fc'],
        ['ALLPERFECT', 'ap'],
        ['MISSIONCLEAR', 'mission'],
    ] as const

    // 长状态词允许2字符容错
    return words.find(
        ([word]) =>
            Math.abs(word.length - value.length) <= 2 &&
            editDistance(word, value) <= 2,
    )?.[1]
}
export function parseStatus(text: string) {
    const value = compact(text)
    if (/^MISSI?ONCLEAR$/.test(value)) return 'mission'
    if (value === 'ALLPERFECT' || value === 'AP') return 'ap'
    if (value === 'FULLCHAIN' || value === 'FC') return 'fc'
    if (value === 'CLEAR' || value === 'FAILED' || value === 'FAIL')
        return 'clear'
    const near = nearLongStatus(value)
    if (near) return near
    if (!value) return 'empty'
    throw new Error(t('ocr.errors.status'))
}
const entries = songService.songs.flatMap((song) =>
    getSongSearchTitles(song).map((title) => ({
        song,
        title: title.replace(/\s/g, ''),
    })),
)
const fuse = new Fuse(entries, {
    keys: ['title'],
    includeScore: true,
    threshold: 0.25,
    ignoreLocation: true,
})
export function matchSong(title: string) {
    const term = normalizeSongText(title).replace(/\s/g, '')
    if (!term) throw new Error(t('ocr.errors.noTitle'))
    const exact = entries.filter((e) => e.title === term)
    if (new Set(exact.map((e) => e.song.id)).size === 1) return exact[0]!.song
    const matches = fuse.search(term)
    // Fuse 按匹配度从高到低排序，每首歌曲保留最佳语言或别名匹配，而非最后一项
    const seen = new Set<string>()
    const candidates = matches.filter((result) => {
        const id = result.item.song.id
        if (seen.has(id)) return false
        seen.add(id)
        return true
    })
    const best = candidates[0]
    if (
        !best ||
        best.score! > 0.2 ||
        (candidates[1] && candidates[1].score! - best.score! < 0.08)
    )
        throw new Error(t('ocr.errors.ambiguousTitle'))
    return best.item.song
}
export function parseFields(fields: OcrFields): Recognition {
    const status = parseStatus(fields.status)
    if (status === 'mission')
        return {
            kind: 'skipped',
            reason: t('ocr.errors.story'),
        }
    const score = parseInteger(fields.score, 'Score')
    validateScore(score)
    if (fields.layout === 'select' && status === 'empty' && score === 0)
        return { kind: 'skipped', reason: t('ocr.errors.unplayed') }
    if (status === 'empty') throw new Error(t('ocr.errors.missingStatus'))
    const song = matchSong(fields.title)
    const mode = compact(fields.mode).toLowerCase()
    const difficulty = compact(fields.difficulty).toLowerCase()
    const level = fields.level.normalize('NFKC').replace(/\s/g, '')
    if (!/^\d{1,2}\+?$/.test(level)) throw new Error(t('ocr.errors.level'))
    const levelValue =
        Number(level.replace('+', '')) + (level.endsWith('+') ? 0.5 : 0)
    const charts = song.charts.filter(
        (c) =>
            c.mode === mode &&
            c.difficulty === difficulty &&
            c.level === levelValue,
    )
    if (charts.length !== 1) throw new Error(t('ocr.errors.chartMismatch'))
    return {
        kind: 'score',
        songId: song.id,
        chartId: charts[0]!.id,
        score,
        achievements: validateAchievements({
            fc: status === 'fc' || status === 'ap',
            ap: status === 'ap',
            maxChain:
                fields.layout === 'result'
                    ? parseInteger(fields.maxChain ?? '', 'Max Chain')
                    : undefined,
        }, charts[0]),
    }
}
