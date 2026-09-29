import { read, utils, type WorkBook } from 'xlsx'
import { songService } from '../song/songService'
import { workbookBytes } from './template'
export { createScoreWorkbook, workbookBytes } from './template'
import { validateImportedScore, type ImportedScore } from '../score/import'

export const MAX_EXCEL_BYTES = 5 * 1024 * 1024
export const MAX_EXCEL_ROWS = 5000
export const SCORE_SHEET = '成绩'
export const HEADERS = ['Song ID', 'Chart ID', '曲名', '模式', '难度', '等级', 'Score', 'FC', 'AP', 'Max Chain', 'Rank', 'Rating', '创建时间', '更新时间']
const required = ['Song ID', 'Chart ID', 'Score']
const inputHeaders = ['Song ID', 'Chart ID', 'Score', 'FC', 'AP', 'Max Chain', '创建时间', '更新时间']
export interface ExcelIssue { sheet: string; row: number; message: string }
export interface ExcelPreview { rows: ImportedScore[]; issues: ExcelIssue[]; empty: number }
const empty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim())
function number(value: unknown, label: string, optional = false): number | undefined {
    if (optional && empty(value)) return undefined
    if ((typeof value !== 'number' && typeof value !== 'string') || empty(value) || !/^\d+$/.test(String(value).trim()))
        throw new Error(`${label} 必须为非负整数${optional ? '，或留空' : ''}。`)
    const result = Number(value)
    if (!Number.isSafeInteger(result)) throw new Error(`${label} 数值超出范围。`)
    return result
}
function flag(value: unknown, label: string): boolean | undefined {
    if (empty(value)) return undefined
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    if (['true', '1', '是'].includes(text)) return true
    if (['false', '0', '否'].includes(text)) return false
    throw new Error(`${label} 请填写 TRUE / FALSE、是 / 否或 1 / 0，未知时留空。`)
}
function time(value: unknown, label: string): number | undefined {
    if (empty(value)) return undefined
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.trim()))
        throw new Error(`${label} 请保留导出的 UTC 时间文本，或留空。`)
    const text = value.trim()
    const result = Date.parse(text)
    if (!Number.isFinite(result) || new Date(result).toISOString() !== text.replace(/Z$/, text.includes('.') ? 'Z' : '.000Z'))
        throw new Error(`${label} 日期无效。`)
    return result
}

export function parseScoreWorkbook(data: ArrayBuffer): ExcelPreview {
    if (data.byteLength > MAX_EXCEL_BYTES) throw new Error('文件不能超过 5 MiB。')
    let book: WorkBook
    try { book = read(data, { type: 'array', cellFormula: true, sheetRows: MAX_EXCEL_ROWS + 6 }) }
    catch { throw new Error('无法读取工作簿，请选择未加密的 .xlsx 文件。') }
    const modes = ['BASIC', 'ADVANCED'].filter(name => book.Sheets[name])
    const names = modes.length ? modes : book.Sheets[SCORE_SHEET] ? [SCORE_SHEET] : []
    if (!names.length) throw new Error('缺少 BASIC / ADVANCED 工作表，请使用本站模板。')
    const result: ExcelPreview = { rows: [], issues: [], empty: 0 }
    const seen = new Map<string, string>()
    for (const name of names) {
        const sheet = book.Sheets[name]!
        const modern = name !== SCORE_SHEET
        const range = utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1')
        if (range.e.r > MAX_EXCEL_ROWS + 4 || range.e.c >= 32) throw new Error(`${name} 表最多支持 5000 行数据、32 列。`)
        const table = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true, range: 0 })
        const headerRow = modern ? table.slice(0, 10).findIndex(row => required.every(header => row.some(value => String(value ?? '').trim() === header))) : 0
        if (headerRow < 0) throw new Error(`${name} 表缺少 Song ID、Chart ID 或 Score 表头。`)
        if (range.e.r - headerRow > MAX_EXCEL_ROWS) throw new Error(`${name} 表最多支持 5000 行数据。`)
        const headers = (table[headerRow] ?? []).map(value => String(value ?? '').trim())
        for (let c = 0; c <= range.e.c; c++) {
            const cell = sheet[utils.encode_cell({ r: headerRow, c })]
            if (cell?.f || cell?.t === 'e') throw new Error(`${name} 表头必须为普通文本，不能包含公式或错误值。`)
        }
        for (const header of required) if (!headers.includes(header)) throw new Error(`缺少必填列：${header}。`)
        for (const header of inputHeaders) if (headers.filter(value => value === header).length > 1) throw new Error(`列名重复：${header}。`)
        for (let index = headerRow + 1; index < table.length; index++) {
            const cells = table[index] ?? []
            const get = (header: string) => cells[headers.indexOf(header)]
            const raw = (header: string) => sheet[utils.encode_cell({ r: index, c: headers.indexOf(header) })]
            // 新模板预填曲库，未填写分数的谱面不作为零分导入
            if (modern && empty(get('Score')) && !raw('Score')?.f && raw('Score')?.t !== 'e') { result.empty++; continue }
            const checked = modern ? inputHeaders.filter(header => headers.includes(header)).map(raw) : Array.from({ length: range.e.c + 1 }, (_, c) => sheet[utils.encode_cell({ r: index, c })])
            const hasFormula = checked.some(cell => cell?.f)
            const hasError = checked.some(cell => cell?.t === 'e')
            if (cells.every(empty) && !hasFormula && !hasError) { result.empty++; continue }
            try {
                if (hasFormula) throw new Error('输入列不能包含公式，请粘贴为值；Rank / RT 公式无需修改。')
                if (hasError) throw new Error('输入列包含 Excel 错误值，请修正后再导入。')
                const songId = String(get('Song ID') ?? '').trim()
                const chartId = String(get('Chart ID') ?? '').trim()
                const row = validateImportedScore({
                    songId, chartId, score: number(get('Score'), 'Score')!,
                    fc: flag(get('FC'), 'FC'), ap: flag(get('AP'), 'AP'),
                    maxChain: number(get('Max Chain'), 'Max Chain', true),
                    createdAt: time(get('创建时间'), '创建时间'), updatedAt: time(get('更新时间'), '更新时间'),
                })
                if (modern && songService.getChart(songId, chartId).chart.mode.toUpperCase() !== name) throw new Error(`谱面模式与 ${name} 工作表不匹配。`)
                if (seen.has(chartId)) throw new Error(`与 ${seen.get(chartId)} 谱面重复，请仅保留一行。`)
                seen.set(chartId, `${name} 第 ${index + 1} 行`)
                result.rows.push(row)
            } catch (error) {
                result.issues.push({ sheet: name, row: index + 1, message: error instanceof Error ? error.message : '无法识别此行。' })
            }
        }
    }
    return result
}

export async function downloadWorkbook(book: Parameters<typeof workbookBytes>[0], filename: string) {
    const blob = new Blob([await workbookBytes(book)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
}
