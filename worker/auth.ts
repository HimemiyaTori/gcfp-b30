import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { APIError } from 'better-auth/api'
import { consumeLimit, digest, emailCooldown, sendLoginEmail } from './email'
import { ApiError, jsonBody, type Env } from './types'
import { accountView } from './profile'
import { clearRegistration, consumeRegistration, registrationContext, sendRegistrationCode, verifyRegistration, type RegistrationContext } from './registration'

export function createAuth(env: Env, origin: string, onDeliveryFailure: (error: ApiError) => void = () => {}, registration: RegistrationContext = {}) {
    if (!env.DB || !env.BETTER_AUTH_API_KEY || env.BETTER_AUTH_API_KEY.length < 32) throw new ApiError('account_not_configured', 503)
    return betterAuth({
        appName: 'Groove Archive', baseURL: origin, basePath: '/api/auth',
        secret: env.BETTER_AUTH_API_KEY, database: env.DB,
        trustedOrigins: [origin],
        emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
        databaseHooks: { user: { create: { async before(user) {
            await consumeRegistration(env, registration, user.email)
            return { data: { ...user, emailVerified: true } }
        } } } },
        session: { expiresIn: 30 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
        advanced: {
            useSecureCookies: true, cookiePrefix: 'groove',
            defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'strict', path: '/' },
            ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
        },
        rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
            customRules: { '/email-otp/send-verification-otp': { window: 60, max: 5 }, '/sign-in/email-otp': { window: 60, max: 15 }, '/sign-in/email': { window: 60, max: 15 } } },
        plugins: [emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', resendStrategy: 'rotate', disableSignUp: true,
            async sendVerificationOTP({ email, otp }) {
                try { await sendLoginEmail(env, email, otp) } catch (error) {
                    const failure = error instanceof ApiError ? error : new ApiError('email_send_failed', 503, 60)
                    onDeliveryFailure(failure)
                    throw new APIError(failure.status === 429 ? 'TOO_MANY_REQUESTS' : 'SERVICE_UNAVAILABLE',
                        { code: failure.code, message: failure.code }, failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : undefined)
                }
            },
        })],
        logger: { disabled: true },
    })
}

export type Auth = ReturnType<typeof createAuth>
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

export function appendCookies(target: Headers, source: Headers) {
    for (const cookie of source.getSetCookie()) target.append('Set-Cookie', cookie)
}

export async function requireUser(request: Request, auth: Auth, headers: Headers, renew = false) {
    const response = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: !renew }, asResponse: true })
    appendCookies(headers, response.headers)
    if (!response.ok) throw new ApiError('login_required', 401)
    const session = await response.json() as AuthSession | null
    if (!session?.user || !session.user.emailVerified) throw new ApiError('login_required', 401)
    const expected = request.headers.get('X-App-Account-Id')
    if (expected && expected !== session.user.id) throw new ApiError('account_changed', 409)
    return session
}

export async function authRoute(request: Request, auth: Auth, env: Env, headers: Headers, deliveryFailure: () => ApiError | undefined, registration: RegistrationContext = {}) {
    const path = new URL(request.url).pathname
    if (request.method === 'POST' && ['/api/auth/change-password', '/api/auth/set-password'].includes(path)) return passwordRoute(request, auth, env, headers, path.endsWith('/set-password'))
    if (!['POST /api/auth/email-otp/send-verification-otp', 'POST /api/auth/sign-in/email-otp', 'POST /api/auth/sign-in/email', 'POST /api/auth/register/verify', 'POST /api/auth/register/complete', 'POST /api/auth/sign-out'].includes(`${request.method} ${path}`)) throw new ApiError('not_found', 404)
    let input = request
    if (path !== '/api/auth/sign-out') {
        const body = await jsonBody(request)
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('invalid_email')
        const sending = path.endsWith('/send-verification-otp')
        if (sending) {
            if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError('email_not_configured', 503)
            const limit = await consumeLimit(env, `send-ip:${await digest(request.headers.get('cf-connecting-ip') || 'local')}`, 3600, 10)
            if (!limit.allowed) throw new ApiError('rate_limited', 429, limit.retryAfter ?? 60)
            await emailCooldown(env, email)
            if (body.type === 'registration') { await sendRegistrationCode(env, email); return { success: true } }
            if (!await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first()) throw new ApiError('user_not_found', 404)
            input = new Request(request, { body: JSON.stringify({ email, type: 'sign-in' }) })
        } else if (path.endsWith('/sign-in/email') || path.endsWith('/register/complete')) {
            if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new ApiError('invalid_password')
            if (path.endsWith('/register/complete')) {
                const nickname = body.nickname === undefined ? '' : typeof body.nickname === 'string' ? body.nickname.trim() : null
                if (nickname === null || Array.from(nickname).length > 40 || /[\p{Cc}\p{Cf}]/u.test(nickname)) throw new ApiError('invalid_nickname')
                Object.assign(registration, await registrationContext(request, env, email))
                const url = new URL(request.url); url.pathname = '/api/auth/sign-up/email'
                input = new Request(url, { method: 'POST', headers: request.headers, body: JSON.stringify({ email, password: body.password, name: nickname }) })
            } else input = new Request(request, { body: JSON.stringify({ email, password: body.password }) })
        } else {
            if (typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)) throw new ApiError('invalid_otp')
            if (path.endsWith('/register/verify')) return verifyRegistration(env, email, body.otp, headers)
            // 登录不隐式创建用户，注册资料只从已验证邮箱的完成步骤接收
            input = new Request(request, { body: JSON.stringify({ email, otp: body.otp }) })
        }
    } else {
        await requireUser(request, auth, headers)
    }
    const response = await auth.handler(input)
    appendCookies(headers, response.headers)
    const emailFailure = deliveryFailure()
    if (emailFailure) throw emailFailure
    const value = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
        const code = typeof value.code === 'string' ? value.code.toLowerCase() : response.status === 429 ? 'rate_limited' : 'login_failed'
        const retry = Number(response.headers.get('retry-after'))
        throw new ApiError(code, response.status, retry || (response.status === 429 ? 60 : undefined))
    }
    // 凭据仅通过 HttpOnly Cookie 交给浏览器，不向前端返回框架会话 token
    delete value.token
    if (path.endsWith('/register/complete')) clearRegistration(headers)
    return value
}

async function passwordRoute(request: Request, auth: Auth, env: Env, headers: Headers, setting: boolean) {
    const owner = await requireUser(request, auth, headers)
    const body = await jsonBody(request)
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128) throw new ApiError('invalid_password')
    if (!setting && (typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 128)) throw new ApiError('invalid_current_password')
    // 首次设置没有旧密码可校验，仅允许在最近十分钟登录的会话中进行
    const createdAt = new Date(owner.session.createdAt).getTime()
    if (setting && (!Number.isFinite(createdAt) || Date.now() - createdAt >= 600000)) throw new ApiError('password_reauth_required', 403)
    const limit = await consumeLimit(env, `password:${owner.user.id}`, 60, 5)
    if (!limit.allowed) throw new ApiError('rate_limited', 429, limit.retryAfter ?? 60)
    const response = setting
        ? await auth.api.setPassword({ headers: request.headers, body: { newPassword: body.newPassword }, asResponse: true })
        : await auth.api.changePassword({ headers: request.headers, body: { currentPassword: body.currentPassword as string, newPassword: body.newPassword, revokeOtherSessions: true }, asResponse: true })
    appendCookies(headers, response.headers)
    if (!response.ok) {
        const value = await response.json().catch(() => ({})) as Record<string, unknown>
        const code = typeof value.code === 'string' ? value.code.toLowerCase() : 'request_failed'
        throw new ApiError(code === 'invalid_password' ? 'invalid_current_password' : code === 'unauthorized' ? 'login_required' : code, response.status)
    }
    // 密码散列和会话轮换交给认证框架，响应只返回站内资料
    return accountView(env, owner.user.id)
}
