// Exact integer interpolation; return truncated hundredths as specified in §12.
export function getChartRating(score: number, level: number): number {
    if (!Number.isInteger(score) || score < 0 || score > 1050000 || !Number.isFinite(level) || level < 0 || !Number.isInteger(level * 2)) {
        throw new RangeError('Invalid score or chart level')
    }
    const base = BigInt(level * 100)
    if (score <= 500000) return 0
    if (score < 700000) return Number(BigInt(score - 500000) * (base > 350n ? base - 350n : 0n) / 200000n) / 100
    const nodes = [[700000, -350], [800000, -200], [850000, -150], [900000, -100], [950000, -50], [1000000, 0], [1010000, 50], [1020000, 100], [1030000, 150], [1040000, 200], [1045000, 250]] as const
    if (score >= 1045000) return Number(base + 250n) / 100
    for (let i = 1; i < nodes.length; i++) {
        const [end, endOffset] = nodes[i]!
        const [start, startOffset] = nodes[i - 1]!
        if (score <= end) {
            const width = BigInt(end - start)
            const numerator = (base + BigInt(startOffset)) * width + BigInt(score - start) * BigInt(endOffset - startOffset)
            return numerator > 0n ? Number(numerator / width) / 100 : 0
        }
    }
    return 0
}
