import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAccountServer } from './account-server.mjs'

// 模拟外部 Nintendo 与第三方响应，通过真实 HTTP 请求验收公开 API 和 Cookie 行为
const realFetch = globalThis.fetch
const runtimeMode = process.argv.includes('--runtime')
const image = await readFile(
    new URL('./score images/select/jp-adv-hard8-8.jpg', import.meta.url),
)
let expiredCoral = false,
    oversized = false
let workerRequestOrigin
let redirectSessionToken = false
let omitCombinedLogin = false
let encryptedContentType = 'application/json; charset=utf-8'
let badDecryptedResponse = false
let badEncryptedResponse = false
let invalidThirdPartyToken = false
let rateLimitedMedia = false
let noAccountAvatar = false
let downloadMode = ''
const json = (value) =>
    new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
    })
const cipherPrefix = Buffer.from([0xfb, 0xff, 0x00, 0x01])
const encrypted = (value) =>
    new Response(
        Buffer.concat([cipherPrefix, Buffer.from(JSON.stringify(value))]),
        {
            headers: { 'Content-Type': encryptedContentType },
        },
    )
const mockFetch = async (url, init) => {
    const address = String(url)
    if (address.startsWith('http://127.0.0.1')) return realFetch(url, init)
    if (
        address ===
        'https://nxapi-znca-api.fancy.org.uk/.well-known/oauth-protected-resource'
    )
        return json({
            authorization_servers: ['https://nxapi-auth.fancy.org.uk'],
        })
    if (address.includes('oauth-authorization-server'))
        return json({ token_endpoint: 'https://nxapi-auth.fancy.org.uk/token' })
    if (address === 'https://nxapi-auth.fancy.org.uk/token') {
        const body = new URLSearchParams(init.body)
        const valid =
            body.get('grant_type') === 'client_credentials' &&
            body.get('scope') === 'ca:gf ca:er ca:dr' &&
            body.get('client_id') === env.NXAPI_CLIENT_ID &&
            (env.NXAPI_CLIENT_SECRET?.trim()
                ? body.get('client_secret') === env.NXAPI_CLIENT_SECRET
                : !body.has('client_secret'))
        return valid
            ? json({ access_token: 'test-third-party-token' })
            : new Response('invalid_client', { status: 401 })
    }
    if (address.endsWith('/api/session_token') && redirectSessionToken)
        return new Response(null, {
            status: 307,
            headers: { Location: 'https://other.example/collect' },
        })
    if (address.endsWith('/api/session_token'))
        return json({ session_token: 'test-session' })
    if (address.endsWith('/api/token'))
        return json({ access_token: 'test-account', id_token: 'test-identity' })
    if (address.endsWith('/users/me'))
        return json({
            id: 'test-account-id',
            nickname: '测试账号',
            iconUri: noAccountAvatar ? null : 'https://avatars.example.test/account.png',
            language: 'ja-JP',
        })
    if (address.endsWith('/znca/f')) {
        if (omitCombinedLogin)
            return json({
                f: 'test-f',
                timestamp: 1780000000000,
                request_id: 'test-request-id',
            })
        return json({
            encrypted_token_request: Buffer.from('login').toString('base64'),
        })
    }
    if (address.endsWith('/znca/encrypt-request')) {
        if (invalidThirdPartyToken) {
            invalidThirdPartyToken = false
            return new Response(JSON.stringify({ error: 'invalid_token' }), {
                status: 401,
            })
        }
        if (badEncryptedResponse) return json({ data: null })
        const body = JSON.parse(init.body)
        const login = body.url.endsWith('/Account/Login')
        const valid = login
            ? body.token === null &&
              JSON.parse(body.data).parameter.f === 'test-f'
            : body.token === 'test-coral'
        if (!valid)
            return new Response(JSON.stringify({ error: 'invalid_request' }), {
                status: 400,
            })
        return json({
            data: Buffer.concat([
                cipherPrefix,
                Buffer.from(login ? 'login' : 'media'),
            ]).toString('base64url'),
        })
    }
    if (address.endsWith('/znca/decrypt-response')) {
        if (badDecryptedResponse)
            return new Response('invalid-json', {
                headers: { 'Content-Type': 'text/plain' },
            })
        const raw = Buffer.from(JSON.parse(init.body).data, 'base64')
        if (!raw.subarray(0, cipherPrefix.length).equals(cipherPrefix))
            return new Response(JSON.stringify({ error: 'invalid_request' }), {
                status: 400,
            })
        return new Response(raw.subarray(cipherPrefix.length), {
            headers: { 'Content-Type': 'text/plain' },
        })
    }
    if (address.endsWith('/v4/Account/Login'))
        return encrypted({
            status: 0,
            result: {
                naUser: { iconUri: noAccountAvatar ? null : 'https://avatars.example.test/updated.png' },
                user: { imageUri: 'https://avatars.example.test/switch.png' },
                webApiServerCredential: {
                    accessToken: 'test-coral',
                    expiresIn: 3600,
                },
            },
        })
    if (address.endsWith('/v4/Media/List')) {
        if (expiredCoral) {
            expiredCoral = false
            return encrypted({ status: 9404 })
        }
        if (rateLimitedMedia) return encrypted({ status: 9437 })
        return encrypted({
            status: 0,
            result: {
                media: [
                    {
                        id: 'image-1',
                        type: 'image',
                        applicationId: 'test-gcfp',
                        capturedAt: 1780000000,
                        expiresAt: Math.floor(Date.now() / 1000) + 3600,
                        contentUri: 'https://media.example.test/original.jpg',
                        contentLength: image.length,
                    },
                    { id: 'unrelated', type: 'image', applicationId: 'other' },
                    { id: 'video', type: 'video', applicationId: 'test-gcfp' },
                ],
            },
        })
    }
    if (address === 'https://media.example.test/original.jpg') {
        if (downloadMode === 'redirect')
            return new Response(null, {
                status: 302,
                headers: { Location: '/redirected.jpg' },
            })
        if (downloadMode === 'untrusted')
            return new Response(null, {
                status: 307,
                headers: { Location: 'https://other.example/collect' },
            })
        if (downloadMode === 'expired')
            return new Response(null, { status: 403 })
        if (downloadMode === 'invalid')
            return new Response('<html>not an image</html>', {
                headers: { 'Content-Type': 'text/html' },
            })
    }
    if (
        [
            'https://media.example.test/original.jpg',
            'https://media.example.test/redirected.jpg',
        ].includes(address)
    )
        return new Response(image, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(
                    oversized ? 21 * 1024 * 1024 : image.length,
                ),
            },
        })
    throw new Error('Unexpected external endpoint')
}
const app = await createAccountServer({ runtimeMode, externalFetch: mockFetch })
const env = app.env
env.NXAPI_CLIENT_SECRET = 'test-secret'
const { origin } = app
const device = app.device()
const { jar } = device
async function api(path, method = 'GET', body, extra = {}) {
    // 准备已过冷却的时刻，逐个验收外部响应；跨设备冷却由账号 HTTP 验收覆盖
    if (path === '/api/album/media') await app.db.prepare('UPDATE nintendo_bindings SET next_allowed_at = 0').run()
    return device.api(path, method, body, extra)
}
await device.signIn('album@example.test')

try {
    assert.equal(
        (await (await api('/api/nintendo/binding')).json()).status,
        'unbound',
    )
    assert.equal(
        (
            await api(
                '/api/nintendo/auth/start',
                'POST',
                { consent: true },
                { Origin: 'https://other.example' },
            )
        ).status,
        403,
    )
    const start = await (
        await api('/api/nintendo/auth/start', 'POST', { consent: true })
    ).json()
    let state = new URL(start.url).searchParams.get('state')
    assert.equal(
        (
            await api('/api/nintendo/auth/complete', 'POST', {
                callback: 'https://evil.example/#state=' + state,
            })
        ).status,
        400,
    )
    state = new URL((await (await api('/api/nintendo/auth/start', 'POST', { consent: true })).json()).url).searchParams.get('state')
    redirectSessionToken = true
    const redirected = await api('/api/nintendo/auth/complete', 'POST', {
        callback: `npf71b963c1b7b6d119://auth#state=${state}&session_token_code=test-code`,
    })
    assert.equal(redirected.status, 502)
    assert.deepEqual(await redirected.json(), { error: 'upstream_redirect' })
    redirectSessionToken = false
    state = new URL((await (await api('/api/nintendo/auth/start', 'POST', { consent: true })).json()).url).searchParams.get('state')
    const linked = await api('/api/nintendo/auth/complete', 'POST', {
        callback: `npf71b963c1b7b6d119://auth#state=${state}&session_token_code=test-code`,
    })
    assert.equal(linked.status, 200)
    const binding = await linked.json()
    assert.equal(binding.accountId, 'test-account-id')
    assert.equal(binding.avatarUrl, 'https://avatars.example.test/account.png')
    assert.equal((await (await api('/api/nintendo/binding')).json()).avatarUrl, binding.avatarUrl)
    assert.ok(![...jar.values()].join('').includes('test-session'))
    const listing = await api('/api/album/media', 'POST', {})
    assert.equal(listing.headers.get('cache-control'), 'no-store')
    const album = await listing.json()
    assert.equal(album.avatarUrl, 'https://avatars.example.test/switch.png')
    assert.equal((await (await api('/api/nintendo/binding')).json()).avatarUrl, album.avatarUrl)
    assert.equal(album.media.length, 1)
    assert.equal(album.media[0].capturedAt, 1780000000000)
    assert.equal(album.media[0].contentUri, undefined)
    assert.equal(
        (
            await api('/api/album/content', 'POST', {
                ticket: 'forged',
                url: 'http://127.0.0.1',
            })
        ).status,
        403,
    )
    const downloaded = await api('/api/album/content', 'POST', {
        ticket: album.media[0].ticket,
    })
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), image)
    downloadMode = 'redirect'
    const redirectedImage = await api('/api/album/content', 'POST', {
        ticket: album.media[0].ticket,
    })
    assert.equal(redirectedImage.status, 200)
    assert.deepEqual(Buffer.from(await redirectedImage.arrayBuffer()), image)
    for (const [mode, expected] of [
        ['untrusted', 'media_host_rejected'],
        ['expired', 'media_expired'],
        ['invalid', 'invalid_image'],
    ]) {
        downloadMode = mode
        const rejected = await api('/api/album/content', 'POST', {
            ticket: album.media[0].ticket,
        })
        assert.equal(rejected.status, 502)
        assert.equal((await rejected.json()).error, expected)
    }
    downloadMode = ''
    // 对外错误包含固定阶段标识，格式错误不会泄露上游响应内容
    badDecryptedResponse = true
    const malformed = await api('/api/album/media', 'POST', {})
    assert.equal(malformed.status, 502)
    assert.deepEqual(await malformed.json(), {
        error: 'upstream_format',
        stage: 'coral_media_decrypt',
    })
    badDecryptedResponse = false
    badEncryptedResponse = true
    const missingCipher = await api('/api/album/media', 'POST', {})
    assert.equal(missingCipher.status, 502)
    assert.deepEqual(await missingCipher.json(), {
        error: 'upstream_format',
        stage: 'third_party_encrypt_fields',
    })
    badEncryptedResponse = false
    invalidThirdPartyToken = true
    assert.equal((await api('/api/album/media', 'POST', {})).status, 200)
    rateLimitedMedia = true
    const limited = await api('/api/album/media', 'POST', {})
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('retry-after'), '60')
    rateLimitedMedia = false
    oversized = true
    assert.equal(
        (
            await api('/api/album/content', 'POST', {
                ticket: album.media[0].ticket,
            })
        ).status,
        413,
    )
    oversized = false
    expiredCoral = true
    assert.equal((await api('/api/album/media', 'POST', {})).status, 200)
    const sessionName = [...jar.keys()].find(name => name.includes('session_token'))
    const session = jar.get(sessionName)
    jar.set(sessionName, session + 'x')
    assert.equal((await api('/api/album/media', 'POST', {})).status, 401)
    jar.set(sessionName, session)
    await api('/api/nintendo/binding', 'DELETE')
    assert.equal(
        (await (await api('/api/nintendo/binding')).json()).status,
        'unbound',
    )
    assert.equal(
        (
            await api('/api/album/content', 'POST', {
                ticket: album.media[0].ticket,
            })
        ).status,
        401,
    )
    // 通过真实 HTTP 请求模拟远程代理改写 URL，显式来源仍精确校验浏览器地址
    workerRequestOrigin = app.control.requestOrigin = 'https://preview.example.test'
    assert.equal(
        (await api('/api/nintendo/auth/start', 'POST', { consent: true }))
            .status,
        403,
    )
    env.APP_ORIGIN = origin
    for (const extra of [
        { Origin: 'https://other.example' },
        { Origin: workerRequestOrigin },
        { Origin: '' },
        { Origin: origin.replace('127.0.0.1', 'localhost') },
        { 'Sec-Fetch-Site': 'cross-site' },
        {
            Origin: 'https://other.example',
            'MF-Original-URL': origin,
            'X-Forwarded-Host': new URL(origin).host,
        },
    ]) {
        assert.equal(
            (
                await api(
                    '/api/nintendo/auth/start',
                    'POST',
                    { consent: true },
                    extra,
                )
            ).status,
            403,
        )
    }
    // 远程代理场景下，仅 Client ID 的公开客户端也能完成绑定、读取相册及下载原图
    for (const optionalSecret of [undefined, '']) {
        noAccountAvatar = optionalSecret === ''
        omitCombinedLogin = optionalSecret === ''
        encryptedContentType =
            optionalSecret === ''
                ? 'application/octet-stream'
                : 'application/json'
        if (optionalSecret === undefined) delete env.NXAPI_CLIENT_SECRET
        else env.NXAPI_CLIENT_SECRET = optionalSecret
        assert.equal(
            (await (await api('/api/nintendo/binding')).json()).configured,
            true,
        )
        const publicStart = await (
            await api('/api/nintendo/auth/start', 'POST', { consent: true })
        ).json()
        const publicState = new URL(publicStart.url).searchParams.get('state')
        assert.equal(
            (
                await api('/api/nintendo/auth/complete', 'POST', {
                    callback: `npf71b963c1b7b6d119://auth#state=${publicState}&session_token_code=test-code`,
                })
            ).status,
            200,
        )
        const publicListing = await api('/api/album/media', 'POST', {})
        assert.equal(publicListing.status, 200)
        const publicAlbum = await publicListing.json()
        assert.equal(publicAlbum.avatarUrl, 'https://avatars.example.test/switch.png')
        assert.equal((await (await api('/api/nintendo/binding')).json()).avatarUrl, publicAlbum.avatarUrl)
        assert.equal(publicAlbum.media.length, 1)
        const publicImage = await api('/api/album/content', 'POST', {
            ticket: publicAlbum.media[0].ticket,
        })
        assert.equal(publicImage.status, 200)
        assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), image)
        await api('/api/nintendo/binding', 'DELETE')
    }
    console.log(
        `Album ${runtimeMode ? 'Workerd' : 'Node'} HTTP acceptance passed: NSO avatar preference and account persistence, encrypted JSON-labelled responses, separate login encryption, malformed payload diagnostics, token recovery, rate limits, confidential/public clients, remote proxy origins, filtered album, original image, expiry, invalid tickets, size limit and unlink`,
    )
} finally {
    await app.close()
}
