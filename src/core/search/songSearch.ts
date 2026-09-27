import Fuse from 'fuse.js'
import { songService } from '../song/songService'
import type { Song } from '../song/models'
import { normalizeSongText, getSongSearchTitles } from './songText'
export function createSongSearch(songs: Song[]) {
    const entries = songs.map(song => {
        const titles = getSongSearchTitles(song)
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
