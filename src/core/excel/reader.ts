import { read, utils, type WorkBook } from 'xlsx'
import { songService } from '../song/songService'
import { MODE_SHEETS, localizedHeaders, normalizeExcelHeader } from './headers'
import { MAX_EXCEL_BYTES, MAX_EXCEL_ROWS, MAX_HEADER_ROWS, type ExcelPreview } from './models'
import { validateImportedScore } from '../score/import'
import { currentLanguage, t } from '../../i18n'

const required = ['Chart ID', 'Score']
const UPDATED_AT = '更新时间'
const inputHeaders = [
    'Song ID',
    'Chart ID',
    'Score',
    'FC',
    'AP',
    'Max Chain',
    UPDATED_AT,
]
const label = (header: string) =>
    header === UPDATED_AT ? localizedHeaders[currentLanguage()][10] : header
const chartSongs = new Map(
    songService.songs.flatMap((song) =>
        song.charts.map((chart) => [chart.id, song.id] as const),
    ),
)
const empty = (value: unknown) =>
    value === undefined ||
    value === null ||
    (typeof value === 'string' && !value.trim())
function number(
    value: unknown,
    label: string,
    optional = false,
): number | undefined {
    if (optional && empty(value)) return undefined
    if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        empty(value) ||
        !/^\d+$/.test(String(value).trim())
    )
        throw new Error(t(optional ? 'excel.errors.integerOptional' : 'excel.errors.integer', { label }))
    const result = Number(value)
    if (!Number.isSafeInteger(result))
        throw new Error(t('excel.errors.range', { label }))
    return result
}
function flag(value: unknown, label: string): boolean | undefined {
    if (empty(value)) return undefined
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    if (['√', 'true', '1', '是'].includes(text)) return true
    if (['false', '0', '否'].includes(text)) return false
    throw new Error(t('excel.errors.flag', { label }))
}
function time(value: unknown, label: string): number | undefined {
    if (empty(value)) return undefined
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.trim())
    )
        throw new Error(t('excel.errors.timeFormat', { label }))
    const text = value.trim()
    const result = Date.parse(text)
    if (
        !Number.isFinite(result) ||
        new Date(result).toISOString() !==
            text.replace(/Z$/, text.includes('.') ? 'Z' : '.000Z')
    )
        throw new Error(t('excel.errors.date', { label }))
    return result
}

export function parseScoreWorkbook(data: ArrayBuffer): ExcelPreview {
    if (data.byteLength > MAX_EXCEL_BYTES)
        throw new Error(t('excel.tooLarge'))
    let book: WorkBook
    try {
        book = read(data, {
            type: 'array',
            cellFormula: true,
            sheetRows: MAX_EXCEL_ROWS + MAX_HEADER_ROWS,
        })
    } catch {
        throw new Error(t('excel.errors.unreadable'))
    }
    const names = MODE_SHEETS.filter((name) => book.Sheets[name])
    if (!names.length)
        throw new Error(t('excel.errors.sheets'))
    const result: ExcelPreview = { rows: [], issues: [], empty: 0 }
    for (const name of names) {
        const sheet = book.Sheets[name]!
        const range = utils.decode_range(
            sheet['!fullref'] || sheet['!ref'] || 'A1',
        )
        if (range.e.r >= MAX_EXCEL_ROWS + MAX_HEADER_ROWS || range.e.c >= 32)
            throw new Error(t('excel.errors.size', { sheet: name }))
        const table = utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            raw: true,
            defval: null,
            blankrows: true,
            range: 0,
        })
        // 删除或清空其中一张表后，继续读取另一张表的成绩
        if (table.every((row) => row.every(empty))) continue
        const headerRow = table
            .slice(0, MAX_HEADER_ROWS)
            .findIndex((row) =>
                required.every((header) =>
                    row.some((value) => normalizeExcelHeader(value) === header),
                ),
            )
        if (headerRow < 0)
            throw new Error(t('excel.errors.requiredHeaders', { sheet: name }))
        if (range.e.r - headerRow > MAX_EXCEL_ROWS)
            throw new Error(t('excel.errors.rows', { sheet: name }))
        const headers = (table[headerRow] ?? []).map(normalizeExcelHeader)
        for (let c = 0; c <= range.e.c; c++) {
            const cell = sheet[utils.encode_cell({ r: headerRow, c })]
            if (cell?.f || cell?.t === 'e')
                throw new Error(t('excel.errors.headerFormula', { sheet: name }))
        }
        for (const header of required)
            if (!headers.includes(header))
                throw new Error(t('excel.errors.missingColumn', { header: label(header) }))
        for (const header of inputHeaders)
            if (headers.filter((value) => value === header).length > 1)
                throw new Error(t('excel.errors.duplicateColumn', { header: label(header) }))
        for (let index = headerRow + 1; index < table.length; index++) {
            const cells = table[index] ?? []
            const get = (header: string) => cells[headers.indexOf(header)]
            const raw = (header: string) =>
                sheet[
                    utils.encode_cell({ r: index, c: headers.indexOf(header) })
                ]
            // 未填写分数的谱面不作为零分导入，不依赖曲名或合并单元格的位置
            if (
                empty(get('Score')) &&
                !raw('Score')?.f &&
                raw('Score')?.t !== 'e'
            ) {
                result.empty++
                continue
            }
            const checked = inputHeaders
                .filter((header) => headers.includes(header))
                .map(raw)
            const hasFormula = checked.some((cell) => cell?.f)
            const hasError = checked.some((cell) => cell?.t === 'e')
            if (cells.every(empty) && !hasFormula && !hasError) {
                result.empty++
                continue
            }
            try {
                if (hasFormula)
                    throw new Error(t('excel.errors.formula'))
                if (hasError)
                    throw new Error(t('excel.errors.errorValue'))
                const chartId = String(get('Chart ID') ?? '').trim()
                // Song ID 列或单元格被删除时，按稳定的 Chart ID 从内置曲库恢复关联
                const songId = empty(get('Song ID'))
                    ? (chartSongs.get(chartId) ?? '')
                    : String(get('Song ID')).trim()
                const maxChain = number(get('Max Chain'), 'Max Chain', true)
                const row = validateImportedScore({
                    songId,
                    chartId,
                    score: number(get('Score'), 'Score')!,
                    fc: headers.includes('FC') ? flag(get('FC'), 'FC') ?? false : undefined,
                    ap: flag(get('AP'), 'AP'),
                    maxChain,
                    updatedAt: time(get(UPDATED_AT), label(UPDATED_AT)),
                })
                if (
                    songService
                        .getChart(songId, chartId)
                        .chart.mode.toUpperCase() !== name
                )
                    throw new Error(t('excel.errors.modeMismatch', { sheet: name }))
                result.rows.push(row)
            } catch (error) {
                result.issues.push({
                    sheet: name,
                    row: index + 1,
                    message:
                        error instanceof Error
                            ? error.message
                            : t('excel.errors.row'),
                })
            }
        }
    }
    return result
}

