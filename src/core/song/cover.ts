export const COVER_SIZE = 128
export const COVER_DIR = 'covers'

// 构建脚本与页面共用，按来源地址命名，同一曲绘只生成一份
export function coverFileName(sourceUrl: string) {
    let hash = 0x811c9dc5
    for (const char of sourceUrl) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193)
    return `${(hash >>> 0).toString(16).padStart(8, '0')}.jpg`
}

export const coverThumbUrl = (sourceUrl: string) => (sourceUrl ? `${import.meta.env?.BASE_URL ?? '/'}${COVER_DIR}/${coverFileName(sourceUrl)}` : '')
