import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFields, parseInteger, parseStatus, matchSong } from '../src/core/ocr/parser.ts'
import { ScoreDatabase } from '../src/db/database.ts'
import { createScoreRepository } from '../src/db/scoreRepository.ts'

const fields = { layout: 'result', title: 'Idol', status: 'ALL PERFECT', score: '1,048,935', mode: 'ADVANCED', difficulty: 'NORMAL', level: '5', maxChain: '190' }
test('parse result AP/FC, select missing chain, bilingual song and exact chart', () => {
    const result = parseFields(fields)
    assert.deepEqual(result, { kind: 'score', songId: '1', chartId: '1-advanced-normal', score: 1048935, achievements: { fc: true, ap: true, maxChain: 190 } })
    assert.equal(parseFields({ ...fields, title: 'アイドル' }).songId, '1')
    assert.deepEqual(parseFields({ ...fields, layout: 'select', status: 'FULL CHAIN' }).achievements, { fc: true, ap: false, maxChain: undefined })
    for (const status of ['CLEAR', 'FAILED']) assert.equal(parseFields({ ...fields, status }).achievements.fc, false)
    assert.throws(() => parseFields({ ...fields, level: '9' }))
    assert.throws(() => parseFields({ ...fields, mode: 'ADVANCE' }))
    assert.throws(() => parseFields({ ...fields, maxChain: '' }))
    assert.throws(() => matchSong('zzzzzzzzzzzzzzzzzz'))
    assert.equal(matchSong('ray 超かぐや姫 !Version').id, '8')
    assert.equal(matchSong('ray (Cosmic Princess Kaguya! ! Version)').id, '8')
})
test('MISSION/MISSON skip before title or score validation; unplayed select skips', () => {
    for (const status of ['MISSION CLEAR', 'MISSON CLEAR', 'ＭＩＳＳＩＯＮ ＣＬＥＡＲ'])
        assert.equal(parseFields({ ...fields, status, score: 'bad', title: '' }).kind, 'skipped')
    assert.equal(parseFields({ ...fields, layout: 'select', status: '---', score: '0' }).kind, 'skipped')
    assert.throws(() => parseFields({ ...fields, status: '---' }))
    assert.throws(() => parseStatus('MISSION'))
    assert.throws(() => parseStatus('CLEAR MISSION'))
})
test('numeric parser rejects missing grouped digits and out of range values', () => {
    assert.equal(parseInteger('１,０４８,９３５', 'Score'), 1048935)
    assert.equal(parseInteger('1,O48,935', 'Score'), 1048935)
    for (const score of ['1,03 ,647', '1,046. ,807', '1,050,001', '-1', '', 'NaN'])
        assert.throws(() => parseFields({ ...fields, score }))
})
test('persist optional chain/flags, equal-score enrichment, highest score, cancellation and manual correction', async () => {
    const db = new ScoreDatabase(`ocr-${crypto.randomUUID()}`)
    const repo = createScoreRepository(db)
    try {
        const id = await repo.add('1', '1-advanced-normal', 1048935, 'ocr', { fc: true, ap: true })
        await repo.add('1', '1-advanced-normal', 1048935, 'ocr', { fc: true, ap: true, maxChain: 190 })
        assert.equal((await db.scores.get(id)).maxChain, 190)
        await repo.add('1', '1-advanced-normal', 1046807, 'ocr', { fc: true, ap: false, maxChain: 190 })
        assert.equal((await db.scores.get(id)).ap, true)
        await repo.edit(id, 1048935, false, { fc: false, ap: false })
        assert.equal((await db.scores.get(id)).maxChain, undefined)
        assert.equal((await db.scores.get(id)).fc, false)
        for (const maxChain of [-1, 1.5, NaN, '190']) await assert.rejects(repo.edit(id, 1048935, false, { maxChain }))
        await assert.rejects(repo.edit(id, 1048935, false, { fc: false, ap: true }))
        const controller = new AbortController(); controller.abort()
        await assert.rejects(repo.add('1', '1-advanced-normal', 1050000, 'ocr', {}, controller.signal))
        assert.equal((await db.scores.get(id)).score, 1048935)
        db.close(); await db.open()
        assert.equal((await db.scores.get(id)).fc, false)
    } finally { await db.delete() }
})
