import { CORAL, FLOW, SESSION, clearCookie, readCookie, seal, setCookie, unseal } from './cookies'
import { Nintendo, completeAuth, startAuth, type Session } from './nintendo'
import { ApiError, MAX_IMAGE_BYTES, configured, jsonBody, type Env } from './types'
import { authRoute, createAuth, requireUser } from './auth'
import { bindingCredentials, bindingView, getBinding, reserveScan, saveBinding, saveCoral } from './bindings'
import { accountView, avatarContent, removeAvatar, updateProfile, uploadAvatar } from './profile'
const TICKET = 'album-download'
function checkOrigin(request: Request, env: Env, url: URL) {
    let expectedOrigin = url.origin
    if (env.APP_ORIGIN?.trim()) {
        try {
            const configured = new URL(env.APP_ORIGIN.trim())
            if (!['https:', 'http:'].includes(configured.protocol) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) throw new Error()
            expectedOrigin = configured.origin
        } catch { throw new ApiError('not_configured', 503) }
    }
    const origin = request.headers.get('origin')
    const fetchSite = request.headers.get('sec-fetch-site')
    if ((request.method !== 'GET' && origin !== expectedOrigin) || fetchSite === 'cross-site') {
        let receivedOrigin: string | null = null
        try { receivedOrigin = new URL(origin || '').origin } catch {}
        console.warn('[worker] origin rejected', { requestOrigin: url.origin, expectedOrigin, receivedOrigin, fetchSite })
        throw new ApiError('origin_rejected', 403)
    }
    return expectedOrigin
}
function mediaUrl(value: string, env: Env) {
    let url: URL
    try { url = new URL(value) } catch { throw new ApiError('media_host_rejected', 502, undefined, { stage: 'media_url' }) }
    const hosts = (env.MEDIA_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port) throw new ApiError('media_host_rejected', 502)
    return url
}
async function content(value: string, env: Env, headers: Headers) {
    let url = mediaUrl(value, env)
    for (let hop = 0; hop < 3; hop++) {
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
        if (response.status === 429) {
            const raw = response.headers.get('retry-after') || ''
            const seconds = /^\d+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw) - Date.now()) / 1000)
            await response.body?.cancel()
            throw new ApiError('rate_limited', 429, Number.isFinite(seconds) ? Math.max(60, seconds) : 60)
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel()
            url = mediaUrl(new URL(response.headers.get('location') || '', url).href, env)
            continue
        }
        if (!response.ok) throw new ApiError(response.status === 403 || response.status === 404 ? 'media_expired' : 'download_failed', 502)
        const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
        if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new ApiError('invalid_image', 502)
        if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) { await response.body?.cancel(); throw new ApiError('too_large', 413) }
        if (!response.body) throw new ApiError('download_failed', 502)
        let total = 0
        const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
            total += chunk.length
            if (total > MAX_IMAGE_BYTES) { controller.error(new Error('too_large')); return }
            controller.enqueue(chunk)
        } }))
        headers.set('Content-Type', type)
        return new Response(stream, { headers })
    }
    throw new ApiError('media_redirect', 502)
}
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url)
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
        const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
        const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers })
        try {
            const origin = checkOrigin(request, env, url)
            const route = `${request.method} ${url.pathname}`
            if (route !== 'GET /api/account/avatar' && request.headers.get('X-App-Protocol-Version') !== '1') throw new ApiError('protocol_mismatch', 426)
            if (!env.API_LIMIT) throw new ApiError('not_configured', 503)
            if (!(await env.API_LIMIT.limit({ key: `ip:${request.headers.get('cf-connecting-ip') || 'local'}` })).success) throw new ApiError('rate_limited', 429, 60)
            // 认证框架会吸收发信回调异常，按请求单独捕获后返回真实发送结果
            let deliveryFailure: ApiError | undefined
            const registration = {}
            const auth = createAuth(env, origin, error => { deliveryFailure = error }, registration)
            if (url.pathname.startsWith('/api/auth/')) return reply(await authRoute(request, auth, env, headers, () => deliveryFailure, registration))
            const owner = await requireUser(request, auth, headers, route === 'GET /api/account')
            if (route === 'GET /api/account') return reply({ ...await accountView(env, owner.user.id), expiresAt: owner.session.expiresAt })
            if (route === 'PATCH /api/account') return reply(await updateProfile(request, env, owner))
            if (route === 'PUT /api/account/avatar') return reply(await uploadAvatar(request, env, owner))
            if (route === 'DELETE /api/account/avatar') return reply(await removeAvatar(env, owner))
            if (route === 'GET /api/account/avatar') return await avatarContent(env, owner, headers)
            const binding = await getBinding(env, owner.user.id)
            if (route === 'DELETE /api/nintendo/binding') {
                await env.DB.batch([
                    env.DB.prepare(`UPDATE nintendo_bindings SET nintendo_account_id = NULL, credentials = NULL, coral_cache = NULL,
                        status = 'unbound', generation = generation + 1, binding_id = ?, next_allowed_at = 0
                        WHERE user_id = ?`).bind(crypto.randomUUID(), owner.user.id),
                    env.DB.prepare('DELETE FROM nintendo_auth_flows WHERE user_id = ?').bind(owner.user.id),
                ])
                for (const name of [SESSION, CORAL, FLOW]) clearCookie(headers, name)
                return reply({ status: 'unbound' })
            }
            const legacy = await readCookie<Session>(request, env, SESSION)
            if (route === 'GET /api/nintendo/binding') return reply(bindingView(binding, configured(env), !!legacy))
            if (!configured(env)) throw new ApiError('not_configured', 503)
            if (route === 'POST /api/nintendo/binding/migrate') {
                const body = await jsonBody(request)
                if (body.consent !== true) throw new ApiError('consent_required')
                if (typeof body.migrationId !== 'string' || !/^[\w-]{16,80}$/.test(body.migrationId)) throw new ApiError('invalid_request')
                const receipt = await env.DB.prepare('SELECT binding_id FROM nintendo_binding_migrations WHERE user_id = ? AND migration_id = ?').bind(owner.user.id, body.migrationId).first<{ binding_id: string }>()
                if (receipt && (binding?.binding_id !== receipt.binding_id || binding.status !== 'active')) throw new ApiError('binding_changed', 409)
                if (!receipt && !legacy) throw new ApiError('legacy_binding_missing', 409)
                const saved = receipt ? binding! : await saveBinding(env, owner, legacy!, body.migrationId)
                for (const name of [SESSION, CORAL, FLOW]) clearCookie(headers, name)
                return reply(bindingView(saved, true))
            }
            if (route === 'POST /api/nintendo/auth/start') {
                const body = await jsonBody(request)
                if (body.consent !== true) throw new ApiError('consent_required')
                const flow = await startAuth()
                const flowId = crypto.randomUUID()
                await env.DB.prepare('INSERT INTO nintendo_auth_flows (id, user_id, session_id, expires_at) VALUES (?, ?, ?, ?)').bind(flowId, owner.user.id, owner.session.id, Date.now() + 600000).run()
                await setCookie(headers, env, FLOW, { state: flow.state, verifier: flow.verifier, flowId, userId: owner.user.id, sessionId: owner.session.id }, 600)
                return reply({ url: flow.url })
            }
            if (route === 'POST /api/nintendo/auth/complete') {
                const flow = await readCookie<{ state: string; verifier: string; flowId: string; userId: string; sessionId: string }>(request, env, FLOW)
                if (!flow || flow.userId !== owner.user.id || flow.sessionId !== owner.session.id) throw new ApiError('auth_expired')
                const body = await jsonBody(request)
                if (typeof body.callback !== 'string') throw new ApiError('invalid_callback')
                const consumed = await env.DB.prepare(`DELETE FROM nintendo_auth_flows WHERE id = ? AND user_id = ? AND session_id = ? AND expires_at > ? RETURNING id`)
                    .bind(flow.flowId, owner.user.id, owner.session.id, Date.now()).first()
                if (!consumed) throw new ApiError('auth_expired')
                const bound = await completeAuth(body.callback, flow)
                const saved = await saveBinding(env, owner, bound)
                for (const name of [SESSION, CORAL, FLOW]) clearCookie(headers, name)
                return reply(bindingView(saved, true))
            }
            if (!binding || binding.status !== 'active') throw new ApiError('reauth_required', 401)
            const { session, cache: previousCache } = await bindingCredentials(env, binding)
            if (!(await env.API_LIMIT.limit({ key: `account:${session.accountId}` })).success) throw new ApiError('rate_limited', 429, 60)
            if (route === 'POST /api/album/media') {
                await reserveScan(env, binding, owner)
                const { media, cache } = await new Nintendo(env).media(session, previousCache)
                const ids = (env.GCFP_APPLICATION_IDS || '').split(',').map(id => id.trim())
                const selected = []
                for (const item of media) {
                    if (!item || typeof item !== 'object') throw new ApiError('upstream_format', 502, undefined, { stage: 'media_item' })
                    if (item.type !== 'image' || !ids.includes(item.applicationId)) continue
                    if (typeof item.id !== 'string' || !item.id || typeof item.contentUri !== 'string' || !Number.isSafeInteger(item.expiresAt * 1000)) throw new ApiError('upstream_format', 502, undefined, { stage: 'media_item_fields' })
                    mediaUrl(item.contentUri, env)
                    const expiresAt = item.expiresAt * 1000
                    if (expiresAt <= Date.now()) continue
                    const ticket = await seal(env, TICKET, { url: item.contentUri, mediaId: item.id, userId: owner.user.id, accountId: session.accountId, bindingId: session.bindingId, generation: binding.generation }, Math.min(expiresAt, Date.now() + 5 * 60000))
                    selected.push({ mediaId: item.id, applicationId: item.applicationId, capturedAt: Number.isFinite(item.capturedAt) ? item.capturedAt * 1000 : null, contentLength: item.contentLength, expiresAt, ticket })
                }
                const saved = await saveCoral(env, binding, owner, cache)
                const avatarUrl = saved.avatar_url
                return reply({ accountId: session.accountId, bindingId: session.bindingId, avatarUrl, media: selected })
            }
            if (route === 'POST /api/album/content') {
                const body = await jsonBody(request)
                const ticket = typeof body.ticket === 'string' ? await unseal<{ url: string; userId: string; accountId: string; bindingId: string; generation: number }>(env, TICKET, body.ticket) : undefined
                if (!ticket || ticket.userId !== owner.user.id || ticket.accountId !== session.accountId || ticket.bindingId !== session.bindingId || ticket.generation !== binding.generation) throw new ApiError('ticket_expired', 403)
                return await content(ticket.url, env, headers)
            }
            throw new ApiError('not_found', 404)
        } catch (error) {
            if (!(error instanceof ApiError)) {
                const cause = error instanceof Error ? error.cause : undefined
                const causeRecord =
                    cause && typeof cause === 'object'
                        ? (cause as { name?: unknown; code?: unknown })
                        : undefined
                console.error('[worker] unexpected failure', {
                    route: `${request.method} ${url.pathname}`,
                    error: error instanceof Error ? error.name : typeof error,
                    cause:
                        causeRecord &&
                        `${String(causeRecord.name || 'Error')}${causeRecord.code ? ` (${String(causeRecord.code)})` : ''}`,
                })
            }
            const failure = error instanceof ApiError ? error : new ApiError('upstream_unavailable', 502)
            if (failure.diagnostic) console.error('[worker] upstream failure', { error: failure.code, ...failure.diagnostic })
            if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter))
            return reply({ error: failure.code, ...(failure.diagnostic ? { stage: failure.diagnostic.stage } : {}) }, failure.status)
        }
    },
}
