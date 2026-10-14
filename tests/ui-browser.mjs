import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const url = process.env.OCR_URL || 'http://127.0.0.1:5173'
    const songPrefixes = { 'zh-CN': '曲目信息语言：', 'zh-TW': '曲目資訊語言：', ja: '楽曲情報の言語：', en: 'Song info language: ' }
    const songToggle = (target, ui, song) => target.getByRole('button', { name: new RegExp(`^${songPrefixes[ui]}${song === 'en' ? 'English' : '日本語'}`) })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url)
    const headings = { home: '录入新成绩', scores: '成绩一览', b30: '我的 B30', settings: '偏好设置' }
    async function go(name) {
        await page.evaluate(value => { location.hash = `#${value}` }, name)
        await page.getByRole('heading', { name: headings[name], exact: true }).waitFor()
    }
    async function records() {
        return page.evaluate(async () => (await import('/src/db/scoreRepository.ts')).scoreRepository.list())
    }
    async function saved() {
        await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    }
    await go('home')
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
    assert.equal(await page.locator('.stats-grid').count(), 0)

    // 通过真实表单验证新增、锁谱、降分确认及错误后保留输入
    await go('scores')
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await saved()
    assert.equal((await records()).length, 1)
    await page.reload()
    await page.getByRole('button', { name: '编辑成绩' }).first().click()
    assert.equal(await dialog.getByRole('button', { name: 'BASIC', exact: true }).isDisabled(), true)
    const before = (await records())[0]
    await dialog.getByLabel('Max Chain（可选）', { exact: true }).fill('190')
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await saved()
    const afterChainEdit = (await records())[0]
    assert.equal(afterChainEdit.maxChain, 190)
    assert.equal(afterChainEdit.updatedAt, before.updatedAt)
    await page.getByRole('button', { name: '编辑成绩' }).first().click()
    await dialog.getByLabel('Score', { exact: true }).fill('1000000')
    assert.equal(await dialog.getByRole('button', { name: '保存成绩', exact: true }).isDisabled(), true)
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await saved()
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await dialog.getByRole('alert').waitFor()
    assert.match(await dialog.getByRole('alert').textContent(), /已有成绩/)
    assert.equal(await dialog.getByLabel('Score', { exact: true }).inputValue(), '1040000')
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()

    // 用真实仓储准备多页成绩，覆盖榜单与筛选的共享状态
    await page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        const { songService } = await import('/src/core/song/songService.ts')
        const charts = songService.songs.flatMap(song => song.charts.filter(chart => chart.mode === 'basic').map(chart => ({ song, chart }))).slice(0, 35)
        for (const { song, chart } of charts) await scoreRepository.addManual(song.id, chart.id, 1000000)
    })
    await page.locator('.table-pagination').waitFor()
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    assert.match(await page.locator('.table-pagination').textContent(), /第 2/)
    // 点击表头排序后回到第一页，再从第二页搜索验收分页重置
    await page.getByRole('button', { name: /^Score：/ }).click()
    assert.match(await page.locator('.table-pagination').textContent(), /第 1/)
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await page.getByRole('textbox', { name: '搜索成绩' }).fill('Idol')
    assert.equal(await page.locator('.table-pagination').count(), 0)
    await page.getByLabel('筛选模式').selectOption('BASIC')
    await page.getByLabel('筛选难度').selectOption('NORMAL')
    const category = await page.evaluate(async () => (await import('/src/core/song/songService.ts')).songService.getSong('1').genre)
    await page.getByLabel('筛选歌曲分类').selectOption(category)
    await go('home')
    assert.equal(await page.locator('.stats-grid article').count(), 2)
    await page.locator('.rating-mode-toggle').click()
    await go('b30')
    assert.equal(await page.locator('.mode-rating-card.advanced').getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '查看 BASIC Best 30', exact: true }).click()
    const originalRanks = await page.locator('tbody td.position').allTextContents()
    assert.equal(originalRanks.length, 30)
    const values = await page.locator('.mode-rating-card .rating-values').allTextContents()
    await page.getByRole('button', { name: /^Score：/ }).click()
    assert.deepEqual(await page.locator('tbody td.position').allTextContents(), originalRanks)
    await page.getByRole('button', { name: /^Score：/ }).click()
    assert.deepEqual(await page.locator('tbody td.position').allTextContents(), originalRanks)
    // 切换榜单模式恢复默认排名排序，搜索保留入选谱面的原始排名
    await page.getByRole('button', { name: '查看 ADVANCED Best 30', exact: true }).click()
    await page.getByRole('button', { name: /^Rating：/ }).click()
    await page.getByRole('button', { name: '查看 BASIC Best 30', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: /^排名：/ }).getAttribute('aria-label'), '排名：当前升序，点击降序')
    assert.deepEqual(await page.locator('tbody td.position').allTextContents(), originalRanks)
    const originalRows = await page.locator('tbody tr').allTextContents()
    await page.getByRole('textbox', { name: '搜索成绩' }).fill('Idol')
    const filteredRows = await page.locator('tbody tr').allTextContents()
    assert.ok(filteredRows.length > 0 && filteredRows.length < originalRows.length)
    assert.ok(filteredRows.every(row => originalRows.includes(row)))
    assert.deepEqual(await page.locator('.mode-rating-card .rating-values').allTextContents(), values)
    await go('scores')
    assert.equal(await page.getByRole('textbox', { name: '搜索成绩' }).inputValue(), 'Idol')
    assert.equal(await page.getByLabel('筛选模式').inputValue(), 'BASIC')
    assert.equal(await page.getByLabel('筛选难度').inputValue(), 'NORMAL')
    assert.equal(await page.getByLabel('筛选歌曲分类').inputValue(), category)
    await go('b30')
    assert.equal(await page.getByRole('textbox', { name: '搜索成绩' }).inputValue(), 'Idol')
    assert.equal(await page.getByRole('button', { name: /^排名：/ }).getAttribute('aria-label'), '排名：当前升序，点击降序')

    await go('settings')
    for (const [label, ui, song] of [['English', 'en', 'en'], ['繁體中文', 'zh-TW', 'ja'], ['English', 'en', 'en'], ['日本語', 'ja', 'ja'], ['English', 'en', 'en'], ['简体中文', 'zh-CN', 'ja']]) {
        await page.locator('.ui-settings-options').getByRole('button', { name: label, exact: true }).click()
        await songToggle(page, ui, song).waitFor()
        assert.equal(await page.evaluate(() => document.documentElement.lang), ui)
    }

    // 手机端仍能完成删除与清空操作，页面不产生横向溢出
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await mkdir('.preview', { recursive: true })
    await page.screenshot({ path: '.preview/refactor-mobile.png', fullPage: true })

    await go('scores')
    assert.equal(await page.getByRole('button', { name: '删除成绩', exact: true }).count(), 0)
    await page.getByRole('button', { name: '歌曲信息', exact: true }).first().click()
    await page.getByRole('button', { name: '删除历史成绩', exact: true }).first().click()
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await page.getByRole('button', { name: '确认删除', exact: true }).waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '关闭歌曲信息' }).click()
    await saved()
    assert.equal((await records()).length, 35)
    await go('settings')
    await page.getByRole('button', { name: '清空数据', exact: true }).click()
    await dialog.getByRole('button', { name: '确认清空全部成绩', exact: true }).click()
    await saved()
    await go('home')
    assert.equal(await page.locator('.stats-grid').count(), 0)
    assert.equal((await records()).length, 0)

    // 首次访问按浏览器语言匹配界面，不支持的语言回退简体中文
    const settingsHeadings = { 'zh-CN': '偏好设置', 'zh-TW': '偏好設定', ja: '設定', en: 'Settings' }
    for (const [locale, ui, song] of [['ja-JP', 'ja', 'ja'], ['zh-HK', 'zh-TW', 'ja'], ['en-US', 'en', 'en'], ['fr-FR', 'zh-CN', 'ja']]) {
        const context = await browser.newContext({ locale })
        const fresh = await context.newPage()
        fresh.on('pageerror', error => errors.push(error.message))
        await fresh.goto(`${url}#settings`)
        await fresh.getByRole('heading', { name: settingsHeadings[ui], exact: true }).waitFor()
        await songToggle(fresh, ui, song).waitFor()
        assert.equal(await fresh.evaluate(() => document.documentElement.lang), ui)
        if (locale !== 'en-US') {
            await context.close()
            continue
        }
        // 已保存的界面语言优先于浏览器语言，单独切换的曲目信息语言在刷新后保留
        await fresh.locator('.ui-settings-options').getByRole('button', { name: '日本語', exact: true }).click()
        await songToggle(fresh, 'ja', 'ja').click()
        await songToggle(fresh, 'ja', 'en').waitFor()
        await fresh.reload()
        await fresh.getByRole('heading', { name: settingsHeadings.ja, exact: true }).waitFor()
        await songToggle(fresh, 'ja', 'en').waitFor()
        assert.equal(await fresh.title(), 'Groove Archive · FP スコア管理')
        await context.close()
    }
    assert.deepEqual(errors, [])
    console.log('UI regression passed: CRUD, timestamps, filters, B30, language, empty state and responsive navigation')
} finally {
    await browser.close()
}
