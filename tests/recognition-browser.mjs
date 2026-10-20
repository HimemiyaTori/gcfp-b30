import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = process.env.ALBUM_URL || 'http://127.0.0.1:5175'
const images = await Promise.all([
    ['manual-result.jpg', 'result/jp-bas-hard6.jpg'],
    ['manual-select.jpg', 'select/en-bas-hard8-10-fc.jpg'],
    ['album-result.jpg', 'result/jp-bas-hard8.jpg'],
].map(async ([name, path]) => ({ name, mimeType: 'image/jpeg', buffer: await readFile(new URL(`./score images/${path}`, import.meta.url)) })))
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
const errors = []
const waitForHistory = (page, count) => page.waitForFunction(async expected => {
    const { database } = await import('/src/db/database.ts')
    return await database.scoreHistory.count() === expected
}, count, { timeout: 180000 })
const readHistory = page => page.evaluate(async () => (await import('/src/db/scoreRepository.ts')).scoreRepository.history())
const navigate = async (page, hash) => {
    await page.locator(`a[href="#${hash}"]:visible`).first().click()
    await page.waitForURL(`**/#${hash}`)
}

try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 960 } })
    await context.addInitScript(() => localStorage.setItem('groove-account-profile', JSON.stringify({ id: 'recognition-site-user', email: 'recognition@example.test', nickname: '' })))
    let releaseModel, releaseImage
    const modelGate = new Promise(resolve => { releaseModel = resolve })
    const imageGate = new Promise(resolve => { releaseImage = resolve })
    let imageBlocked = true
    let pendingMedia, pendingContent, releaseMedia, releaseContent
    await context.route('**/ocr/worker.js', async route => {
        await modelGate
        await route.continue().catch(() => {})
    })
    await context.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/account') return route.fulfill({ json: { user: { id: 'recognition-site-user', email: 'recognition@example.test', nickname: '' } } })
        if (path === '/api/nintendo/binding') return route.fulfill({ json: { configured: true, status: 'unbound' } })
        if (path === '/api/album/content') {
            if (imageBlocked) await imageGate
            if (pendingContent) await pendingContent
            return route.fulfill({ body: images[2].buffer, contentType: 'image/jpeg' }).catch(() => {})
        }
        if (path === '/api/album/media') {
            if (pendingMedia) await pendingMedia
            return route.fulfill({ json: {
                accountId: 'parallel-user', bindingId: 'parallel-binding',
                media: [{ mediaId: 'parallel-image', applicationId: 'test-gcfp', capturedAt: Date.parse('2026-10-15T10:00:00Z'), expiresAt: Date.now() + 86400000, ticket: 'image' }],
            } })
        }
        return route.fulfill({ status: 404, json: { error: 'not_found' } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
    await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        const { initialAlbumState } = await import('/src/db/albumModels.ts')
        await database.albumState.put({ ...initialAlbumState(), accountId: 'parallel-user', bindingId: 'parallel-binding', nickname: '并行测试玩家', bindingGeneration: 1 })
    })
    try {
        // 真实模型资源延迟时，首页任务仍可后台显示、切页和重新打开
        await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(images.slice(0, 2))
        const manual = page.locator('.import-dialog[data-source="manual"]')
        const album = page.locator('.import-dialog[data-source="album"]')
        await manual.getByRole('button', { name: '后台识别', exact: true }).click()
        await page.locator('.ocr-toast').waitFor()
        assert.equal(await page.getByLabel('选择成绩截图或 Excel', { exact: true }).count(), 0)
        await page.getByRole('button', { name: '查看详情', exact: true }).click()
        await manual.locator('.import-result').first().waitFor()
        assert.equal(await manual.locator('.import-result').count(), 2)
        await page.keyboard.press('Escape')
        await manual.waitFor({ state: 'hidden' })
        await navigate(page, 'settings')
        const downloadStarted = page.waitForRequest(request => request.url().endsWith('/api/album/content'))
        await page.getByRole('button', { name: '更新成绩', exact: true }).click()
        await downloadStarted
        await page.locator('.album-toast').waitFor()
        assert.equal(await page.locator('.recognition-toast').count(), 2)
        await page.locator('.ocr-toast .recognition-toast-open').click()
        await manual.getByText('manual-result.jpg', { exact: false }).waitFor()
        assert.equal(await manual.locator('.import-result').count(), 2)
        await page.keyboard.press('Escape')
        await page.locator('.album-toast .recognition-toast-open').click()
        assert.equal(await album.locator('.import-result').count(), 1)
        assert.equal(await album.getByText('manual-result.jpg', { exact: false }).count(), 0)
        await album.getByRole('button', { name: '后台更新', exact: true }).click()

        // 任一识别任务运行时首页改为查看详情，拖入文件也不会新增批次
        await navigate(page, 'home')
        assert.equal(await page.getByLabel('选择成绩截图或 Excel', { exact: true }).count(), 0)
        const transfer = await page.evaluateHandle(({ name, bytes }) => {
            const data = new DataTransfer()
            data.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' }))
            return data
        }, { name: images[2].name, bytes: [...images[2].buffer] })
        await page.locator('.drop-zone').dispatchEvent('drop', { dataTransfer: transfer })
        await transfer.dispose()
        await page.getByRole('button', { name: '查看详情', exact: true }).click()
        assert.equal(await manual.locator('.import-result').count(), 2)
        assert.equal(await manual.getByText('album-result.jpg', { exact: false }).count(), 0)
        await manual.getByRole('button', { name: '后台识别', exact: true }).click()

        // 相册等待共享模型时也能立即取消，不影响正在加载模型的首页批次
        imageBlocked = false
        releaseImage()
        await page.locator('.album-toast .recognition-toast-open').click()
        await album.locator('.import-thumb').waitFor()
        await album.getByRole('button', { name: '停止更新', exact: true }).click()
        await page.getByText('已停止更新', { exact: true }).waitFor({ timeout: 5000 })
        await page.locator('.ocr-toast').waitFor()
        releaseModel()
        await waitForHistory(page, 2)
        assert.ok((await readHistory(page)).every(row => row.source === 'ocr'))
        await page.locator('.ocr-toast').getByText('录入完成', { exact: true }).waitFor()
        await page.locator('.ocr-toast .recognition-toast-open').click()
        await manual.getByText('最近一次识别于', { exact: false }).waitFor()
        assert.equal(await manual.locator('.import-result.success').count(), 2)
        await manual.getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByLabel('选择成绩截图或 Excel', { exact: true }).waitFor()

        // 相册检查列表和下载截图时均禁止首页上传，查看详情打开相册当前阶段
        await navigate(page, 'settings')
        await page.evaluate(async () => (await import('/src/db/database.ts')).database.albumState.update('album', { nextAllowedAt: 0 }))
        pendingMedia = new Promise(resolve => { releaseMedia = resolve })
        pendingContent = new Promise(resolve => { releaseContent = resolve })
        const listed = page.waitForRequest(request => request.url().endsWith('/api/album/media'))
        const downloaded = page.waitForRequest(request => request.url().endsWith('/api/album/content'))
        await page.getByRole('button', { name: '更新成绩', exact: true }).click()
        await listed
        await navigate(page, 'home')
        assert.equal(await page.getByLabel('选择成绩截图或 Excel', { exact: true }).count(), 0)
        await page.getByRole('button', { name: '查看详情', exact: true }).click()
        await album.getByRole('heading', { name: '正在检查 Nintendo 相册…', exact: true }).waitFor()
        assert.equal(await album.locator('.import-result').count(), 0)
        await album.getByRole('button', { name: '后台更新', exact: true }).click()
        releaseMedia()
        pendingMedia = undefined
        await downloaded
        await page.getByRole('button', { name: '查看详情', exact: true }).click()
        await album.getByRole('heading', { name: '正在录入成绩', exact: true }).waitFor()
        assert.equal(await album.locator('.import-result').count(), 1)
        assert.equal(await page.getByLabel('选择成绩截图或 Excel', { exact: true }).count(), 0)
        await album.getByRole('button', { name: '后台更新', exact: true }).click()
        releaseContent()
        pendingContent = undefined
        await waitForHistory(page, 3)
        await page.locator('.album-toast').getByText('相册已同步', { exact: true }).waitFor()
        await page.getByLabel('选择成绩截图或 Excel', { exact: true }).waitFor()
        await page.locator('.album-toast .recognition-toast-open').click()
        await album.getByText('最近一次识别于', { exact: false }).waitFor()
        assert.equal(await album.locator('.import-result.success').count(), 1)
        assert.equal((await readHistory(page)).filter(row => row.source === 'nso_ocr').length, 1)
        await album.getByRole('button', { name: '关闭', exact: true }).click()
        await page.setViewportSize({ width: 390, height: 844 })
        await navigate(page, 'home')
        await page.getByRole('button', { name: '查看上次识别（2 张）', exact: true }).click()
        await manual.locator('.import-thumb').first().click()
        await manual.locator('.import-preview img').waitFor()
        await mkdir('.preview', { recursive: true })
        await page.screenshot({ path: '.preview/recognition-mobile.png' })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        await manual.getByRole('button', { name: '关闭', exact: true }).click()
        await page.reload()
        await page.getByRole('button', { name: '查看上次识别（2 张）', exact: true }).click()
        await manual.getByText('最近一次识别于', { exact: false }).waitFor()
        assert.equal(await manual.locator('.import-result.success').count(), 2)
    } finally {
        releaseModel()
        releaseImage()
        releaseMedia?.()
        releaseContent?.()
        await context.close()
    }

    // 另一标签页清空数据时，后台首页旧任务及识别结果不能重新写入
    const clearContext = await browser.newContext({ locale: 'zh-CN' })
    let releaseBlockedModel
    const blockedModel = new Promise(resolve => { releaseBlockedModel = resolve })
    await clearContext.route('**/ocr/worker.js', async route => {
        await blockedModel
        await route.continue().catch(() => {})
    })
    const pendingPage = await clearContext.newPage()
    pendingPage.on('pageerror', error => errors.push(error.message))
    try {
        await pendingPage.goto(origin)
        await pendingPage.getByRole('heading', { name: '录入新成绩' }).waitFor()
        await pendingPage.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
        await pendingPage.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(images[0])
        await pendingPage.getByRole('button', { name: '后台识别', exact: true }).click()
        const clearPage = await clearContext.newPage()
        clearPage.on('pageerror', error => errors.push(error.message))
        await clearPage.goto(`${origin}#settings`)
        await clearPage.getByRole('button', { name: '清空数据', exact: true }).click()
        await clearPage.getByRole('button', { name: '确认清空全部成绩', exact: true }).click()
        await pendingPage.getByText('已取消识别', { exact: true }).waitFor()
        releaseBlockedModel()
        await pendingPage.reload()
        await pendingPage.getByRole('heading', { name: '录入新成绩' }).waitFor()
        assert.equal((await readHistory(pendingPage)).length, 0)
        assert.equal(await pendingPage.getByRole('button', { name: /查看上次识别/ }).count(), 0)
        assert.equal(await pendingPage.locator('.recognition-toast').count(), 0)
    } finally {
        releaseBlockedModel()
        await clearContext.close()
    }
    assert.deepEqual(errors, [])
    console.log('Recognition acceptance passed: background progress, reopening, concurrent sources, upload guard, independent cancellation, album recovery, mobile preview, persistence and cross-tab clear')
} finally {
    await browser.close()
}
