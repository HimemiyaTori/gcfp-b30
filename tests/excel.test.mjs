import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { utils, read, write } from 'xlsx'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScoreWorkbook, workbookBytes } from '../src/core/excel/template.ts'
import { parseScoreWorkbook } from '../src/core/excel/reader.ts'
import { MAX_EXCEL_BYTES } from '../src/core/excel/models.ts'
import { songService } from '../src/core/song/songService.ts'

const song = songService.songs[0]
const chart = song.charts[0]
const record = (extra = {}) => ({
    songId: song.id,
    chartId: chart.id,
    score: 1000000,
    rating: 999,
    source: 'manual',
    updatedAt: 2000,
    ...extra,
})
const files = await mkdtemp(join(tmpdir(), 'fp-excel-files-'))
let fileNumber = 0
async function savedFile(data) {
    const path = join(files, `${fileNumber++}.xlsx`)
    await writeFile(path, Buffer.from(data))
    return readFile(path)
}
const savedWorkbook = async workbook => savedFile(await workbookBytes(workbook))

test('saved template includes both modes, all charts, hidden IDs, input validation and formulas', async () => {
    const serialized = await savedWorkbook(createScoreWorkbook([], 'en', true))
    const saved = read(serialized, { cellStyles: true })
    const restored = new ExcelJS.Workbook()
    await restored.xlsx.load(serialized)
    assert.deepEqual(saved.SheetNames, ['BASIC', 'ADVANCED'])
    assert.equal(parseScoreWorkbook(serialized).rows.length, 0)
    for (const mode of saved.SheetNames) {
        const ws = saved.Sheets[mode]
        const expected = songService.songs.flatMap(s =>
            s.charts.filter(c => c.mode.toUpperCase() === mode),
        ).length
        assert.equal(utils.decode_range(ws['!ref']).e.r, expected)
        assert.equal(ws.M2.t, 's')
        assert.equal(Object.values(ws).some(cell => cell?.v === '创建时间'), false)
        assert.ok(ws.F2.f && ws.G2.f)
        for (const index of [10, 11, 12])
            assert.equal(ws['!cols'][index].hidden, true)
        assert.equal(restored.getWorksheet(mode).getCell('E2').dataValidation.type, 'whole')
    }
    assert.equal(saved.Sheets.BASIC.B2.v, 'Idol')
})

test('saved XLSX round trip preserves both modes, zero scores, achievements, unknown chain and timestamps', async () => {
    const original = [
        record({ score: 0, fc: false, ap: false, maxChain: 0 }),
        record({ chartId: song.charts[1].id, fc: true, ap: true, maxChain: 123 }),
        record({ chartId: song.charts[2].id }),
        record({ chartId: song.charts[3].id, fc: true, ap: false }),
        record({ chartId: song.charts.find(c => c.mode === 'advanced').id }),
    ]
    const workbook = createScoreWorkbook(original)
    // 派生列的公式错误不影响成绩输入列的文件往返
    workbook.getWorksheet('BASIC').getCell('G3').value = {
        formula: '1/0',
        result: { error: '#DIV/0!' },
    }
    const parsed = parseScoreWorkbook(await savedWorkbook(workbook))
    assert.deepEqual(parsed.issues, [])
    assert.equal(parsed.rows.length, original.length)
    for (const expected of original) {
        const actual = parsed.rows.find(row => row.chartId === expected.chartId)
        assert.ok(actual, expected.chartId)
        for (const key of ['songId', 'chartId', 'score', 'fc', 'ap', 'maxChain', 'updatedAt'])
            assert.equal(actual[key], ['fc', 'ap'].includes(key) ? expected[key] ?? false : expected[key], key)
    }
})

test('saved XLSX uses chart combo limits, a missing-combo fallback and chart totals above 2000', async () => {
    const known = song.charts.find(chart => chart.mode === 'advanced')
    const larger = song.charts.find(chart => chart.mode === 'advanced' && chart.id !== known.id)
    const previousCombo = larger.combo
    // 用曲库资料准备超过兜底值的真实文件，验收上限以谱面总连击数为准
    larger.combo = 2400
    try {
        const workbook = createScoreWorkbook([
            record({ maxChain: 2000 }),
            record({ chartId: known.id, maxChain: known.combo }),
            record({ chartId: larger.id, maxChain: 2400 }),
        ])
        const data = await savedWorkbook(workbook)
        const restored = new ExcelJS.Workbook()
        await restored.xlsx.load(data)
        const targets = []
        for (const sheet of restored.worksheets) {
            sheet.eachRow(row => {
                const id = row.getCell(12).value
                const max = id === chart.id ? 2000 : id === known.id ? known.combo : id === larger.id ? 2400 : undefined
                if (max === undefined) return
                assert.deepEqual(row.getCell(10).dataValidation.formulae, [0, max])
                assert.ok(row.getCell(10).dataValidation.error.includes(String(max)))
                targets.push({ sheet, row: row.number, max })
            })
        }
        const parsed = parseScoreWorkbook(data)
        assert.deepEqual(parsed.issues, [])
        assert.deepEqual(parsed.rows.map(row => row.maxChain), [2000, known.combo, 2400])
        for (const target of targets) target.sheet.getCell(target.row, 10).value = target.max + 1
        const rejected = parseScoreWorkbook(await savedWorkbook(restored))
        assert.equal(rejected.rows.length, 0)
        assert.deepEqual(rejected.issues.map(issue => [issue.sheet, issue.row]), targets.map(target => [target.sheet.name, target.row]))
    } finally {
        larger.combo = previousCombo
    }
})

test('edited template file retains scores after deleting rows, reordering columns and removing one mode', async () => {
    const source = createScoreWorkbook([
        record({ score: 0 }),
        record({ chartId: song.charts[2].id }),
        record({ chartId: songService.songs.at(-1).charts[3].id }),
    ])
    const original = read(await savedWorkbook(source))
    const cells = utils.sheet_to_json(original.Sheets.BASIC, {
        header: 1,
        raw: true,
        defval: null,
    })
    const columns = ['分数', '谱面 ID', 'AP'].map(header => cells[0].indexOf(header))
    // 模拟只保留已游玩行，重排输入列并删除参考列、可选列与另一张表
    const retained = [cells[0], ...cells.slice(1).filter(row => row[4] !== null)]
        .map(row => columns.map(index => row[index]))
    const trimmed = utils.book_new()
    utils.book_append_sheet(trimmed, utils.aoa_to_sheet(retained), 'BASIC')
    const result = parseScoreWorkbook(await savedFile(write(trimmed, { type: 'buffer', bookType: 'xlsx' })))
    assert.deepEqual(result.issues, [])
    assert.deepEqual(result.rows.map(row => [row.songId, row.chartId, row.score]), [
        [song.id, chart.id, 0],
        [song.id, song.charts[2].id, 1000000],
        [songService.songs.at(-1).id, songService.songs.at(-1).charts[3].id, 1000000],
    ])
})

test('invalid files and input cells report required headers, supported sheets and exact error locations', async () => {
    const workbook = createScoreWorkbook()
    workbook.getWorksheet('BASIC').getCell('E2').value = { formula: '1+1', result: 2 }
    workbook.getWorksheet('ADVANCED').getCell('E2').value = 1000000
    workbook.getWorksheet('ADVANCED').getCell('L2').value = chart.id
    const result = parseScoreWorkbook(await savedWorkbook(workbook))
    assert.deepEqual(result.issues.map(issue => [issue.sheet, issue.row]), [
        ['BASIC', 2],
        ['ADVANCED', 2],
    ])
    assert.match(result.issues[0].message, /公式/)
    assert.match(result.issues[1].message, /模式/)

    const missingHeader = new ExcelJS.Workbook()
    missingHeader.addWorksheet('BASIC').addRow(['Score'])
    const missingHeaderBytes = await savedWorkbook(missingHeader)
    assert.throws(() => parseScoreWorkbook(missingHeaderBytes), /Chart ID/)

    const legacy = new ExcelJS.Workbook()
    legacy.addWorksheet('成绩').addRow(['Chart ID', 'Score'])
    const legacyBytes = await savedWorkbook(legacy)
    assert.throws(() => parseScoreWorkbook(legacyBytes), /BASIC/)

    const invalidFile = await savedFile(new Uint8Array([0, 255, 0, 255]))
    assert.throws(() => parseScoreWorkbook(invalidFile))
})

test('oversized files and sheets exceeding row or column limits are rejected', async () => {
    const oversized = await savedFile(new Uint8Array(MAX_EXCEL_BYTES + 1))
    assert.throws(() => parseScoreWorkbook(oversized), /5 MB/)

    const tooMany = new ExcelJS.Workbook()
    const rows = tooMany.addWorksheet('BASIC')
    // 前置说明行不计入数据行数，实际文件仍不能超过五千行数据
    rows.getRow(10).values = ['Chart ID', 'Score']
    rows.getRow(5011).values = [chart.id, 100]
    const tooManyBytes = await savedWorkbook(tooMany)
    assert.throws(() => parseScoreWorkbook(tooManyBytes), /5000/)

    const tooWide = new ExcelJS.Workbook()
    const columns = tooWide.addWorksheet('BASIC')
    columns.addRow(['Chart ID', 'Score'])
    columns.getCell('AG2').value = 'extra'
    const tooWideBytes = await savedWorkbook(tooWide)
    assert.throws(() => parseScoreWorkbook(tooWideBytes), /32/)
})
