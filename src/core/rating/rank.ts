// 来源：Groove Coaster Wiki，SwitchFP / ゲーム概要, スコアランク
// 核验日期：2026-09-22，完整来源链接记录在设计文档第 12.4 节
export type ScoreRank =
    | 'E'
    | 'D'
    | 'C'
    | 'B'
    | 'A'
    | 'AA'
    | 'AAA'
    | 'S'
    | 'S+'
    | 'SS'
    | 'SS+'
    | 'SSS'
    | 'SSS+'

const thresholds: readonly (readonly [number, ScoreRank])[] = [
    [1040000, 'SSS+'],
    [1030000, 'SSS'],
    [1020000, 'SS+'],
    [1010000, 'SS'],
    [1000000, 'S+'],
    [950000, 'S'],
    [900000, 'AAA'],
    [850000, 'AA'],
    [800000, 'A'],
    [700000, 'B'],
    [500000, 'C'],
    [300000, 'D'],
    [0, 'E'],
]

export function getRankByScore(score: number): ScoreRank {
    if (!Number.isInteger(score) || score < 0 || score > 1050000) {
        throw new RangeError('Score 必须是 0～1,050,000 范围内的整数')
    }
    return thresholds.find(([minimum]) => score >= minimum)![1]
}
