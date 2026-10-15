import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const origin = process.env.ALBUM_URL || 'http://127.0.0.1:5175'
const sample = (path) =>
    readFile(new URL(`./score images/${path}`, import.meta.url))
const images = {
    select: await sample('select/en-bas-hard8-10-fc.jpg'),
    playing: await sample('playing/6388.jpg'),
    result: await sample('result/jp-bas-hard6.jpg'),
    retry: await sample('result/jp-bas-hard8.jpg'),
}
const browser = await chromium.launch({
    channel: process.env.OCR_BROWSER || 'msedge',
    headless: true,
})
try {
    const context = await browser.newContext({
        locale: 'zh-CN',
        viewport: { width: 1280, height: 960 },
    })
    let bound = false,
        expiredTicket = true,
        brokenDownload = true
    const entry = (mediaId, image, capturedAt) => ({
        mediaId,
        applicationId: 'test-gcfp',
        capturedAt: Date.parse(capturedAt),
        contentLength: images[image].length,
        expiresAt: Date.now() + 86400000,
        ticket: image,
    })
    const media = [
        entry('select-1', 'select', '2026-09-22T08:56:38Z'),
        entry('playing-1', 'playing', '2026-09-22T09:10:00Z'),
    ]
    const binding = () => ({
        configured: true,
        status: bound ? 'active' : 'unbound',
        ...(bound
            ? {
                  accountId: 'test-user',
                  bindingId: 'binding-1',
                  nickname: '测试玩家',
              }
            : {}),
    })
    const observed = []
    await context.route('**/api/**', async (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        observed.push(`${request.method()} ${path}`)
        if (path === '/api/album/content') {
            const ticket = request.postDataJSON().ticket
            if (expiredTicket) {
                expiredTicket = false
                return route.fulfill({
                    status: 403,
                    json: { error: 'ticket_expired' },
                })
            }
            if (ticket === 'retry' && brokenDownload)
                return route.fulfill({
                    status: 502,
                    json: { error: 'download_failed' },
                })
            return route.fulfill({
                body: images[ticket],
                contentType: 'image/jpeg',
            })
        }
        let data
        if (path === '/api/nintendo/binding') {
            if (request.method() === 'DELETE') bound = false
            data = binding()
        } else if (path === '/api/nintendo/auth/start')
            data = { url: 'https://accounts.nintendo.com/test' }
        else if (path === '/api/nintendo/auth/complete') {
            bound = true
            data = binding()
        } else if (path === '/api/album/media')
            data = { accountId: 'test-user', bindingId: 'binding-1', media }
        else return route.fulfill({ status: 404, json: { error: 'not_found' } })
        return route.fulfill({ json: data })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const mediaRequests = () =>
        observed.filter((item) => item === 'POST /api/album/media').length
    const state = () =>
        page.evaluate(async () => {
            const { scoreRepository } =
                await import('/src/db/scoreRepository.ts')
            return {
                history: await scoreRepository.history(),
                best: await scoreRepository.list(),
            }
        })
    await page.goto(origin)
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.evaluate(() => {
        location.hash = '#settings'
    })
    await page
        .getByRole('heading', { name: '账号与设置', exact: true })
        .waitFor()
    // 未绑定用户浏览首页和设置页都不请求 API
    assert.deepEqual(observed, [])

    // 先确认风险与信息，再进入登录步骤并自动生成登录链接
    const account = page.locator('.account-panel')
    await account
        .getByRole('button', { name: '绑定 Nintendo 账号', exact: true })
        .click()
    const bind = page.locator('.bind-dialog')
    await bind.getByRole('heading', { name: '非官方接入' }).waitFor()
    const agree = bind.getByRole('button', { name: '同意并继续', exact: true })
    assert.equal(await agree.isDisabled(), true)
    await bind.getByLabel('我已阅读并了解上述风险与数据处理方式').check()
    await agree.click()
    const login = bind.getByRole('link', { name: '前往登录' })
    await login.waitFor()
    assert.equal(
        await login.getAttribute('href'),
        'https://accounts.nintendo.com/test',
    )
    assert.equal(await login.getAttribute('target'), '_blank')
    for (const title of ['登录 Nintendo 账号', '复制链接', '粘贴链接'])
        await bind.getByRole('heading', { name: title, exact: true }).waitFor()
    const finish = bind.getByRole('button', { name: '完成绑定', exact: true })
    await bind.getByLabel('账号链接').fill('https://example.com/auth')
    await bind.getByText('链接应以 npf 开头', { exact: false }).waitFor()
    assert.equal(await finish.isDisabled(), true)
    await bind.getByLabel('账号链接').fill('npftest://auth#test')
    await finish.click()
    await bind.getByRole('heading', { name: '绑定成功' }).waitFor()
    await bind.getByText('测试玩家', { exact: true }).waitFor()

    // 绑定后自动读取相册，只显示进度提示，点击提示打开首页同款识别弹窗
    const sync = page
        .locator('.import-dialog')
        .filter({ hasText: 'NINTENDO ALBUM' })
    const toast = page.locator('button.album-toast-open')
    await toast.click({ timeout: 180000 })
    await sync
        .getByText('跳过 1 张，失败 0 张', { exact: false })
        .waitFor({ timeout: 180000 })
    await sync.getByText('不是支持的结算页或选曲页', { exact: false }).waitFor()
    await sync.getByRole('button', { name: '关闭', exact: true }).click()
    const first = await state()
    assert.equal(first.history.length, 1)
    assert.equal(first.history[0].chartId, '10-basic-hard')
    assert.equal(first.history[0].score, 1027499)
    assert.equal(first.history[0].fc, true)
    assert.equal(first.history[0].ap, false)
    assert.equal(first.history[0].source, 'nso_ocr')
    assert.equal(first.history[0].playedAt, media[0].capturedAt)
    assert.equal(first.best[0].updatedAt, media[0].capturedAt)

    // 绑定后显示账号名、相册 GCFP 截图数与已录入数
    const stat = (label) =>
        account
            .locator('.account-stats > div')
            .filter({ hasText: label })
            .locator('dd')
    await account.getByText('测试玩家', { exact: true }).waitFor()
    await account.getByText('已绑定', { exact: true }).waitFor()
    await stat('相册中的 GCFP 截图').getByText('2', { exact: true }).waitFor()
    await stat('已录入的相册成绩').getByText('1', { exact: true }).waitFor()

    // 手动更新后 10 秒内不能再次更新
    const update = account.getByRole('button', {
        name: '更新成绩',
        exact: true,
    })
    await update.waitFor({ timeout: 15000 })
    await update.click()
    await page
        .getByText('Nintendo 相册中没有新的 GCFP 截图。', { exact: true })
        .waitFor()
    const cooling = account.getByRole('button', { name: /秒后可更新$/ })
    await cooling.waitFor()
    assert.equal(await cooling.isDisabled(), true)
    const cooldownStarted = Date.now()
    await update.waitFor({ timeout: 15000 })
    assert.ok(Date.now() - cooldownStarted > 5000)

    // 3 分钟内重新打开网页不自动更新
    const beforeReload = mediaRequests()
    const bindingChecked = page.waitForRequest(
        (request) =>
            request.url().endsWith('/api/nintendo/binding') &&
            request.method() === 'GET',
    )
    await page.reload()
    await bindingChecked
    await account.getByText('测试玩家', { exact: true }).waitFor()
    await page.waitForTimeout(1500)
    assert.equal(mediaRequests(), beforeReload)
    // 刷新后仍可在账号中查看最近一次识别结果和截图
    await account.locator('.account-last').getByRole('button', { name: '查看详情', exact: true }).click()
    await sync.getByText('最近一次识别于', { exact: false }).waitFor()
    await sync.getByText('不是支持的结算页或选曲页', { exact: false }).waitFor()
    assert.equal(await sync.locator('.import-thumb').count(), 2)
    await sync.getByRole('button', { name: '关闭', exact: true }).click()

    // 超过 3 分钟后打开网页自动更新，只显示进度提示和完成通知
    media.push(entry('result-1', 'result', '2026-09-23T10:00:00Z'))
    await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        await database.albumState.update('album', {
            lastCheckedAt: Date.now() - 4 * 60000,
            nextAllowedAt: 0,
        })
        location.hash = '#home'
    })
    await page.reload()
    await page.locator('.album-toast').waitFor({ timeout: 60000 })
    await page
        .getByText('已处理 1 张截图，新增历史 1 条，更新最佳成绩 1 条。', {
            exact: true,
        })
        .waitFor({ timeout: 180000 })
    assert.equal(await page.locator('dialog[open]').count(), 0)
    const second = await state()
    assert.equal(second.history.length, 2)
    assert.ok(
        second.history.some(
            (row) => row.chartId === '5-basic-hard' && row.score === 1010973,
        ),
    )

    // 清空成绩后，已处理过的截图不会重新录入
    await page.evaluate(() => {
        location.hash = '#settings'
    })
    await page.getByRole('button', { name: '清空数据', exact: true }).click()
    await page
        .getByRole('button', { name: '确认清空全部成绩', exact: true })
        .click()
    await page
        .getByRole('button', { name: '确认清空全部成绩', exact: true })
        .waitFor({ state: 'hidden' })
    await update.waitFor({ timeout: 15000 })
    await update.click()
    await page
        .getByText('Nintendo 相册中没有新的 GCFP 截图。', { exact: true })
        .waitFor()
    assert.equal((await state()).history.length, 0)

    // 下载失败的截图在设置页显示原因，可手动重试后录入
    media.push(entry('retry-1', 'retry', '2026-09-24T10:00:00Z'))
    await update.waitFor({ timeout: 15000 })
    await update.click()
    await toast.click({ timeout: 60000 })
    await sync
        .getByText('截图下载失败，将在下次更新时重试', { exact: false })
        .waitFor({ timeout: 60000 })
    await sync.getByRole('button', { name: '关闭', exact: true }).click()
    const failures = account.locator('.account-failures')
    await failures.getByText('1 张截图未能录入', { exact: true }).click()
    await failures
        .getByText('截图下载失败，将在下次更新时重试', { exact: false })
        .waitFor()
    brokenDownload = false
    const retry = failures.getByRole('button', { name: '重试', exact: true })
    await page.waitForFunction(
        () =>
            !document
                .querySelector('.account-failures button')
                ?.hasAttribute('disabled'),
        undefined,
        { timeout: 15000 },
    )
    await retry.click()
    await page
        .getByText('已处理 1 张截图，新增历史 1 条，更新最佳成绩 1 条。', {
            exact: true,
        })
        .waitFor({ timeout: 180000 })
    const third = await state()
    assert.equal(third.history.length, 1)
    assert.equal(third.history[0].chartId, '9-basic-hard')
    await failures.waitFor({ state: 'hidden' })

    await page.setViewportSize({ width: 390, height: 844 })
    await mkdir('.preview', { recursive: true })
    await page.screenshot({ path: '.preview/album-mobile.png', fullPage: true })
    assert.ok(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    )

    // 解除绑定保留已录入成绩
    await account.getByRole('button', { name: '解除绑定', exact: true }).click()
    await page.getByRole('button', { name: '确认解除', exact: true }).click()
    await account
        .getByRole('button', { name: '绑定 Nintendo 账号', exact: true })
        .waitFor()
    assert.equal((await state()).history.length, 1)
    await account
        .getByRole('button', { name: '绑定 Nintendo 账号', exact: true })
        .click()
    await bind.getByRole('heading', { name: '非官方接入' }).waitFor()
    await page.screenshot({ path: '.preview/album-bind-mobile.png' })
    assert.ok(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    )
    assert.deepEqual(errors, [])
    console.log(
        'Album browser acceptance passed: risk confirmation, binding guide, automatic import with progress notice and dialog, last result review, account details, cooldowns, auto update on visit, cleared data isolation, retry and unbinding',
    )
} finally {
    await browser.close()
}
