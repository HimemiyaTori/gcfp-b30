import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { utils, read, write } from 'xlsx'
import { createScoreWorkbook, parseScoreWorkbook, workbookBytes, MAX_EXCEL_BYTES } from '../src/core/excel/workbook.ts'
import { songService } from '../src/core/song/songService.ts'

const song = songService.songs[0]
const chart = song.charts[0]
const input = (score = 1000000, extra = {}) => ({ songId: song.id, chartId: chart.id, score, ...extra })
const record = (extra = {}) => ({ ...input(), rating: 999, source: 'manual', createdAt: 1000, updatedAt: 2000, ...extra })
const HEADERS = ['Song ID', 'Chart ID', '曲名', '模式', '难度', '等级', 'Score', 'FC', 'AP', 'Max Chain', 'Rank', 'RT', '创建时间', '更新时间']
function book(rows, headers = HEADERS) {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([headers, ...rows]), 'BASIC')
    return workbook
}
const parse = workbook => parseScoreWorkbook(write(workbook, { type: 'array', bookType: 'xlsx' }))
const row = (score = 1000000, extra = []) => [song.id, chart.id, '错误的参考曲名', '无关模式', '', '', score, ...extra]
test('two mode sheets include all charts, hidden identifiers, input validation and live formulas', async () => {
    const workbook = createScoreWorkbook([], 'en', true)
    const serialized = await workbookBytes(workbook)
    const saved = read(serialized, { cellStyles: true })
    const restored = new ExcelJS.Workbook()
    await restored.xlsx.load(serialized)
    assert.deepEqual(saved.SheetNames, ['BASIC', 'ADVANCED'])
    assert.equal(parseScoreWorkbook(serialized).rows.length, 0)
    for (const mode of saved.SheetNames) {
        const ws = saved.Sheets[mode]
        const expected = songService.songs.flatMap(s => s.charts.filter(c => c.mode.toUpperCase() === mode)).length
        assert.equal(utils.decode_range(ws['!ref']).e.r - 4, expected)
        assert.equal(ws.N6.t, 's')
        assert.ok(ws.F6.f && ws.G6.f)
        for (const index of [10, 11, 12, 13]) assert.equal(ws['!cols'][index].hidden, true)
        assert.equal(restored.getWorksheet(mode).getCell('E6').dataValidation.type, 'whole')
    }
    assert.equal(saved.Sheets.BASIC.B6.v, 'Idol')
})

test('binary XLSX round trip preserves flags, unknowns, zeros and timestamps', async () => {
    const original = [record({ score: 0, fc: false, ap: false, maxChain: 0 }), record({ chartId: song.charts[1].id, fc: true, ap: true, maxChain: 123 }), record({ chartId: song.charts[2].id })]
    const workbook = createScoreWorkbook(original)
    workbook.getWorksheet('BASIC').getCell('G7').value = { formula: '1/0', result: { error: '#DIV/0!' } }
    const parsed = parseScoreWorkbook(await workbookBytes(workbook))
    assert.deepEqual(parsed.issues, [])
    assert.equal(parsed.rows.length, original.length)
    for (const expected of original) {
        const actual = parsed.rows.find(row => row.chartId === expected.chartId)
        assert.ok(actual, expected.chartId)
        for (const key of ['songId', 'chartId', 'score', 'fc', 'ap', 'maxChain', 'createdAt', 'updatedAt']) assert.equal(actual[key], expected[key], key)
    }
})

test('input columns can be reordered; numeric IDs, string numbers and AP normalization work', () => {
    const parsed = parse(book([[' 1000000 ', chart.id, Number(song.id), '是']], ['Score', 'Chart ID', 'Song ID', 'AP']))
    assert.deepEqual(parsed.issues, [])
    assert.equal(parsed.rows[0].fc, true)
    assert.equal(parsed.rows[0].ap, true)
})

test('invalid scores, flags, chain, chart IDs and dates produce exact row errors', () => {
    for (const score of ['1,000,000', -1, 1050001, 1.5, true, 'NaN']) {
        const parsed = parse(book([row(score)]))
        assert.equal(parsed.issues[0]?.row, 2, String(score))
    }
    for (const extra of [['yes'], [false, true], ['', '', -1], ['', '', 1.5], ['', '', '', '', '', 'not-a-date'], ['', '', '', '', '', '2026-02-30T00:00:00Z']]) {
        assert.equal(parse(book([row(100, extra)])).issues.length, 1)
    }
    assert.equal(parse(book([['missing', chart.id, '', '', '', '', 100]])).issues.length, 1)
    assert.equal(parse(book([row(100, ['', '', '', '', '', '2026-09-29T00:00:00Z', '2026-09-28T00:00:00Z'])])).issues.length, 1)
    assert.equal(parse(book([row(100, ['', '', '', '', '', '2026-09-29T00:00:00Z'])])).issues.length, 0)
})

test('empty lines are skipped, duplicate rows and formulas are errors, headers are mandatory', () => {
    const parsed = parse(book([row(), [], row()]))
    assert.equal(parsed.empty, 1)
    assert.equal(parsed.issues[0].row, 4)
    assert.match(parsed.issues[0].message, /第 2 行/)
    const formula = book([row()])
    formula.Sheets.BASIC.G2 = { t: 'n', v: 1000000, f: '1000000' }
    assert.match(parse(formula).issues[0].message, /公式/)
    formula.Sheets.BASIC.G2 = { t: 'n', f: '1000000' }
    assert.match(parse(formula).issues[0].message, /公式/)
    const errorCell = book([row()])
    errorCell.Sheets.BASIC.H2 = { t: 'e', v: 7 }
    assert.match(parse(errorCell).issues[0].message, /错误值/)
    const headerFormula = book([row()])
    headerFormula.Sheets.BASIC.A1.f = '"Song ID"'
    assert.throws(() => parse(headerFormula), /表头/)
    assert.throws(() => parse(book([], ['Score'])), /Chart ID/)
    assert.throws(() => parse(book([], [...HEADERS, 'Score'])), /重复/)
    const wrong = utils.book_new()
    utils.book_append_sheet(wrong, utils.aoa_to_sheet([['x']]), 'Sheet1')
    assert.throws(() => parse(wrong), /BASIC/)
})

test('oversized input, row and column limits and unreadable workbooks fail before import', () => {
    assert.throws(() => parseScoreWorkbook(new ArrayBuffer(MAX_EXCEL_BYTES + 1)), /5 MiB/)
    assert.throws(() => parseScoreWorkbook(new Uint8Array([0, 255, 0, 255]).buffer))
    const tooMany = book([])
    tooMany.Sheets.BASIC.A5002 = { t: 's', v: 'x' }
    tooMany.Sheets.BASIC['!ref'] = 'A1:N5002'
    assert.throws(() => parse(tooMany), /5000/)
    const tooWide = book([])
    tooWide.Sheets.BASIC.AG2 = { t: 's', v: 'x' }
    tooWide.Sheets.BASIC['!ref'] = 'A1:AG2'
    assert.throws(() => parse(tooWide), /32/)
})

test('trimmed templates retain scores after deleting rows, optional columns and one mode sheet', async () => {
    const source = createScoreWorkbook([record({ score: 0 }), record({ chartId: song.charts[2].id }), record({ chartId: songService.songs.at(-1).charts[3].id })])
    const original = read(await workbookBytes(source))
    const cells = utils.sheet_to_json(original.Sheets.BASIC, { header: 1, raw: true, defval: null, range: 0 })
    const columns = ['Score', 'Chart ID', 'AP'].map(header => cells[4].indexOf(header))
    // 模拟删除标题、未游玩行、参考列、时间及 Song ID，只保留部分成绩
    const retained = [cells[4], ...cells.slice(5).filter(row => row[4] !== null)].map(row => columns.map(index => row[index]))
    const trimmed = utils.book_new()
    utils.book_append_sheet(trimmed, utils.aoa_to_sheet(retained), 'BASIC')
    const result = parse(trimmed)
    assert.deepEqual(result.issues, [])
    assert.equal(result.rows.length, 3)
    assert.equal(result.rows[0].score, 0)
    assert.equal(result.rows[0].songId, song.id)
    assert.equal(result.rows[2].songId, songService.songs.at(-1).id)
    utils.book_append_sheet(trimmed, utils.aoa_to_sheet([]), 'ADVANCED')
    assert.deepEqual(parse(trimmed).rows, result.rows)
    const inferred = parse(book([[100, chart.id, null]], ['Score', 'Chart ID', 'Song ID'])).rows[0]
    for (const [key, value] of Object.entries(input(100))) assert.equal(inferred[key], value)
    assert.equal(parse(book([[100, 'unknown']], ['Score', 'Chart ID'])).issues.length, 1)
    assert.equal(parse(book([[100, null]], ['Score', 'Chart ID'])).issues.length, 1)
    assert.throws(() => parse(book([], ['Score', 'Song ID'])), /Chart ID/)
})

test('only current mode sheets are accepted, with header-relative row limits', () => {
    const legacy = utils.book_new()
    utils.book_append_sheet(legacy, utils.aoa_to_sheet([HEADERS, row()]), '成绩')
    assert.throws(() => parse(legacy), /BASIC/)
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([...Array.from({ length: 9 }, () => []), ['Chart ID', 'Score'], [chart.id, 100]]), 'BASIC')
    assert.equal(parse(workbook).rows.length, 1)
    workbook.Sheets.BASIC.A5010 = { t: 's', v: chart.id }
    workbook.Sheets.BASIC['!ref'] = 'A10:B5010'
    assert.equal(parse(workbook).rows.length, 1)
    workbook.Sheets.BASIC.A5011 = { t: 's', v: chart.id }
    workbook.Sheets.BASIC['!ref'] = 'A10:B5011'
    assert.throws(() => parse(workbook), /5000/)
})

test('prefilled rows with no Score are skipped; zero scores and both modes import', async () => {
    const workbook = createScoreWorkbook()
    workbook.getWorksheet('BASIC').getCell('E6').value = 0
    workbook.getWorksheet('ADVANCED').getCell('E6').value = 1000000
    const result = parseScoreWorkbook(await workbookBytes(workbook))
    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].score, 0)
    assert.equal(result.rows[1].chartId, song.charts.find(c => c.mode === 'advanced').id)
    assert.equal(result.issues.length, 0)
    assert.equal(result.empty, songService.songs.flatMap(s => s.charts).length - 2)
})

test('input formulas and wrong mode errors include sheet and row, while derived formulas are ignored', async () => {
    const workbook = createScoreWorkbook()
    workbook.getWorksheet('BASIC').getCell('E6').value = { formula: '1+1', result: 2 }
    workbook.getWorksheet('ADVANCED').getCell('E6').value = 1000000
    workbook.getWorksheet('ADVANCED').getCell('M6').value = chart.id
    const result = parseScoreWorkbook(await workbookBytes(workbook))
    assert.deepEqual(result.issues.map(issue => [issue.sheet, issue.row]), [['BASIC', 6], ['ADVANCED', 6]])
    assert.match(result.issues[0].message, /公式/)
    assert.match(result.issues[1].message, /模式/)
})
