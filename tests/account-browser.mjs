import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { createAccountServer } from './account-server.mjs'

const app = await createAccountServer({ assets: true })
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
const errors = []
const avatar = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#5ab8d8' } }).png().toBuffer()
async function context() {
    const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 960 } })
    await ctx.route('https://avatars.example.test/**', route => route.fulfill({ body: avatar, contentType: 'image/png' }))
    const page = await ctx.newPage()
    page.on('pageerror', error => errors.push(error.message))
    return { ctx, page }
}
async function signIn(page, email) {
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '邮箱登录 / 注册' })
    await dialog.getByLabel('邮箱', { exact: true }).fill(email)
    await dialog.getByRole('button', { name: '发送验证码', exact: true }).click()
    await dialog.getByRole('status').waitFor()
    await dialog.getByLabel('验证码', { exact: true }).fill(app.emails.get(email))
    await dialog.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByLabel('昵称（可选）', { exact: true }).waitFor()
}
async function addScore(page, score) {
    await page.goto(app.origin + '/#scores')
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.getByLabel('Score', { exact: true }).fill(String(score))
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
}
async function history(page, name) {
    return page.evaluate(databaseName => new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
            const db = request.result
            const rows = db.transaction('scoreHistory').objectStore('scoreHistory').getAll()
            rows.onsuccess = () => { resolve(rows.result); db.close() }
            rows.onerror = () => { reject(rows.error); db.close() }
        }
    }), name)
}
try {
    const { ctx, page } = await context()
    const apiRequests = []
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()) })
    await page.goto(app.origin)
    await page.getByRole('heading', { name: '录入新成绩', exact: true }).waitFor()
    assert.deepEqual(apiRequests, [])
    await addScore(page, 1000000)
    await page.goto(app.origin + '/#settings')
    await page.getByRole('heading', { name: '站内账号', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '绑定 Nintendo 账号', exact: true }).count(), 0)
    await signIn(page, 'browser@example.test')
    const user = await page.evaluate(async () => (await (await fetch('/api/account', { headers: { 'X-App-Protocol-Version': '1' } })).json()).user)
    assert.equal(await page.getByLabel('昵称（可选）', { exact: true }).inputValue(), '')
    assert.equal((await history(page, `groove-archive-fp-account-${user.id}`)).length, 0)
    await page.getByLabel('昵称（可选）', { exact: true }).fill('跨设备玩家')
    await page.getByRole('button', { name: '保存昵称', exact: true }).click()
    await page.locator('.profile-name').filter({ hasText: '跨设备玩家' }).waitFor()
    await page.getByRole('button', { name: '绑定 Nintendo 账号', exact: true }).click()
    const bind = page.locator('.bind-dialog')
    await bind.getByRole('checkbox').check()
    await bind.getByRole('button', { name: '同意并继续', exact: true }).click()
    const link = bind.getByRole('link', { name: '前往登录' })
    await link.waitFor()
    const state = new URL(await link.getAttribute('href')).searchParams.get('state')
    await bind.getByLabel('账号链接', { exact: true }).fill(`npf71b963c1b7b6d119://auth#state=${state}&session_token_code=browser-code`)
    await bind.getByRole('button', { name: '完成绑定', exact: true }).click()
    await page.getByRole('button', { name: '解除绑定', exact: true }).waitFor({ timeout: 30000 })
    await page.waitForFunction(() => document.querySelector('.site-avatar img')?.getAttribute('src')?.includes('avatars.example.test'))
    await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'my-avatar.png', mimeType: 'image/png', buffer: avatar })
    await page.waitForFunction(() => document.querySelector('.site-avatar img')?.getAttribute('src')?.startsWith('/api/account/avatar'))
    const uploaded = await app.db.prepare('SELECT data FROM account_avatars WHERE user_id = ?').bind(user.id).first()
    const metadata = await sharp(Buffer.from(uploaded.data)).metadata()
    assert.equal(metadata.width, 256)
    assert.equal(metadata.height, 256)
    assert.ok(Buffer.from(uploaded.data).length <= 100 * 1024)
    await addScore(page, 900000)
    assert.equal((await history(page, `groove-archive-fp-account-${user.id}`))[0].score, 900000)
    const second = await context()
    await app.db.prepare('DELETE FROM account_limits').run()
    await second.page.goto(app.origin + '/#settings')
    await signIn(second.page, 'browser@example.test')
    await second.page.locator('.profile-name').filter({ hasText: '跨设备玩家' }).waitFor()
    await second.page.getByRole('button', { name: '解除绑定', exact: true }).waitFor()
    await second.page.waitForFunction(() => document.querySelector('.site-avatar img')?.getAttribute('src')?.startsWith('/api/account/avatar'))
    await second.page.getByRole('button', { name: /更新成绩|更新中|秒后可更新/ }).first().waitFor()
    await second.page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await second.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await mkdir('.preview', { recursive: true })
    await second.page.screenshot({ path: '.preview/account-mobile.png', fullPage: true, animations: 'disabled' })
    const sibling = await ctx.newPage()
    sibling.on('pageerror', error => errors.push(error.message))
    await sibling.goto(app.origin + '/#settings')
    await sibling.getByLabel('昵称（可选）', { exact: true }).waitFor()
    await page.goto(app.origin + '/#settings')
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('dialog', { name: '退出登录', exact: true }).getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).waitFor()
    await sibling.getByRole('button', { name: '登录 / 注册', exact: true }).waitFor()
    assert.equal((await history(page, 'groove-archive-fp-history'))[0].score, 1000000)
    assert.equal((await history(page, `groove-archive-fp-account-${user.id}`))[0].score, 900000)
    await page.screenshot({ path: '.preview/account-guest.png', fullPage: true, animations: 'disabled' })
    await app.db.prepare('UPDATE session SET expiresAt = ? WHERE userId = ?').bind(Date.now() - 1000, user.id).run()
    await second.page.reload()
    await second.page.getByRole('button', { name: '重新登录', exact: true }).waitFor()
    assert.equal(await second.page.getByLabel('昵称（可选）', { exact: true }).isDisabled(), true)
    assert.equal(await second.page.getByRole('button', { name: '解除绑定', exact: true }).count(), 0)
    await second.page.getByRole('button', { name: '退出登录', exact: true }).click()
    await second.page.getByRole('dialog', { name: '退出登录', exact: true }).getByRole('button', { name: '退出登录', exact: true }).click()
    await second.page.getByRole('button', { name: '登录 / 注册', exact: true }).waitFor()
    app.env.EMAIL_DAILY_LIMIT = '0'
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click()
    const quotaDialog = page.getByRole('dialog', { name: '邮箱登录 / 注册' })
    await quotaDialog.getByLabel('邮箱', { exact: true }).fill('budget-browser@example.test')
    await quotaDialog.getByRole('button', { name: '发送验证码', exact: true }).click()
    await quotaDialog.getByRole('alert').filter({ hasText: '本站免费邮件额度已用完' }).waitFor()
    await quotaDialog.getByRole('status').filter({ hasText: '可在' }).waitFor()
    assert.deepEqual(errors, [])
    await ctx.close(); await second.ctx.close()
    console.log('Account browser acceptance passed: guest isolation, email login, optional nickname, NS linking, compressed avatar upload, two devices, mobile layout and logout persistence')
} finally { await browser.close(); await app.close() }
