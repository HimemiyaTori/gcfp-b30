import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { APIError } from 'better-auth/api'
import { consumeLimit, digest, emailCooldown, sendLoginEmail } from './email'
import { ApiError, jsonBody, type Env } from './types'

export function createAuth(env: Env, origin: string, onDeliveryFailure: (error: ApiError) => void = () => {}) {
    if (!env.DB || !env.BETTER_AUTH_API_KEY || env.BETTER_AUTH_API_KEY.length < 32) throw new ApiError('account_not_configured', 503)
    return betterAuth({
        appName: 'Groove Archive', baseURL: origin, basePath: '/api/auth',
        secret: env.BETTER_AUTH_API_KEY, database: env.DB,
        trustedOrigins: [origin],
        session: { expiresIn: 30 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
        advanced: {
            useSecureCookies: true, cookiePrefix: 'groove',
            defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'strict', path: '/' },
            ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
        },
        rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
            customRules: { '/email-otp/send-verification-otp': { window: 60, max: 5 }, '/sign-in/email-otp': { window: 60, max: 15 } } },
        plugins: [emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', resendStrategy: 'rotate',
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

export async function authRoute(request: Request, auth: Auth, env: Env, headers: Headers, deliveryFailure: () => ApiError | undefined) {
    const path = new URL(request.url).pathname
    if (!['POST /api/auth/email-otp/send-verification-otp', 'POST /api/auth/sign-in/email-otp', 'POST /api/auth/sign-out'].includes(`${request.method} ${path}`)) throw new ApiError('not_found', 404)
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
        } else if (typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)) throw new ApiError('invalid_otp')
        // 登录接口仅接收邮箱与验证码，资料和头像通过鉴权后的独立接口修改
        input = new Request(request, { body: JSON.stringify(sending ? { email, type: 'sign-in' } : { email, otp: body.otp }) })
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
    return value
}
