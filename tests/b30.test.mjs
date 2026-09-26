import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getModeB30 } from '../src/core/rating/calculator.ts'
const row = (id, mode, rating) => ({ id, songId: `song${id}`, chartId: `chart${id}`, mode, rating, score: 1000000, level: '10', difficulty: 'HARD', ja: `曲${id}`, en: `Song ${id}`, updatedAt: id })
test('each mode independently selects thirty charts without mutating input', () => {
    const scores = [...Array.from({length: 31}, (_, i) => row(i, 'ADVANCED', 20 + i / 100)), ...Array.from({length: 31}, (_, i) => row(100 + i, 'BASIC', 10 + i / 100))]
    const before = [...scores]
    for (const mode of ['BASIC', 'ADVANCED']) {
        const result = getModeB30(scores, mode)
        assert.equal(result.items.length, 30)
        assert.equal(result.count, 31)
        assert.ok(result.items.every(item => item.mode === mode))
        assert.equal(result.floor, mode === 'BASIC' ? 10.01 : 20.01)
        assert.equal(result.rating, mode === 'BASIC' ? 10.15 : 20.15)
    }
    assert.deepEqual(scores, before)
})
test('empty mode and partial mode use independent zero padding and floor', () => {
    const scores = [row(1, 'BASIC', 10.49)]
    assert.equal(getModeB30(scores, 'BASIC').rating, .34)
    assert.equal(getModeB30(scores, 'BASIC').floor, 10.49)
    assert.equal(getModeB30(scores, 'ADVANCED').rating, 0)
    assert.equal(getModeB30(scores, 'ADVANCED').floor, null)
    assert.deepEqual(getModeB30(scores, 'ADVANCED').items, [])
})
test('same song different difficulties qualify and ties retain score ordering', () => {
    const scores = [row(1, 'BASIC', 10), {...row(2, 'BASIC', 10), songId: 'song1', difficulty: 'MASTER', score: 1010000}]
    assert.deepEqual(getModeB30(scores, 'BASIC').items.map(item => item.id), [2, 1])
})
