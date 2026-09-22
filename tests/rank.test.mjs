import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getRankByScore } from '../src/core/rating/rank.ts'

const ranges = [
    [0, 299999, 'E'], [300000, 499999, 'D'], [500000, 699999, 'C'],
    [700000, 799999, 'B'], [800000, 849999, 'A'], [850000, 899999, 'AA'],
    [900000, 949999, 'AAA'], [950000, 999999, 'S'], [1000000, 1009999, 'S+'],
    [1010000, 1019999, 'SS'], [1020000, 1029999, 'SS+'],
    [1030000, 1039999, 'SSS'], [1040000, 1050000, 'SSS+'],
]
for (const [minimum, maximum, rank] of ranges) {
    test(`${rank}: inclusive lower and upper boundaries`, () => {
        assert.equal(getRankByScore(minimum), rank)
        assert.equal(getRankByScore(maximum), rank)
    })
}
test('reject scores outside the valid integer domain', () => {
    for (const score of [-1, 1050001, 300000.5, NaN, Infinity]) {
        assert.throws(() => getRankByScore(score), RangeError)
    }
})
