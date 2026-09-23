export const songCategories = [
    { id: 'anime-pop', ja: 'アニメ・ポップス', en: 'Anime / Pop' },
    { id: 'vtuber', ja: 'VTuber', en: 'VTuber' },
    { id: 'virtual-singer', ja: 'バーチャル・シンガー', en: 'Virtual Singer' },
    { id: 'touhou', ja: '東方アレンジ', en: 'Touhou Project' },
    {
        id: 'music-game',
        ja: '音楽ゲーム・バラエティ',
        en: 'Music Game / Variety',
    },
    { id: 'original', ja: 'オリジナル', en: 'Original' },
] as const
export type SongCategory = (typeof songCategories)[number]['id']
