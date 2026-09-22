// Visual fixtures only. These are not an authoritative song library or rating implementation.
export interface DemoScore {
    id: number
    ja: string
    en: string
    artist: string
    difficulty: string
    mode: string
    level: string
    score: number
    rating: number
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
] as const
export const demoScores: DemoScore[] = Array.from({ length: 32 }, (_, i) => {
    const s = songs[i % songs.length]!
    const group = Math.floor(i / songs.length)
    return {
        id: i + 1,
        ja: s[0],
        en: s[1],
        artist: s[2],
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
        color: s[6],
        symbol: s[7],
    }
})
