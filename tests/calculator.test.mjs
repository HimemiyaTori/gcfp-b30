import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getChartRating } from '../src/core/rating/calculator.ts'
test('low-score boundary interpolation and truncation', () => {
    for (const [score, expected] of [[0,0],[500000,0],[500001,0],[600000,5.25],[699999,10.49],[700000,10.5]]) assert.equal(getChartRating(score,14), expected)
})
test('score nodes, half levels, exact decimal boundaries, cap', () => {
    for (const [score, expected] of [[800000,12],[850000,12.5],[900000,13],[950000,13.5],[1000000,14],[1010000,14.5],[1020000,15],[1030000,15.5],[1035000,15.75],[1036800,15.84],[1040000,16],[1044999,16.49],[1045000,16.5],[1050000,16.5]]) assert.equal(getChartRating(score,14), expected)
    assert.equal(getChartRating(1036800,14.5),16.34)
})
test('low base never produces a negative rating', () => {
    assert.equal(getChartRating(699999,1),0)
    assert.equal(getChartRating(700000,1),0)
    assert.equal(getChartRating(850000,1),0)
})
test('invalid inputs are rejected', () => {
    for (const score of [-1,1050001,1.5,NaN,Infinity]) assert.throws(()=>getChartRating(score,14),RangeError)
    for (const level of [-1,NaN,Infinity,14.1]) assert.throws(()=>getChartRating(1000000,level),RangeError)
})
