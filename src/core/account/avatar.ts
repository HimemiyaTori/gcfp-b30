import { AccountError } from '../errors'

export async function compressAvatar(file: File): Promise<Blob> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw new AccountError('invalid_avatar')
    let bitmap: ImageBitmap
    try { bitmap = await createImageBitmap(file) } catch { throw new AccountError('invalid_avatar') }
    try {
        if (bitmap.width * bitmap.height > 40_000_000) throw new AccountError('invalid_avatar')
        const side = Math.min(bitmap.width, bitmap.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new AccountError('invalid_avatar')
        ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
        for (const quality of [0.85, 0.7, 0.5]) {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality))
            if (blob?.type === 'image/webp' && blob.size <= 100 * 1024) return blob
        }
        throw new AccountError('invalid_avatar')
    } finally { bitmap.close() }
}
