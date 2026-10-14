import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = process.env.ALBUM_URL || 'http://127.0.0.1:5175'
const avatarImage = await readFile(new URL('../public/images/gcfp-logo.png', import.meta.url))
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 960 } })
    let bound = false
    let generation = 0
    let nickname = '测试玩家'
    let avatarUrl = 'https://avatars.example.test/account.png'
    let mediaAvatarUrl = avatarUrl
    const binding = () => ({
        configured: true,
        status: bound ? 'active' : 'unbound',
        ...(bound ? { accountId: `player-${generation}`, bindingId: `binding-${generation}`, nickname, avatarUrl } : {}),
    })
    await context.route('https://avatars.example.test/**', route => route.fulfill(
        route.request().url().endsWith('/missing.png')
            ? { status: 404, body: '' }
            : { contentType: 'image/png', body: avatarImage },
    ))
    await context.route('**/api/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let data
        if (path === '/api/nintendo/binding') {
            if (request.method() === 'DELETE') bound = false
            data = binding()
        } else if (path === '/api/nintendo/auth/start') {
            data = { url: 'https://accounts.nintendo.com/test' }
        } else if (path === '/api/nintendo/auth/complete') {
            bound = true
            generation++
            data = binding()
        } else if (path === '/api/album/media') {
            avatarUrl = mediaAvatarUrl
            data = { ...binding(), media: [] }
        } else return route.fulfill({ status: 404, json: { error: 'not_found' } })
        return route.fulfill({ json: data })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/#settings`)
    const account = page.locator('.account-panel')
    const header = page.locator('.topbar .avatar')
    await account.getByRole('button', { name: '绑定 Nintendo 账号', exact: true }).waitFor()
    assert.equal(await header.textContent(), 'FP')
    const bind = async () => {
        await account.getByRole('button', { name: '绑定 Nintendo 账号', exact: true }).click()
        const dialog = page.locator('.bind-dialog')
        await dialog.getByLabel('我已阅读并了解上述风险与数据处理方式').check()
        await dialog.getByRole('button', { name: '同意并继续', exact: true }).click()
        await dialog.getByRole('link', { name: '前往登录' }).waitFor()
        await dialog.getByLabel('账号链接').fill('npftest://auth#test')
        await dialog.getByRole('button', { name: '完成绑定', exact: true }).click()
        await dialog.getByRole('heading', { name: '绑定成功' }).waitFor()
        await dialog.waitFor({ state: 'hidden' })
    }
    const expectAvatar = async src => {
        await page.waitForFunction(expected => {
            const images = [...document.querySelectorAll('.topbar .avatar img, .account-avatar img')]
            return images.length === 2 && images.every(image => image.getAttribute('src') === expected && image.complete && image.naturalWidth > 0)
        }, src)
    }
    const expectInitial = async initial => {
        await page.waitForFunction(expected => {
            const avatars = [...document.querySelectorAll('.topbar .avatar, .account-avatar')]
            return avatars.length === 2 && avatars.every(avatar => !avatar.querySelector('img') && avatar.textContent === expected)
        }, initial)
    }

    // 绑定后在账号页与页头加载真实图片资源，刷新页面后继续显示
    await bind()
    await expectAvatar(avatarUrl)
    await page.reload()
    await expectAvatar(avatarUrl)

    // 图片加载失败时显示首字母，更新成绩取得新地址后在当前页面恢复图片
    avatarUrl = 'https://avatars.example.test/missing.png'
    await page.reload()
    await expectInitial('测')
    mediaAvatarUrl = 'https://avatars.example.test/recovered.png'
    await account.getByRole('button', { name: '更新成绩', exact: true }).click({ timeout: 20000 })
    await expectAvatar(mediaAvatarUrl)
    await page.reload()
    await expectAvatar(mediaAvatarUrl)

    // 上游没有头像时保留首字母，解绑后清除头像，换绑后显示新账号头像
    avatarUrl = undefined
    mediaAvatarUrl = undefined
    await page.reload()
    await expectInitial('测')
    await account.getByRole('button', { name: '解除绑定', exact: true }).click()
    await page.getByRole('button', { name: '确认解除', exact: true }).click()
    await account.getByRole('button', { name: '绑定 Nintendo 账号', exact: true }).waitFor()
    assert.equal(await header.textContent(), 'FP')
    nickname = '另一玩家'
    avatarUrl = 'https://avatars.example.test/another.png'
    mediaAvatarUrl = avatarUrl
    await bind()
    await expectAvatar(avatarUrl)
    await account.getByText(nickname, { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('Avatar browser acceptance passed: binding, image loading, reload persistence, failure recovery, missing image, unbinding and account switching')
} finally {
    await browser.close()
}
