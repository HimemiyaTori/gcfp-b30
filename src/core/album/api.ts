import { AlbumError, DomainError } from '../errors'
import { accountContext } from '../../db/accountContext'
export interface Binding { status: 'active' | 'unbound'; configured: boolean; accountId?: string; bindingId?: string; nickname?: string; avatarUrl?: string; legacyAvailable?: boolean; nextAllowedAt?: number; lastCheckedAt?: number }
export interface AlbumMedia { mediaId: string; applicationId: string; capturedAt: number | null; contentLength: number; expiresAt: number; contentUri?: string; ticket: string }
export interface MediaResponse { accountId: string; bindingId: string; avatarUrl?: string; media: AlbumMedia[] }
export async function request<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(120000)
    try {
        const headers: Record<string, string> = { 'X-App-Protocol-Version': '1' }
        if (body) headers['Content-Type'] = 'application/json'
        if (accountContext.userId) headers['X-App-Account-Id'] = accountContext.userId
        const response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
        if (!response.ok) {
            const result = await response.json().catch(() => ({}))
            signal?.throwIfAborted()
            const code = typeof result.error === 'string' && /^[a-z_]+$/.test(result.error) ? result.error : 'request_failed'
            throw new AlbumError(code, Date.now() + Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000)
        }
        const result = await response.json()
        signal?.throwIfAborted()
        return result as T
    } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof AlbumError) throw error
        throw new AlbumError('network_error')
    }
}
export function credentialLock<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!navigator.locks) throw new DomainError('album.locksRequired')
    signal?.throwIfAborted()
    return navigator.locks.request('groove-nintendo-credentials', { signal }, work) as Promise<T>
}
export async function download(media: AlbumMedia, signal: AbortSignal) {
    let response: Response
    try {
        response = await fetch(media.contentUri || '/api/album/content', media.contentUri ? { credentials: 'omit', referrerPolicy: 'no-referrer', signal, cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Protocol-Version': '1', ...(accountContext.userId ? { 'X-App-Account-Id': accountContext.userId } : {}) }, body: JSON.stringify({ ticket: media.ticket }), signal, cache: 'no-store' })
    } catch { signal.throwIfAborted(); throw new AlbumError('download_failed') }
    if (!response.ok) {
        const data = media.contentUri ? {} : await response.json().catch(() => ({}))
        const code = response.status === 429 ? 'rate_limited' : typeof data.error === 'string' ? data.error : response.status === 403 || response.status === 404 ? 'media_expired' : 'download_failed'
        throw new AlbumError(code, Date.now() + Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000)
    }
    const max = 20 * 1024 * 1024
    const type = response.headers.get('content-type')?.split(';')[0] || ''
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) { await response.body?.cancel(); throw new AlbumError('invalid_image') }
    if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new AlbumError('too_large') }
    if (!response.body) throw new AlbumError('download_failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        while (true) {
            signal.throwIfAborted()
            const result = await reader.read()
            if (result.done) break
            size += result.value.length
            if (size > max) throw new AlbumError('too_large')
            chunks.push(result.value)
        }
    } finally { await reader.cancel().catch(() => {}) }
    if (!size) throw new AlbumError('invalid_image')
    return new Blob(chunks, { type })
}
