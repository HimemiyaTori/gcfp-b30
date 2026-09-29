import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { utils, read, write } from 'xlsx'
import { addWorkbookCovers } from '../src/core/excel/covers.ts'
import { createScoreWorkbook, parseScoreWorkbook, workbookBytes, HEADERS, MAX_EXCEL_BYTES } from '../src/core/excel/workbook.ts'
import { planScoreImport } from '../src/core/score/import.ts'
import { songService } from '../src/core/song/songService.ts'
import { coverThumbUrl } from '../src/core/song/cover.ts'
import { getChartRating } from '../src/core/rating/calculator.ts'
import { ScoreDatabase } from '../src/db/database.ts'
import { createScoreRepository } from '../src/db/scoreRepository.ts'

const song = songService.songs[0]
const chart = song.charts[0]
const input = (score = 1000000, extra = {}) => ({ songId: song.id, chartId: chart.id, score, ...extra })
const record = (extra = {}) => ({ ...input(), rating: 999, source: 'manual', createdAt: 1000, updatedAt: 2000, ...extra })
function book(rows, headers = HEADERS) {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([headers, ...rows]), '成绩')
    return workbook
}
const parse = workbook => parseScoreWorkbook(write(workbook, { type: 'array', bookType: 'xlsx' }))
const row = (score = 1000000, extra = []) => [song.id, chart.id, '错误的参考曲名', '无关模式', '', '', score, ...extra]
async function withDatabase(run) {
    const db = new ScoreDatabase(`excel-${crypto.randomUUID()}`)
    try { await run(db, createScoreRepository(db)) } finally { await db.delete() }
}

test('two mode sheets include all charts, hidden identifiers, input validation and live formulas', async () => {
    const workbook = createScoreWorkbook([], 'en', true)
    const serialized = await workbookBytes(workbook)
    const saved = read(serialized, { cellStyles: true })
    assert.deepEqual(saved.SheetNames, ['BASIC', 'ADVANCED'])
    assert.equal(parseScoreWorkbook(serialized).rows.length, 0)
    for (const mode of saved.SheetNames) {
        const ws = saved.Sheets[mode]
        const expected = songService.songs.flatMap(s => s.charts.filter(c => c.mode.toUpperCase() === mode)).length
        assert.equal(utils.decode_range(ws['!ref']).e.r - 4, expected)
        assert.equal(ws.N6.t, 's')
        assert.ok(ws.F6.f && ws.G6.f)
        for (const index of [10, 11, 12, 13]) assert.equal(ws['!cols'][index].hidden, true)
        assert.ok(workbook.getWorksheet(mode).getCell('E6').dataValidation)
    }
    assert.equal(saved.Sheets.BASIC.B6.v, 'Idol')
})

test('binary XLSX round trip preserves flags, unknowns, zeros and timestamps; rating is recalculated', () => withDatabase(async (db, repo) => {
    const original = [record({ score: 0, fc: false, ap: false, maxChain: 0 }), record({ chartId: song.charts[1].id, fc: true, ap: true, maxChain: 123 }), record({ chartId: song.charts[2].id })]
    const workbook = createScoreWorkbook(original)
    workbook.getWorksheet('BASIC').getCell('G7').value = { formula: '1/0', result: { error: '#DIV/0!' } }
    const parsed = parseScoreWorkbook(await workbookBytes(workbook))
    assert.deepEqual(parsed.issues, [])
    assert.deepEqual(await repo.importScores(parsed.rows), { added: 3, updated: 0, skipped: 0 })
    for (const expected of original) {
        const actual = (await repo.list()).find(r => r.chartId === expected.chartId)
        for (const key of ['songId', 'chartId', 'score', 'fc', 'ap', 'maxChain', 'createdAt', 'updatedAt']) assert.equal(actual[key], expected[key], key)
        assert.equal(actual.rating, getChartRating(expected.score, songService.getChart(expected.songId, expected.chartId).chart.level))
        assert.equal(actual.source, 'excel')
    }
    assert.deepEqual(await repo.importScores(parsed.rows), { added: 0, updated: 0, skipped: 3 })
    db.close(); await db.open()
    assert.equal(await db.scores.count(), 3)
}))

test('input columns can be reordered; numeric IDs, string numbers and AP normalization work', () => {
    const parsed = parse(book([[' 1000000 ', chart.id, Number(song.id), '是']], ['Score', 'Chart ID', 'Song ID', 'AP']))
    assert.deepEqual(parsed.issues, [])
    assert.equal(parsed.rows[0].fc, true)
    assert.equal(parsed.rows[0].ap, true)
})

test('invalid scores, flags, chain, chart IDs and dates produce exact row errors', () => {
    for (const score of [null, '', '1,000,000', -1, 1050001, 1.5, true, 'NaN']) {
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
    formula.Sheets['成绩'].G2 = { t: 'n', v: 1000000, f: '1000000' }
    assert.match(parse(formula).issues[0].message, /公式/)
    formula.Sheets['成绩'].G2 = { t: 'n', f: '1000000' }
    assert.match(parse(formula).issues[0].message, /公式/)
    const errorCell = book([row()])
    errorCell.Sheets['成绩'].H2 = { t: 'e', v: 7 }
    assert.match(parse(errorCell).issues[0].message, /错误值/)
    const headerFormula = book([row()])
    headerFormula.Sheets['成绩'].A1.f = '"Song ID"'
    assert.throws(() => parse(headerFormula), /表头/)
    assert.throws(() => parse(book([], ['Score'])), /Song ID/)
    assert.throws(() => parse(book([], [...HEADERS, 'Score'])), /重复/)
    const wrong = utils.book_new()
    utils.book_append_sheet(wrong, utils.aoa_to_sheet([['x']]), 'Sheet1')
    assert.throws(() => parse(wrong), /BASIC/)
})

test('oversized input, row and column limits and unreadable workbooks fail before import', () => {
    assert.throws(() => parseScoreWorkbook(new ArrayBuffer(MAX_EXCEL_BYTES + 1)), /5 MiB/)
    assert.throws(() => parseScoreWorkbook(new Uint8Array([0, 255, 0, 255]).buffer))
    const tooMany = book([])
    tooMany.Sheets['成绩'].A5002 = { t: 's', v: 'x' }
    tooMany.Sheets['成绩']['!ref'] = 'A1:N5002'
    assert.throws(() => parse(tooMany), /5000/)
    const tooWide = book([])
    tooWide.Sheets['成绩'].AG2 = { t: 's', v: 'x' }
    tooWide.Sheets['成绩']['!ref'] = 'A1:AG2'
    assert.throws(() => parse(tooWide), /32/)
})

test('merge retains high scores and known flags; enrichment updates only appropriate timestamps', () => {
    const old = record({ id: 1, fc: false, maxChain: 0 })
    assert.deepEqual(planScoreImport([input(999999, { ap: true })], [old]).summary, { added: 0, updated: 0, skipped: 1 })
    const conflict = planScoreImport([input(1000000, { ap: true, maxChain: 100 })], [old])
    assert.equal(conflict.writes.length, 0)
    const chain = planScoreImport([input(1000000, { maxChain: 100 })], [record()], 3000)
    assert.equal(chain.writes[0].updatedAt, 2000)
    const flag = planScoreImport([input(1000000, { fc: false })], [record()], 3000)
    assert.equal(flag.writes[0].updatedAt, 3000)
    const higher = planScoreImport([input(1000001)], [old], 3000)
    assert.equal(higher.writes[0].createdAt, 1000)
    assert.equal(higher.writes[0].fc, undefined)
    assert.equal(higher.writes[0].updatedAt, 3000)
})

test('commit rechecks current scores after preview and concurrent imports remain unique', () => withDatabase(async (db, repo) => {
    assert.equal((await repo.previewImport([input()])).added, 1)
    await repo.addManual(song.id, chart.id, 1050000)
    assert.deepEqual(await repo.importScores([input()]), { added: 0, updated: 0, skipped: 1 })
    await repo.clear()
    await Promise.all([repo.importScores([input(100)]), repo.importScores([input(200)])])
    assert.equal(await db.scores.count(), 1)
    assert.equal((await repo.list())[0].score, 200)
}))

test('invalid batches and actual write failures roll back every write', () => withDatabase(async (db, repo) => {
    const rows = [input(), input(100, { chartId: song.charts[1].id })]
    await assert.rejects(repo.importScores([...rows, input(-1, { chartId: song.charts[2].id })]))
    assert.equal(await db.scores.count(), 0)
    await assert.rejects(repo.importScores([input(), input()]))
    const fail = (_key, value) => { if (value.chartId === song.charts[1].id) throw new Error('模拟写入失败') }
    db.scores.hook('creating', fail)
    await assert.rejects(repo.importScores(rows), /模拟写入失败/)
    assert.equal(await db.scores.count(), 0)
    db.scores.hook('creating').unsubscribe(fail)
    assert.equal((await repo.importScores(rows)).added, 2)
}))

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

test('cover failures preserve placeholder; one downloaded image is reused across modes', async () => {
    const workbook = createScoreWorkbook()
    const urls = []
    const result = await addWorkbookCovers(workbook, async url => {
        urls.push(url)
        if (urls.length !== 1) throw new Error('模拟网络失败')
        return 'data:image/jpeg;base64,/9j/2Q=='
    })
    const unique = new Set(songService.songs.map(s => coverThumbUrl(s.coverSourceUrl)))
    assert.equal(urls.length, unique.size)
    assert.equal(new Set(urls).size, unique.size)
    assert.equal(urls[0], coverThumbUrl(song.coverSourceUrl))
    assert.match(urls[0], /^\/covers\/[0-9a-f]{8}\.jpg$/)
    assert.equal(result.loaded, 1)
    assert.equal(result.missing, unique.size - 1)
    for (const sheet of workbook.worksheets) {
        assert.equal(sheet.getImages().length, 1)
        assert.equal(sheet.getCell('A6').value, null)
        assert.equal(sheet.getCell('A10').value, '♪')
    }
})

test('songs sharing a cover source request the thumbnail once', async () => {
    const groups = Map.groupBy(songService.songs, s => s.coverSourceUrl)
    const [source, shared] = [...groups].find(([, list]) => list.length > 1)
    const workbook = createScoreWorkbook()
    const urls = []
    await addWorkbookCovers(workbook, async url => {
        urls.push(url)
        if (url !== coverThumbUrl(source)) throw new Error('模拟网络失败')
        return 'data:image/jpeg;base64,/9j/2Q=='
    })
    assert.equal(urls.filter(url => url === coverThumbUrl(source)).length, 1)
    const blocks = workbook.worksheets.flatMap(sheet => shared.filter(s => s.charts.some(c => c.mode.toUpperCase() === sheet.name)))
    assert.equal(workbook.worksheets.reduce((sum, sheet) => sum + sheet.getImages().length, 0), blocks.length)
})
