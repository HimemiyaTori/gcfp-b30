import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScoreDatabase } from '../src/db/database.ts'
import { createScoreRepository } from '../src/db/scoreRepository.ts'
import { songService, createSongService, getSongTitle, getSongArtist, formatLevel } from '../src/core/song/songService.ts'
import { searchSongs, normalizeSongText, createSongSearch } from '../src/core/search/songSearch.ts'
import { getChartRating } from '../src/core/rating/calculator.ts'

const song = songService.songs[0], chart = song.charts[0]
async function withDatabase(run) {
    const db = new ScoreDatabase(`test-${crypto.randomUUID()}`)
    try { await run(db, createScoreRepository(db)) } finally { await db.delete() }
}
test('full library IDs and translations; no fabricated charts', () => {
    assert.ok(songService.songs.length > 0)
    assert.ok(songService.songs.every(s => s.charts.length > 0))
    assert.equal(getSongTitle(song, 'en'), 'Idol')
    assert.equal(getSongArtist(song, 'en'), 'YOASOBI')
    assert.equal(formatLevel(10.5), '10+')
    assert.throws(() => songService.getChart('2', chart.id))
    assert.throws(() => createSongService([song, song]))
})
test('search normalizes width, punctuation, whitespace and finds both languages and aliases', () => {
    assert.equal(normalizeSongText(' Ｅｘ-Otogibanashi (Anime ver.)  '), 'exotogibanashi anime ver')
    for (const term of ['アイドル', 'Idol', 'ＩＤＯＬ', 'YOASOBI']) assert.ok(searchSongs(term).some(s => s.id === song.id))
    for (const [title, alias] of [['Wire&Ring', 'wire ring'], ['1nfinite 5tellar Chronicle', 'infinite stellar chronicle'], ['III', '3'], ['Destr0yer', 'd0']]) {
        const search = createSongSearch([{ ...song, title: { ja: title } }])
        assert.equal(search(alias)[0]?.id, song.id)
    }
    assert.equal(searchSongs('zzzzzzzzzzzzzzzzzz').length, 0)
})
test('CRUD survives reopen; score validation; locked association; lowering confirmation', () => withDatabase(async (db, repo) => {
    await repo.initialize()
    for (const score of [-1, 1050001, 1.2, NaN, Infinity, '100']) await assert.rejects(repo.add(song.id, chart.id, score))
    await assert.rejects(repo.add('missing', chart.id, 100))
    const id = await repo.add(song.id, chart.id, 1050000)
    const before = await db.scores.get(id)
    await assert.rejects(repo.add(song.id, chart.id, 100))
    await assert.rejects(repo.edit(id, 0))
    await repo.edit(id, 0, true)
    let record = await db.scores.get(id)
    assert.equal(record.rating, 0); assert.equal(record.source, 'manual')
    assert.equal(record.chartId, chart.id); assert.equal(record.createdAt, before.createdAt)
    await repo.edit(id, 0)
    assert.deepEqual(await db.scores.get(id), record)
    db.close(); await db.open()
    assert.equal((await repo.list()).length, 1)
    await repo.remove(id); assert.equal((await repo.list()).length, 0)
    await assert.rejects(repo.edit(id, 100))
}))
test('concurrent OCR writes remain unique and retain only highest; no-op preserves metadata', () => withDatabase(async (db, repo) => {
    await repo.initialize()
    await Promise.all([700000, 1050000, 800000, 999999].map(score => repo.add(song.id, chart.id, score, 'ocr')))
    const [record] = await repo.list()
    assert.equal(await db.scores.count(), 1); assert.equal(record.score, 1050000)
    await repo.add(song.id, chart.id, 1050000, 'ocr')
    assert.deepEqual((await repo.list())[0], record)
    await assert.rejects(db.scores.add({ ...record, id: undefined }))
    await repo.edit(record.id, 100, true)
    assert.equal((await repo.list())[0].source, 'manual')
    await repo.add(song.id, chart.id, 200, 'ocr')
    assert.equal((await repo.list())[0].source, 'ocr')
}))
test('version recalculation commits ratings and marker together, rolls back on missing chart', () => withDatabase(async (db, repo) => {
    await repo.initialize()
    const id = await repo.add(song.id, chart.id, 1000000)
    const before = await db.scores.get(id)
    const changed = createSongService([{ ...song, charts: song.charts.map(c => ({ ...c, level: c.level + 1 })) }])
    const version = { songLibraryVersion: 'test-2', ratingRuleVersion: 'test-2' }
    await createScoreRepository(db, changed, version).initialize()
    assert.equal((await db.scores.get(id)).rating, getChartRating(before.score, chart.level + 1))
    assert.equal((await db.scores.get(id)).updatedAt, before.updatedAt)
    const other = songService.songs[1]
    await repo.add(other.id, other.charts[0].id, 1000000)
    const oldRecords = await repo.list(), oldMetadata = await db.metadata.get('calculation')
    await assert.rejects(createScoreRepository(db, changed, { ...version, songLibraryVersion: 'test-3' }).initialize())
    assert.deepEqual(await repo.list(), oldRecords)
    assert.deepEqual(await db.metadata.get('calculation'), oldMetadata)
}))
test('clear removes all scores while retaining calculation metadata', () => withDatabase(async (db, repo) => {
    await repo.initialize()
    await repo.add(song.id, chart.id, 1000000)
    await repo.add(song.id, song.charts[1].id, 900000)
    const metadata = await db.metadata.get('calculation')
    await repo.clear()
    assert.equal((await repo.list()).length, 0)
    assert.deepEqual(await db.metadata.get('calculation'), metadata)
    db.close(); await db.open()
    assert.equal((await repo.list()).length, 0)
    await repo.add(song.id, chart.id, 800000)
    assert.equal((await repo.list()).length, 1)
}))
