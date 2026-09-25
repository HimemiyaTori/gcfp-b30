import Fuse from 'fuse.js'
import { songService } from '../song/songService'
import type { Song } from '../song/models'
export function normalizeSongText(text: string) {
    return text.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim()
}
const specialAliases: Record<string, string[]> = {
    'Wire&Ring': ['wire ring', 'wire and ring'],
    '1nfinite 5tellar Chronicle': ['infinite stellar chronicle', '1nfinite stellar chronicle', 'infinite 5tellar chronicle'],
    'III': ['3'],
    'Destr0yer': ['destroyer', 'd0'],
    'FREE CONNECTION 2 -G.C.スペシャルエディットVer.-': ['free connection 2 gc スペシャルエディット ver', 'free connection 2 gc スペシャル エディット ver'],
}
export function createSongSearch(songs: Song[]) {
    const entries = songs.map(song => {
        const titles = [song.title.ja, song.title.en ?? '', ...(song.searchAliases ?? []), ...(specialAliases[song.title.ja] ?? []), ...(specialAliases[song.title.en ?? ''] ?? [])].filter(Boolean).map(normalizeSongText)
        return { song, titles, compact: titles.map(t => t.replace(/\s/g, '')), artists: [song.artist.ja, song.artist.en ?? ''].map(normalizeSongText) }
    })
    const fuse = new Fuse(entries, { keys: ['titles', 'compact', 'artists'], includeScore: true, threshold: 0.35, ignoreLocation: true })
    return (query: string) => {
        const term = normalizeSongText(query)
        if (!term) return songs
        const exact = entries.filter(e => e.titles.includes(term) || e.compact.includes(term.replace(/\s/g, '')))
        return [...new Map([...exact.map(e => e.song), ...fuse.search(term).map(r => r.item.song)].map(s => [s.id, s])).values()]
    }
}
export const searchSongs = createSongSearch(songService.songs)
