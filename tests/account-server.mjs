import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { Miniflare } from 'miniflare'
import { build } from 'esbuild'
import worker from '../worker/index.ts'

// 外部发信和 Nintendo 为模拟依赖，账号、会话和业务存储使用真实 D1 与 HTTP
export async function createAccountServer({ runtimeMode = true, externalFetch, assets = false } = {}) {
    const realFetch = globalThis.fetch
    const emails = new Map()
    const control = { mailMode: '', accountId: 'test-account-id', noAvatar: false, mediaExpired: false, requestOrigin: '' }
    const env = {
        COOKIE_KEY: randomBytes(32).toString('base64url'), COOKIE_KEY_VERSION: '1',
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
        RESEND_API_KEY: 'test-resend', EMAIL_FROM: 'Groove Archive <login@example.test>',
        EMAIL_DAILY_LIMIT: '90', EMAIL_MONTHLY_LIMIT: '2900',
        NXAPI_CLIENT_ID: 'test-client', GCFP_APPLICATION_IDS: 'test-gcfp', MEDIA_HOSTS: 'media.example.test',
    }
    const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
    const outbound = async (url, init = {}) => {
        const address = String(url)
        if (address.startsWith('http://127.0.0.1') || address.startsWith('http://localhost')) return realFetch(url, init)
        if (address === 'https://api.resend.com/emails') {
            if (control.mailMode === 'timeout') {
                if (!runtimeMode) throw new Error('mock mail timeout')
                await new Promise(resolve => setTimeout(resolve, 16000))
                return new Response('{}', { status: 504 })
            }
            if (control.mailMode === 'limited') return new Response('{}', { status: 429 })
            if (control.mailMode === 'failure') return new Response('{}', { status: 503 })
            const body = JSON.parse(init.body)
            emails.set(body.to[0], body.text.match(/\b\d{6}\b/)[0])
            return json({ id: randomBytes(8).toString('hex') })
        }
        if (address.startsWith('https://test-assets.invalid')) {
            const root = resolve('dist')
            const path = resolve(root, `.${decodeURIComponent(new URL(address).pathname)}`)
            if (!path.startsWith(root + sep) && path !== root) return new Response('not found', { status: 404 })
            const file = path === root ? resolve(root, 'index.html') : path
            try {
                const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }
                return new Response(await readFile(file), { headers: { 'Content-Type': types[extname(file)] || 'application/octet-stream' } })
            } catch { return new Response('not found', { status: 404 }) }
        }
        if (externalFetch) return externalFetch(url, init)
        if (address.includes('oauth-protected-resource')) return json({ authorization_servers: ['https://nxapi-auth.fancy.org.uk'] })
        if (address.includes('oauth-authorization-server')) return json({ token_endpoint: 'https://nxapi-auth.fancy.org.uk/token' })
        if (address === 'https://nxapi-auth.fancy.org.uk/token') return json({ access_token: 'third-party-token' })
        if (address.endsWith('/api/session_token')) return json({ session_token: 'nintendo-session-secret' })
        if (address.endsWith('/api/token')) return json({ access_token: 'account-token', id_token: 'identity-token' })
        if (address.endsWith('/users/me')) return json({ id: control.accountId, nickname: 'NS 测试玩家', language: 'ja-JP', iconUri: control.noAvatar ? null : 'https://avatars.example.test/nintendo.png' })
        if (address.endsWith('/znca/f')) return json({ encrypted_token_request: btoa('login') })
        if (address.endsWith('/znca/encrypt-request')) return json({ data: btoa('media') })
        if (address.endsWith('/v4/Account/Login')) return json({ status: 0, result: {
            user: { imageUri: control.noAvatar ? null : 'https://avatars.example.test/ns.png' },
            webApiServerCredential: { accessToken: 'coral-secret', expiresIn: 3600 },
        } })
        if (address.endsWith('/v4/Media/List')) return json({ status: control.mediaExpired ? 9404 : 0, result: { media: [] } })
        if (address.endsWith('/znca/decrypt-response')) return new Response(Buffer.from(JSON.parse(init.body).data, 'base64'))
        throw new Error(`Unexpected external fixture host: ${new URL(address).hostname}`)
    }
    const built = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:*', 'cloudflare:*'] })
    const wrapper = `import worker from './project-worker.js';
        export default { fetch(request, bindings) {
            const env = { ...request.cf.hostMetadata.testEnv, DB: bindings.DB };
            env.API_LIMIT = { limit: async () => ({ success: true }) };
            env.ASSETS = { fetch: request => fetch('https://test-assets.invalid' + new URL(request.url).pathname) };
            return worker.fetch(request, env);
        } };`
    const runtime = new Miniflare({ workers: [{ config: {
        name: 'account-acceptance', compatibilityDate: '2026-10-06', compatibilityFlags: ['nodejs_compat'],
        env: { DB: { type: 'd1', id: 'account-acceptance-db' } },
        manifest: { mainModule: 'wrapper.js', modules: {
            'wrapper.js': { type: 'esm', contents: wrapper },
            'project-worker.js': { type: 'esm', contents: built.outputFiles[0].text },
        } },
    }, dev: { outboundService: { type: 'fetcher', handler: async request => outbound(request.url, {
        method: request.method, headers: request.headers, body: request.body ? await request.text() : undefined,
    }) } } }] })
    const db = await runtime.getD1Database('DB')
    for (const name of ['0001_auth.sql', '0002_accounts.sql']) {
        const sql = await readFile(new URL(`../worker/migrations/${name}`, import.meta.url), 'utf8')
        await db.batch(sql.split(';').map(part => part.trim()).filter(Boolean).map(part => db.prepare(part)))
    }
    const server = createServer(async (incoming, outgoing) => {
        try {
            const chunks = []
            for await (const chunk of incoming) chunks.push(chunk)
            const origin = env.APP_ORIGIN || `http://127.0.0.1:${server.address().port}`
            const url = `${control.requestOrigin || origin}${incoming.url}`
            const init = { method: incoming.method, headers: incoming.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }
            let response
            if (assets && !incoming.url.startsWith('/api/')) response = await outbound('https://test-assets.invalid' + new URL(url).pathname)
            else if (runtimeMode) response = await runtime.dispatchFetch(url, { ...init, cf: { hostMetadata: { testEnv: env } } })
            else {
                response = await worker.fetch(new Request(url, init), { ...env, DB: db, API_LIMIT: { limit: async () => ({ success: true }) }, ASSETS: { fetch: async () => new Response('static') } })
            }
            outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), 'set-cookie': response.headers.getSetCookie() })
            outgoing.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
            console.error(error)
            outgoing.writeHead(500); outgoing.end('acceptance server failure')
        }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    if (!runtimeMode) globalThis.fetch = outbound
    function device() {
        const jar = new Map()
        const api = async (path, method = 'GET', body, extra = {}) => {
            const response = await realFetch(origin + path, {
                method, headers: { Origin: origin, 'X-App-Protocol-Version': '1',
                    Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
                    ...(body ? { 'Content-Type': body instanceof Uint8Array ? 'image/webp' : 'application/json' } : {}), ...extra },
                body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
            })
            for (const cookie of response.headers.getSetCookie()) {
                const pair = cookie.split(';')[0], index = pair.indexOf('=')
                if (pair.slice(index + 1)) jar.set(pair.slice(0, index), pair.slice(index + 1))
                else jar.delete(pair.slice(0, index))
            }
            return response
        }
        async function signIn(email) {
            const sent = await api('/api/auth/email-otp/send-verification-otp', 'POST', { email })
            if (!sent.ok) throw new Error(`send failed ${sent.status}: ${await sent.text()}`)
            if (!/^\d{6}$/.test(emails.get(email) || '')) throw new Error('Mock mailbox did not receive the OTP')
            const signed = await api('/api/auth/sign-in/email-otp', 'POST', { email, otp: emails.get(email) })
            if (!signed.ok) throw new Error(`login failed ${signed.status}: ${await signed.text()}`)
            return (await (await api('/api/account')).json()).user
        }
        return { jar, api, signIn }
    }
    return { env, db, control, emails, origin, device, async close() {
        globalThis.fetch = realFetch
        await new Promise(resolve => server.close(resolve))
        await runtime.dispose()
    } }
}
