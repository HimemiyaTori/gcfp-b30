import type { SongCategory } from './categories'
// 仅用于视觉展示，不代表权威曲库或评级实现
export interface DemoScore {
    id: number
    ja: string
    en: string
    artist: string
    category: SongCategory
    difficulty: string
    mode: string
    level: string
    score: number
    rating: number
    updatedAt: number
    color: string
    symbol: string
}
const songs = [
    [
        'ouroboros -twin stroke of the end-',
        'ouroboros -twin stroke of the end-',
        'Cranky vs MASAKI',
        '15',
        1045120,
        17.5,
        '#516c84',
        '∞',
    ],
    [
        '1nfinite 5tellar Chronicle',
        '1nfinite 5tellar Chronicle',
        't+pazolite',
        '15',
        1042080,
        17.2,
        '#686289',
        '✦',
    ],
    [
        'Got more raves?',
        'Got more raves?',
        'E.G.G.',
        '15',
        1038240,
        16.91,
        '#b76d53',
        '≋',
    ],
    [
        'セイレーンの邀撃',
        'Siren’s Call',
        'A-One',
        '14+',
        1040560,
        16.55,
        '#347f84',
        '◇',
    ],
    [
        'MEGALOVANIA',
        'MEGALOVANIA',
        'Toby Fox',
        '14',
        1045000,
        16.5,
        '#775e77',
        '⌁',
    ],
    [
        'グルーヴ・リボルバー',
        'Groove Revolver',
        'COSIO',
        '14+',
        1036800,
        16.34,
        '#90704a',
        '◎',
    ],
    [
        '初音ミクの消失',
        'The Disappearance of Hatsune Miku',
        'cosMo@暴走P',
        '14',
        1036500,
        15.82,
        '#458b80',
        'M',
    ],
    [
        'ナイト・オブ・ナイツ',
        'Night of Knights',
        'ビートまりお',
        '13+',
        1041120,
        15.61,
        '#6d7ca0',
        'N',
    ],

    ['TEST', 'test', 'ビートまりお', '14', 1036500, 15.82, '#458b80', 'T'],
] as const
export const demoScores: DemoScore[] = Array.from({ length: 32 }, (_, i) => {
    const s = songs[i % songs.length]!
    const group = Math.floor(i / songs.length)
    return {
        id: i + 1,
        ja: s[0],
        en: s[1],
        artist: s[2],
        category: (
            [
                'original',
                'original',
                'original',
                'touhou',
                'music-game',
                'original',
                'virtual-singer',
                'touhou',
            ] as const
        )[i % songs.length]!,
        difficulty:
            group === 0
                ? 'MASTER'
                : group === 1
                  ? 'HARD'
                  : group === 2
                    ? 'NORMAL'
                    : 'EASY',
        mode: i % 3 === 0 ? 'BASIC' : 'ADVANCED',
        level: group ? String(12 - group) : s[3],
        score: group ? 1020000 - (i % 8) * 2000 : s[4],
        rating: group ? 13 - group - (i % 8) * 0.1 : s[5],
        // 固定演示时间，避免每次打开页面都像刚更新
        updatedAt: Date.UTC(2026, 8, 22, 14, 36) -
            ((i * 7) % 32) * 267 * 60_000 - (i % 5) * 13 * 60_000,
        color: s[6],
        symbol: s[7],
    }
})
