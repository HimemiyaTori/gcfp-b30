import { ApiError, type Env } from './types'
export const SESSION = '__Host-nintendo-session'
export const CORAL = '__Host-nintendo-coral'
export const FLOW = '__Host-nintendo-flow'
const encoder = new TextEncoder()
export function base64(value: Uint8Array) {
    let result = ''
    for (let i = 0; i < value.length; i += 8192) result += String.fromCharCode(...value.subarray(i, i + 8192))
    return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function unbase64(value: string) {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
async function key(env: Env) {
    if (!env.COOKIE_KEY) throw new ApiError('not_configured', 503)
    let raw: Uint8Array
    try { raw = unbase64(env.COOKIE_KEY) } catch { throw new ApiError('not_configured', 503) }
    if (raw.length !== 32) throw new ApiError('not_configured', 503)
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function seal(env: Env, purpose: string, data: object, expiresAt: number) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const version = env.COOKIE_KEY_VERSION || '1'
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${purpose}:${version}`) }, await key(env), encoder.encode(JSON.stringify({ ...data, expiresAt })))
    return `${version}.${base64(iv)}.${base64(new Uint8Array(encrypted))}`
}
export async function unseal<T>(env: Env, purpose: string, value: string): Promise<(T & { expiresAt: number }) | undefined> {
    try {
        const [version, nonce, ciphertext, extra] = value.split('.')
        if (extra || version !== (env.COOKIE_KEY_VERSION || '1') || !nonce || !ciphertext) return
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(nonce), additionalData: encoder.encode(`${purpose}:${version}`) }, await key(env), unbase64(ciphertext))
        const data = JSON.parse(new TextDecoder().decode(decrypted))
        if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) return
        return data
    } catch { return }
}
export function cookieValue(request: Request, name: string) {
    return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || ''
}
export async function readCookie<T>(request: Request, env: Env, name: string) { return unseal<T>(env, name, cookieValue(request, name)) }
export function clearCookie(headers: Headers, name: string) { headers.append('Set-Cookie', `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`) }
export async function setCookie(headers: Headers, env: Env, name: string, data: object, seconds: number) {
    const value = await seal(env, name, data, Date.now() + seconds * 1000)
    const cookie = `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(seconds)}`
    if (cookie.length >= 4096) throw new ApiError('cookie_too_large', 502)
    headers.append('Set-Cookie', cookie)
}
