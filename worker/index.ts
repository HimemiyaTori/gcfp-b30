import { CORAL, FLOW, SESSION, clearCookie, readCookie, seal, setCookie, unseal } from './cookies'
import { Nintendo, completeAuth, startAuth, type Session, type CoralCache } from './nintendo'
import { ApiError, MAX_IMAGE_BYTES, configured, jsonBody, type Env } from './types'
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
            checkOrigin(request, env, url)
            const route = `${request.method} ${url.pathname}`
            if (route === 'DELETE /api/nintendo/binding') {
                for (const name of [SESSION, CORAL, FLOW]) clearCookie(headers, name)
                return reply({ status: 'unbound' })
            }
            if (!env.API_LIMIT) throw new ApiError('not_configured', 503)
            if (!(await env.API_LIMIT.limit({ key: `ip:${request.headers.get('cf-connecting-ip') || 'local'}` })).success) throw new ApiError('rate_limited', 429, 60)
            const session = await readCookie<Session>(request, env, SESSION)
            if (route === 'GET /api/nintendo/binding') return reply({ configured: configured(env), status: session ? 'active' : 'unbound', ...(session ? { accountId: session.accountId, nickname: session.nickname, avatarUrl: session.avatarUrl, bindingId: session.bindingId } : {}) })
            if (!configured(env)) throw new ApiError('not_configured', 503)
            if (route === 'POST /api/nintendo/auth/start') {
                const body = await jsonBody(request)
                if (body.consent !== true) throw new ApiError('consent_required')
                const flow = await startAuth()
                await setCookie(headers, env, FLOW, { state: flow.state, verifier: flow.verifier }, 600)
                return reply({ url: flow.url })
            }
            if (route === 'POST /api/nintendo/auth/complete') {
                const flow = await readCookie<{ state: string; verifier: string }>(request, env, FLOW)
                if (!flow) throw new ApiError('auth_expired')
                const body = await jsonBody(request)
                if (typeof body.callback !== 'string') throw new ApiError('invalid_callback')
                const bound = await completeAuth(body.callback, flow)
                await setCookie(headers, env, SESSION, bound, 30 * 86400)
                clearCookie(headers, FLOW); clearCookie(headers, CORAL)
                return reply({ status: 'active', configured: true, accountId: bound.accountId, nickname: bound.nickname, avatarUrl: bound.avatarUrl, bindingId: bound.bindingId })
            }
            if (!session) throw new ApiError('reauth_required', 401)
            if (!(await env.API_LIMIT.limit({ key: `account:${session.accountId}` })).success) throw new ApiError('rate_limited', 429, 60)
            if (route === 'POST /api/album/media') {
                const { media, cache } = await new Nintendo(env).media(session, await readCookie<CoralCache>(request, env, CORAL))
                const ids = (env.GCFP_APPLICATION_IDS || '').split(',').map(id => id.trim())
                const selected = []
                for (const item of media) {
                    if (!item || typeof item !== 'object') throw new ApiError('upstream_format', 502, undefined, { stage: 'media_item' })
                    if (item.type !== 'image' || !ids.includes(item.applicationId)) continue
                    if (typeof item.id !== 'string' || !item.id || typeof item.contentUri !== 'string' || !Number.isSafeInteger(item.expiresAt * 1000)) throw new ApiError('upstream_format', 502, undefined, { stage: 'media_item_fields' })
                    mediaUrl(item.contentUri, env)
                    const expiresAt = item.expiresAt * 1000
                    if (expiresAt <= Date.now()) continue
                    const ticket = await seal(env, TICKET, { url: item.contentUri, mediaId: item.id, accountId: session.accountId, bindingId: session.bindingId }, Math.min(expiresAt, Date.now() + 5 * 60000))
                    selected.push({ mediaId: item.id, applicationId: item.applicationId, capturedAt: Number.isFinite(item.capturedAt) ? item.capturedAt * 1000 : null, contentLength: item.contentLength, expiresAt, ...(env.MEDIA_DIRECT === '1' ? { contentUri: item.contentUri } : {}), ticket })
                }
                await setCookie(headers, env, CORAL, cache, Math.max(1, Math.floor((cache.expiresAt - Date.now()) / 1000)))
                const avatarUrl = cache.avatarUrl || session.avatarUrl
                if (avatarUrl && avatarUrl !== session.avatarUrl) {
                    await setCookie(headers, env, SESSION, { ...session, avatarUrl }, Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)))
                }
                return reply({ accountId: session.accountId, bindingId: session.bindingId, avatarUrl, media: selected })
            }
            if (route === 'POST /api/album/content') {
                const body = await jsonBody(request)
                const ticket = typeof body.ticket === 'string' ? await unseal<{ url: string; accountId: string; bindingId: string }>(env, TICKET, body.ticket) : undefined
                if (!ticket || ticket.accountId !== session.accountId || ticket.bindingId !== session.bindingId) throw new ApiError('ticket_expired', 403)
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
