import type { Song } from '../song/models'

export function normalizeSongText(text: string) {
    return text.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim()
}

export function getSongSearchTitles(song: Song) {
    return [...new Set([song.title.ja, song.title.en, ...(song.searchAliases ?? [])]
        .filter((title): title is string => !!title)
        .map(normalizeSongText))]
}
