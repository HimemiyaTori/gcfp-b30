import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
const origin = process.env.ALBUM_URL || 'http://127.0.0.1:5175'
const image = await readFile(new URL('./score images/20260922085638-01M2YK0M46GQPCK5PCRA3TAR4A.jpg', import.meta.url))
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 960 } })
    let bound = false, configured = true, expiredTicket = true
    const media = [{ mediaId: 'screenshot-1', applicationId: 'test-gcfp', capturedAt: Date.parse('2026-09-22T08:56:38Z'), contentLength: image.length, expiresAt: Date.now() + 86400000, ticket: 'mock-ticket' }]
    const binding = () => ({ configured, status: bound ? 'active' : 'unbound', ...(bound ? { accountId: 'test-user', bindingId: 'binding-1', nickname: '测试玩家' } : {}) })
    const observed = []
    await context.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname
        observed.push(path)
        if (path === '/api/album/content') {
            if (expiredTicket) { expiredTicket = false; return route.fulfill({ status: 403, json: { error: 'ticket_expired' } }) }
            return route.fulfill({ body: image, contentType: 'image/jpeg' })
        }
        let data
        if (path === '/api/nintendo/binding') { if (route.request().method() === 'DELETE') bound = false; data = binding() }
        else if (path === '/api/nintendo/auth/start') data = { url: 'https://accounts.nintendo.com/test' }
        else if (path === '/api/nintendo/auth/complete') { bound = true; data = binding() }
        else if (path === '/api/album/media') data = { accountId: 'test-user', bindingId: 'binding-1', media }
        else return route.fulfill({ status: 404, json: { error: 'not_found' } })
        return route.fulfill({ json: data })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    assert.deepEqual(observed, [])
    await page.evaluate(() => { location.hash = '#settings' })
    await page.getByRole('button', { name: '打开相册设置' }).click()
    await page.getByText('绑定或重新绑定 Nintendo 账号', { exact: true }).click()
    await page.getByLabel('我已了解并同意上述处理方式').check()
    await page.getByRole('button', { name: '生成授权链接' }).click()
    await page.getByLabel('授权回调链接', { exact: true }).fill('npftest://auth#test')
    await page.getByRole('button', { name: '完成绑定' }).click()
    await page.getByText('已绑定：测试玩家', { exact: true }).waitFor()
    await page.getByRole('button', { name: '读取截图', exact: true }).click()
    await page.getByRole('button', { name: '预览与确认', exact: true }).waitFor({ timeout: 180000 })
    await page.getByRole('button', { name: '预览与确认', exact: true }).click()
    await page.getByAltText('Nintendo 原始截图').waitFor()
    await page.getByRole('button', { name: '确认入库', exact: true }).click()
    await page.getByText('新增历史 1 条，更新最佳成绩 1 条', { exact: true }).waitFor()
    const state = () => page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        return { history: await scoreRepository.history(), best: await scoreRepository.list(), snapshots: await scoreRepository.snapshots() }
    })
    const first = await state()
    assert.equal(first.history.length, 1)
    assert.equal(first.history[0].chartId, '10-basic-hard')
    assert.equal(first.history[0].score, 1027499)
    assert.equal(first.history[0].fc, true)
    assert.equal(first.history[0].ap, false)
    assert.equal(first.history[0].source, 'nso_ocr')
    assert.equal(first.history[0].playedAt, media[0].capturedAt)
    assert.equal(first.best[0].updatedAt, media[0].capturedAt)
    assert.equal(first.snapshots[0].playedAt, media[0].capturedAt)
    await page.reload()
    await page.getByRole('button', { name: '打开相册设置' }).click()
    assert.equal((await state()).history.length, 1)
    // 准备持久化待确认候选，验收低分、拒绝恢复以及真实清空操作对旧候选的拦截
    await page.evaluate(async candidate => {
        const { database } = await import('/src/db/database.ts')
        const original = await database.albumItems.get(['test-user', 'screenshot-1'])
        await database.albumItems.put({ ...original, mediaId: 'low-score', stage: 'needs_review', capturedAt: candidate.playedAt + 1000, candidate: { songId: candidate.songId, chartId: candidate.chartId, score: candidate.score - 1000, updatedAt: candidate.playedAt + 1000, fc: false, ap: false }, contentHash: 'different-content' })
    }, first.history[0])
    await page.getByRole('button', { name: '拒绝', exact: true }).click()
    await page.locator('.album-items').getByText(/已拒绝/).waitFor()
    await page.getByRole('button', { name: '重试 / 重新审核', exact: true }).click()
    await page.getByRole('button', { name: '预览与确认', exact: true }).click()
    await page.getByText('原图已不可用，可依据候选手动确认', { exact: true }).waitFor()
    await page.getByRole('button', { name: '确认入库', exact: true }).click()
    await page.getByText('新增历史 1 条，更新最佳成绩 0 条', { exact: true }).waitFor()
    assert.equal((await state()).history.length, 2)
    assert.equal((await state()).best[0].score, first.best[0].score)
    await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        const item = await database.albumItems.get(['test-user', 'low-score'])
        await database.albumItems.put({ ...item, mediaId: 'old-candidate', stage: 'needs_review' })
    })
    await page.getByRole('button', { name: '预览与确认', exact: true }).click()
    await page.getByText('原图已不可用，可依据候选手动确认', { exact: true }).waitFor()
    const second = await context.newPage()
    await second.goto(origin + '/#settings')
    await second.getByRole('button', { name: '清空数据', exact: true }).click()
    await second.getByRole('button', { name: '确认清空全部成绩', exact: true }).click()
    await second.getByRole('button', { name: '确认清空全部成绩', exact: true }).waitFor({ state: 'hidden' })
    await page.bringToFront()
    await page.getByRole('button', { name: '确认入库', exact: true }).click()
    await page.getByText('数据已清空或绑定已改变，旧任务不能提交', { exact: true }).waitFor()
    assert.equal((await state()).history.length, 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await mkdir('.preview', { recursive: true })
    await page.screenshot({ path: '.preview/album-mobile.png', fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.getByRole('button', { name: '解除绑定', exact: true }).click()
    await page.getByText('已绑定：测试玩家', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal((await state()).history.length, 0)
    assert.deepEqual(errors, [])
    console.log('Album browser acceptance passed: real image OCR, preview, confirmed import, capture time, persistence, low scores, rejection recovery and stale candidate isolation')
} finally { await browser.close() }
