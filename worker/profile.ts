import { getBinding } from './bindings'
import type { AuthSession } from './auth'
import { ApiError, bytes, jsonBody, type Env } from './types'

export const MAX_AVATAR_BYTES = 100 * 1024

export async function accountView(env: Env, userId: string) {
    const user = await env.DB.prepare('SELECT id, email, name, image FROM user WHERE id = ?').bind(userId).first<{ id: string; email: string; name: string; image: string | null }>()
    if (!user) throw new ApiError('login_required', 401)
    return { user: { id: user.id, email: user.email, nickname: user.name || '', avatarUrl: user.image || undefined } }
}

export async function updateProfile(request: Request, env: Env, owner: AuthSession) {
    const body = await jsonBody(request)
    if (typeof body.nickname !== 'string') throw new ApiError('invalid_nickname')
    const name = body.nickname.trim()
    if (Array.from(name).length > 40 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new ApiError('invalid_nickname')
    await env.DB.prepare('UPDATE user SET name = ?, updatedAt = ? WHERE id = ?').bind(name, Date.now(), owner.user.id).run()
    return accountView(env, owner.user.id)
}

export async function uploadAvatar(request: Request, env: Env, owner: AuthSession) {
    // 仅接收浏览器重新编码的静态 WebP，排除 SVG、动画与伪造的文件类型
    if (request.headers.get('content-type') !== 'image/webp') throw new ApiError('invalid_avatar')
    const data = await bytes(new Response(request.body), MAX_AVATAR_BYTES)
    const magic = new TextDecoder('ascii')
    if (data.length < 30 || magic.decode(data.subarray(0, 4)) !== 'RIFF' || magic.decode(data.subarray(8, 12)) !== 'WEBP') throw new ApiError('invalid_avatar')
    const kind = magic.decode(data.subarray(12, 16))
    let width = 0, height = 0
    if (kind === 'VP8 ' && data[23] === 0x9d && data[24] === 1 && data[25] === 0x2a) {
        width = (data[26]! | data[27]! << 8) & 0x3fff
        height = (data[28]! | data[29]! << 8) & 0x3fff
    } else if (kind === 'VP8L' && data[20] === 0x2f) {
        width = 1 + (data[21]! | (data[22]! & 0x3f) << 8)
        height = 1 + ((data[22]! >> 6) | data[23]! << 2 | (data[24]! & 0xf) << 10)
    } else if (kind === 'VP8X' && !(data[20]! & 2)) {
        width = 1 + (data[24]! | data[25]! << 8 | data[26]! << 16)
        height = 1 + (data[27]! | data[28]! << 8 | data[29]! << 16)
    }
    if (!width || !height || width > 512 || height > 512) throw new ApiError('invalid_avatar')
    const version = crypto.randomUUID()
    const url = `/api/account/avatar?v=${version}`
    await env.DB.batch([
        env.DB.prepare(`INSERT INTO account_avatars (user_id, data, version) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, version = excluded.version`).bind(owner.user.id, data, version),
        env.DB.prepare('UPDATE user SET image = ?, updatedAt = ? WHERE id = ?').bind(url, Date.now(), owner.user.id),
    ])
    return accountView(env, owner.user.id)
}

export async function removeAvatar(env: Env, owner: AuthSession) {
    const binding = await getBinding(env, owner.user.id)
    await env.DB.batch([
        env.DB.prepare('DELETE FROM account_avatars WHERE user_id = ?').bind(owner.user.id),
        env.DB.prepare('UPDATE user SET image = ?, updatedAt = ? WHERE id = ?').bind(binding?.status === 'active' ? binding.avatar_url : null, Date.now(), owner.user.id),
    ])
    return accountView(env, owner.user.id)
}

export async function avatarContent(env: Env, owner: AuthSession, headers: Headers) {
    const row = await env.DB.prepare('SELECT data FROM account_avatars WHERE user_id = ?').bind(owner.user.id).first<{ data: ArrayBuffer }>()
    if (!row) throw new ApiError('not_found', 404)
    headers.set('Content-Type', 'image/webp')
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
    return new Response(new Uint8Array(row.data), { headers })
}
