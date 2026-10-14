// 协议适配参考 nxapi 固定提交，来源与许可见 worker/NOTICE.md
import { base64, unbase64 } from './cookies'
import { ApiError, bytes, type Env } from './types'
const CLIENT_ID = '71b963c1b7b6d119'
const ACCOUNT = 'https://accounts.nintendo.com/connect/1.0.0'
const CORAL_URL = 'https://api-lp1.znc.srv.nintendo.net'
const NXAPI = 'https://nxapi-znca-api.fancy.org.uk/api/znca/'
const USER_AGENT =
    'GrooveArchive/0.1.0 (+https://github.com/himemiyatori/gcfp-b30)'
export interface Session {
    token: string
    accountId: string
    nickname: string
    avatarUrl?: string
    bindingId: string
}
export interface CoralCache {
    token: string
    accountId: string
    bindingId: string
    expiresAt: number
    // null 表示资料中没有可用头像，缺少字段的旧缓存需补取一次
    avatarUrl?: string | null
}
interface AccountToken {
    access_token: string
    id_token: string
}
interface AccountUser {
    id: string
    nickname: string
    language: string
    iconUri?: string | null
}
function profileAvatar(...values: unknown[]) {
    for (const value of values) {
        if (typeof value !== 'string' || !value || value.length > 1024) continue
        try {
            const url = new URL(value)
            if (url.protocol === 'https:' && !url.username && !url.password && !url.port && url.href.length <= 1024) return url.href
        } catch {}
    }
}
export interface Media {
    id: string
    type: string
    applicationId: string
    contentUri: string
    contentLength: number
    capturedAt: number
    expiresAt: number
}
async function upstream(url: string, init: RequestInit = {}) {
    let response: Response
    try {
        response = await fetch(url, {
            ...init,
            redirect: 'manual',
            signal: AbortSignal.timeout(25000),
        })
    } catch (error) {
        const target = new URL(url)
        const cause = error instanceof Error ? error.cause : undefined
        const causeRecord =
            cause && typeof cause === 'object'
                ? (cause as { name?: unknown; code?: unknown })
                : undefined
        console.error('[nintendo-upstream] fetch failed', {
            host: target.hostname,
            path: target.pathname,
            error: error instanceof Error ? error.name : typeof error,
            // 运行时网络错误文本不含请求体，截断后记录便于区分断连、TLS 与解析失败
            message: error instanceof Error ? error.message.slice(0, 200) : undefined,
            cause:
                causeRecord &&
                `${String(causeRecord.name || 'Error')}${causeRecord.code ? ` (${String(causeRecord.code)})` : ''}`,
        })
        throw new ApiError('upstream_unavailable', 502)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const target = new URL(url)
        console.error('[nintendo-upstream] unexpected redirect', {
            host: target.hostname,
            path: target.pathname,
            status: response.status,
        })
        throw new ApiError('upstream_redirect', 502)
    }
    if (response.status === 429) {
        const raw = response.headers.get('retry-after') || ''
        const wait = /^\d+$/.test(raw)
            ? Number(raw)
            : Math.ceil((Date.parse(raw) - Date.now()) / 1000)
        await response.body?.cancel()
        throw new ApiError(
            'rate_limited',
            429,
            Number.isFinite(wait) ? Math.max(60, wait) : 60,
        )
    }
    return response
}
function protocolError(code: string, stage: string, response?: Response) {
    return new ApiError(code, 502, undefined, {
        stage,
        ...(response ? { upstreamStatus: response.status, contentType: response.headers.get('content-type')?.split(';')[0] } : {}),
    })
}
async function responseError(response: Response, code: string, stage: string) {
    const failure = protocolError(code, stage, response)
    try {
        const data = JSON.parse(new TextDecoder().decode(await bytes(response, 16384)))
        if (typeof data?.error === 'string' && /^[a-z0-9_]{1,80}$/.test(data.error)) failure.diagnostic!.upstreamError = data.error
    } catch {}
    return failure
}
function binary(value: unknown, stage: string) {
    if (typeof value !== 'string' || !value) throw protocolError('upstream_format', stage)
    try {
        const result = unbase64(value)
        if (!result.length) throw new Error()
        return result
    } catch { throw protocolError('upstream_format', stage) }
}
async function json<T>(response: Response, stage: string): Promise<T> {
    if (!response.ok) {
        throw await responseError(response, 'upstream_error', stage)
    }
    try {
        const result: unknown = JSON.parse(
            new TextDecoder().decode(await bytes(response, 2 * 1024 * 1024)),
        )
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error()
        return result as T
    } catch (error) {
        if (error instanceof ApiError) {
            error.diagnostic ??= { stage }
            throw error
        }
        throw protocolError('upstream_format', stage, response)
    }
}
async function accountToken(token: string) {
    const response = await upstream(`${ACCOUNT}/api/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 8.0.0)',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            session_token: token,
            grant_type:
                'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
        }),
    })
    if (response.status === 400 || response.status === 401) {
        await response.body?.cancel()
        throw new ApiError('reauth_required', 401)
    }
    const data = await json<AccountToken>(response, 'account_token')
    if (typeof data.access_token !== 'string' || !data.access_token || typeof data.id_token !== 'string' || !data.id_token)
        throw protocolError('upstream_format', 'account_token_fields')
    return data
}
async function user(token: AccountToken) {
    const data = await json<AccountUser>(
        await upstream('https://api.accounts.nintendo.com/2.0.0/users/me', {
            headers: {
                Authorization: `Bearer ${token.access_token}`,
                'Accept-Language': 'en-GB',
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'NASDKAPI; Android',
            },
        }),
        'account_profile',
    )
    if (typeof data.id !== 'string' || !data.id || typeof data.language !== 'string' || !data.language) throw protocolError('upstream_format', 'account_profile_fields')
    return data
}
export async function startAuth() {
    const state = base64(crypto.getRandomValues(new Uint8Array(36)))
    const verifier = base64(crypto.getRandomValues(new Uint8Array(32)))
    const challenge = base64(
        new Uint8Array(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(verifier),
            ),
        ),
    )
    const params = new URLSearchParams({
        state,
        redirect_uri: `npf${CLIENT_ID}://auth`,
        client_id: CLIENT_ID,
        scope: 'openid user user.birthday user.screenName',
        response_type: 'session_token_code',
        session_token_code_challenge: challenge,
        session_token_code_challenge_method: 'S256',
        theme: 'login_form',
    })
    return { state, verifier, url: `${ACCOUNT}/authorize?${params}` }
}
export async function completeAuth(
    callback: string,
    flow: { state: string; verifier: string },
): Promise<Session> {
    let url: URL
    try {
        url = new URL(callback)
    } catch {
        throw new ApiError('invalid_callback')
    }
    if (
        url.protocol !== `npf${CLIENT_ID}:` ||
        url.host !== 'auth' ||
        (url.pathname !== '' && url.pathname !== '/') ||
        url.username ||
        url.password
    )
        throw new ApiError('invalid_callback')
    const params = new URLSearchParams(url.hash.slice(1) || url.search.slice(1))
    if (
        params.get('state') !== flow.state ||
        !params.get('session_token_code') ||
        params.has('error')
    )
        throw new ApiError('invalid_callback')
    const response = await upstream(`${ACCOUNT}/api/session_token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'NASDKAPI; Android',
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            session_token_code: params.get('session_token_code')!,
            session_token_code_verifier: flow.verifier,
        }),
    })
    if (response.status === 400 || response.status === 401) {
        await response.body?.cancel()
        throw new ApiError('invalid_callback')
    }
    const result = await json<{ session_token: string }>(response, 'account_session')
    if (typeof result.session_token !== 'string' || !result.session_token) throw protocolError('upstream_format', 'account_session_fields')
    const profile = await user(await accountToken(result.session_token))
    return {
        token: result.session_token,
        accountId: profile.id,
        nickname: profile.nickname || '',
        avatarUrl: profileAvatar(profile.iconUri),
        bindingId: crypto.randomUUID(),
    }
}
function trustedAuthUrl(value: string) {
    let url: URL
    try { url = new URL(value) } catch { throw protocolError('third_party_configuration', 'oauth_discovery') }
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'nxapi-auth.fancy.org.uk' ||
        url.port ||
        url.username ||
        url.password
    )
        throw new ApiError('third_party_configuration', 502)
    return url
}
export class Nintendo {
    private accessToken?: string
    constructor(private env: Env) {}
    private async authenticate() {
        const metadata = await json<{ authorization_servers: string[] }>(
            await upstream(
                'https://nxapi-znca-api.fancy.org.uk/.well-known/oauth-protected-resource',
                { headers: { 'User-Agent': USER_AGENT } },
            ),
            'oauth_resource',
        )
        if (!Array.isArray(metadata.authorization_servers) || typeof metadata.authorization_servers[0] !== 'string') throw protocolError('upstream_format', 'oauth_resource_fields')
        const issuer = trustedAuthUrl(metadata.authorization_servers?.[0] || '')
        issuer.pathname =
            '/.well-known/oauth-authorization-server' +
            (issuer.pathname === '/' ? '' : issuer.pathname)
        const auth = await json<{ token_endpoint: string }>(
            await upstream(issuer.href, {
                headers: { 'User-Agent': USER_AGENT },
            }),
            'oauth_metadata',
        )
        if (typeof auth.token_endpoint !== 'string') throw protocolError('upstream_format', 'oauth_metadata_fields')
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'ca:gf ca:er ca:dr',
            client_id: this.env.NXAPI_CLIENT_ID!.trim(),
        })
        const secret = this.env.NXAPI_CLIENT_SECRET?.trim()
        if (secret) body.set('client_secret', secret)
        const result = await json<{ access_token: string }>(
            await upstream(trustedAuthUrl(auth.token_endpoint).href, {
                method: 'POST',
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                body,
            }),
            'oauth_token',
        )
        if (typeof result.access_token !== 'string' || !result.access_token) throw protocolError('third_party_auth', 'oauth_token_fields')
        this.accessToken = result.access_token
    }
    private async thirdParty(
        path: string,
        body: object,
        retry = true,
    ): Promise<Response> {
        if (!this.accessToken) await this.authenticate()
        const response = await upstream(NXAPI + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept:
                    path === 'decrypt-response'
                        ? 'text/plain'
                        : 'application/json',
                'User-Agent': USER_AGENT,
                'X-znca-Client-Version': 'd8fAZDPzwimzQ7c6',
                'X-znca-Platform': 'Android',
                'X-znca-Version': this.env.NINTENDO_APP_VERSION || '3.5.0',
                Authorization: `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify(body),
        })
        if (response.status === 401 && retry) {
            await response.body?.cancel()
            this.accessToken = undefined
            return this.thirdParty(path, body, false)
        }
        if (!response.ok) {
            throw await responseError(response, 'third_party_error', `third_party_${path.replaceAll('-', '_')}`)
        }
        return response
    }
    private async encrypt(path: string, data: string, token: string | null) {
        const encrypted = await json<{ data: unknown }>(
            await this.thirdParty('encrypt-request', { url: CORAL_URL + path, token, data }),
            'third_party_encrypt',
        )
        return binary(encrypted.data, 'third_party_encrypt_fields')
    }
    private async coral<T>(
        path: string,
        data: Uint8Array,
        token?: string,
    ): Promise<T> {
        const version = this.env.NINTENDO_APP_VERSION || '3.5.0'
        const response = await upstream(CORAL_URL + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                Accept: 'application/octet-stream,application/json',
                'X-Platform': 'Android',
                'X-ProductVersion': version,
                'User-Agent': `com.nintendo.znca/${version}(Android/12)`,
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: data,
        })
        if (response.status === 401) {
            await response.body?.cancel()
            throw new ApiError('coral_expired', 401)
        }
        const stage = path === '/v4/Account/Login' ? 'coral_login' : 'coral_media'
        if (!response.ok) {
            await response.body?.cancel()
            throw protocolError('coral_error', stage, response)
        }
        const raw = await bytes(response, 2 * 1024 * 1024)
        const encoded = base64(raw).replace(/-/g, '+').replace(/_/g, '/')
        // 本适配器始终发送加密请求，响应即使声明 application/json 也必须先解密
        const decoded = await this.thirdParty('decrypt-response', {
            data: encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='),
        })
        const result = await json<{ status: number; result: T }>(decoded, `${stage}_decrypt`)
        if (!Number.isFinite(result.status)) throw protocolError('upstream_format', `${stage}_status`)
        if (result.status === 9403 || result.status === 9404)
            throw new ApiError('coral_expired', 401)
        if (result.status === 9437) throw new ApiError('rate_limited', 429, 60)
        if (result.status !== 0) {
            const failure = protocolError('coral_error', stage)
            failure.diagnostic!.coralStatus = result.status
            throw failure
        }
        if (!result.result || typeof result.result !== 'object') throw protocolError('upstream_format', `${stage}_result`)
        return result.result
    }
    async login(session: Session): Promise<CoralCache> {
        const token = await accountToken(session.token)
        const profile = await user(token)
        if (profile.id !== session.accountId)
            throw new ApiError('reauth_required', 401)
        const parameter = {
            naIdToken: token.id_token,
            language: profile.language,
            timestamp: 0,
            requestId: '',
            f: '',
        }
        const f = await json<{ encrypted_token_request?: string; f?: string; timestamp?: number; request_id?: string }>(
            await this.thirdParty('f', {
                hash_method: '1',
                token: token.id_token,
                na_id: profile.id,
                encrypt_token_request: {
                    url: CORAL_URL + '/v4/Account/Login',
                    parameter,
                },
            }),
            'third_party_f',
        )
        let loginData: Uint8Array
        if (f.encrypted_token_request) {
            loginData = binary(f.encrypted_token_request, 'third_party_f_encrypted')
        } else {
            if (typeof f.f !== 'string' || !f.f || typeof f.timestamp !== 'number' || !Number.isFinite(f.timestamp) || typeof f.request_id !== 'string' || !f.request_id) throw protocolError('third_party_format', 'third_party_f_fields')
            // 与 nxapi 一致，未附带加密登录包时使用生成的 f 参数单独加密
            parameter.f = f.f
            parameter.timestamp = f.timestamp
            parameter.requestId = f.request_id
            loginData = await this.encrypt('/v4/Account/Login', JSON.stringify({ parameter }), null)
        }
        const result = await this.coral<{
            webApiServerCredential: { accessToken: string; expiresIn: number }
            naUser?: { iconUri?: string | null }
            user?: { imageUri?: string; image2Uri?: string }
        }>('/v4/Account/Login', loginData)
        const credential = result.webApiServerCredential
        if (
            typeof credential?.accessToken !== 'string' || !credential.accessToken ||
            !Number.isFinite(credential.expiresIn) ||
            credential.expiresIn <= 0
        )
            throw protocolError('upstream_format', 'coral_login_credential')
        return {
            token: credential.accessToken,
            accountId: session.accountId,
            bindingId: session.bindingId,
            expiresAt: Date.now() + credential.expiresIn * 1000,
            avatarUrl: profileAvatar(result.naUser?.iconUri, profile.iconUri, result.user?.imageUri, result.user?.image2Uri, session.avatarUrl) ?? null,
        }
    }
    async media(session: Session, cached?: CoralCache) {
        let cache =
            cached &&
            cached.accountId === session.accountId &&
            cached.bindingId === session.bindingId &&
            cached.avatarUrl !== undefined &&
            cached.expiresAt > Date.now() + 30000
                ? cached
                : await this.login(session)
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const encrypted = await this.encrypt('/v4/Media/List', JSON.stringify({ parameter: {} }), cache.token)
                const result = await this.coral<{ media: Media[] }>(
                    '/v4/Media/List',
                    encrypted,
                    cache.token,
                )
                if (!Array.isArray(result.media))
                    throw protocolError('upstream_format', 'coral_media_fields')
                return { media: result.media, cache }
            } catch (error) {
                if (
                    !(error instanceof ApiError) ||
                    error.code !== 'coral_expired' ||
                    attempt
                )
                    throw error
                cache = await this.login(session)
            }
        }
        throw new ApiError('coral_error', 502)
    }
}
