import { cookieValue, clearCookie } from './cookies'
import { digest, sendLoginEmail } from './email'
import { ApiError, type Env } from './types'

const REGISTRATION = '__Host-groove-registration'
const LIFETIME = 10 * 60000
export interface RegistrationContext { email?: string; ticketHash?: string }

async function codeHash(env: Env, email: string, code: string) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.BETTER_AUTH_API_KEY!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(`registration:${email}:${code}`))
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sendRegistrationCode(env: Env, email: string) {
    if (await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first()) throw new ApiError('email_in_use', 409)
    let random: number
    do { random = crypto.getRandomValues(new Uint32Array(1))[0]! } while (random >= 4294000000)
    const code = String(random % 1000000).padStart(6, '0')
    const now = Date.now()
    await env.DB.batch([
        env.DB.prepare('DELETE FROM account_registrations WHERE expires_at <= ? AND (ticket_expires_at IS NULL OR ticket_expires_at <= ?)').bind(now, now),
        env.DB.prepare(`INSERT INTO account_registrations (email, code_hash, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
            attempts = 0, ticket_hash = NULL, ticket_expires_at = NULL`).bind(email, await codeHash(env, email, code), now + LIFETIME),
    ])
    await sendLoginEmail(env, email, code, 'registration')
}

export async function verifyRegistration(env: Env, email: string, code: string, headers: Headers) {
    const now = Date.now()
    const record = await env.DB.prepare(`UPDATE account_registrations SET attempts = attempts + 1
        WHERE email = ? AND expires_at > ? AND attempts < 5 AND ticket_hash IS NULL RETURNING code_hash`)
        .bind(email, now).first<{ code_hash: string }>()
    if (!record) throw new ApiError('registration_expired', 400)
    if (record.code_hash !== await codeHash(env, email, code)) throw new ApiError('invalid_otp')
    const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`
    // 验证码只能换取一次短期注册凭据，填写资料期间不创建用户或登录会话
    const verified = await env.DB.prepare(`UPDATE account_registrations SET code_hash = '', ticket_hash = ?, ticket_expires_at = ?
        WHERE email = ? AND code_hash = ? AND ticket_hash IS NULL AND expires_at > ? RETURNING email`)
        .bind(await digest(ticket), now + LIFETIME, email, record.code_hash, now).first()
    if (!verified) throw new ApiError('registration_expired', 400)
    headers.append('Set-Cookie', `${REGISTRATION}=${ticket}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=600`)
    return { email }
}

export async function registrationContext(request: Request, env: Env, email: string): Promise<RegistrationContext> {
    const ticket = cookieValue(request, REGISTRATION)
    if (!ticket) throw new ApiError('registration_expired', 401)
    const ticketHash = await digest(ticket)
    const record = await env.DB.prepare('SELECT email FROM account_registrations WHERE email = ? AND ticket_hash = ? AND ticket_expires_at > ?')
        .bind(email, ticketHash, Date.now()).first()
    if (!record) throw new ApiError('registration_expired', 401)
    return { email, ticketHash }
}

export async function consumeRegistration(env: Env, context: RegistrationContext, email: string) {
    if (context.email !== email || !context.ticketHash) throw new ApiError('registration_expired', 401)
    const consumed = await env.DB.prepare('DELETE FROM account_registrations WHERE email = ? AND ticket_hash = ? AND ticket_expires_at > ? RETURNING email')
        .bind(email, context.ticketHash, Date.now()).first()
    if (!consumed) throw new ApiError('registration_expired', 401)
}

export function clearRegistration(headers: Headers) { clearCookie(headers, REGISTRATION) }
