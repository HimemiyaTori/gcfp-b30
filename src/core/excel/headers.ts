export const TEMPLATE_HEADERS = [
    '曲绘', '曲名', '难度', '等级', 'Score', 'Rank', 'RT', 'FC', 'AP',
    'Max Chain', '更新时间', 'Chart ID', 'Song ID',
] as const

export const localizedHeaders = {
    'zh-CN': ['曲绘', '曲名', '难度', '等级', '分数', '评级', 'Rating', 'FC', 'AP', 'Max Chain', '更新时间', '谱面 ID', '曲目 ID'],
    'zh-TW': ['曲繪', '曲名', '難度', '等級', '分數', '評級', 'Rating', 'FC', 'AP', 'Max Chain', '更新時間', '譜面 ID', '曲目 ID'],
    ja: ['ジャケット', '曲名', '難易度', 'レベル', 'スコア', 'ランク', 'レーティング', 'FC', 'AP', 'Max Chain', '更新日時', '譜面 ID', '楽曲 ID'],
    en: ['Cover', 'Title', 'Difficulty', 'Level', 'Score', 'Rank', 'Rating', 'FC', 'AP', 'Max Chain', 'Updated At', 'Chart ID', 'Song ID'],
} as const

export type ExcelLanguage = keyof typeof localizedHeaders

const headerAliases = new Map<string, string>(
    TEMPLATE_HEADERS.map((header) => [header, header]),
)
for (const header of ['最大连击', '最大連擊', '最大チェイン'])
    headerAliases.set(header, 'Max Chain')
for (const headers of Object.values(localizedHeaders))
    headers.forEach((header, index) => headerAliases.set(header, TEMPLATE_HEADERS[index]!))

export function normalizeExcelHeader(value: unknown) {
    const header = String(value ?? '').trim()
    return headerAliases.get(header) ?? header
}
