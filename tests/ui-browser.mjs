import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.OCR_URL || 'http://127.0.0.1:5173')
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
    assert.equal((await records())[0].updatedAt, before.updatedAt)
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
    await page.getByRole('textbox', { name: '搜索成绩' }).fill('Idol')
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
    await page.getByRole('textbox', { name: '搜索成绩' }).fill('Idol')
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
    for (const [ui, expected] of [['English', 'en'], ['繁體中文', 'ja'], ['English', 'en'], ['日本語', 'ja'], ['English', 'en'], ['简体中文', 'ja']]) {
        await page.locator('.ui-settings-options').getByRole('button', { name: ui, exact: true }).click()
        await page.waitForFunction(async language => (await import('/src/composables/useSettings.ts')).songLanguage.value === language, expected)
    }

    // 断点与折叠标记的不同组合都必须隐藏手机数量并保持居中
    await go('home')
    for (const width of [390, 680, 681]) {
        await page.setViewportSize({ width, height: 844 })
        if (width <= 680) {
            const layout = await page.locator('.sidebar .nav-item[href="#scores"]').evaluate(item => {
                const icon = item.querySelector('svg').getBoundingClientRect()
                const label = item.querySelector('.sidebar-copy').getBoundingClientRect()
                const box = item.getBoundingClientRect()
                return { badge: getComputedStyle(item.querySelector('.nav-badge')).display, offset: Math.abs((icon.top + label.bottom) / 2 - (box.top + box.bottom) / 2) }
            })
            assert.equal(layout.badge, 'none')
            assert.ok(layout.offset <= 1, `按钮内容未居中：${layout.offset}px`)
        } else {
            assert.equal(await page.locator('.sidebar .nav-badge').isVisible(), true)
        }
    }
    await page.setViewportSize({ width: 800, height: 844 })
    await page.getByRole('button', { name: '展开侧边栏', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.locator('.sidebar .nav-badge').isVisible(), false)
    await mkdir('.preview', { recursive: true })
    await page.screenshot({ path: '.preview/refactor-mobile.png', fullPage: true })

    await go('scores')
    await page.getByRole('button', { name: '删除成绩', exact: true }).first().click()
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    await saved()
    assert.equal((await records()).length, 35)
    await go('settings')
    await page.getByRole('button', { name: '清空数据', exact: true }).click()
    await dialog.getByRole('button', { name: '确认清空全部成绩', exact: true }).click()
    await saved()
    await go('home')
    assert.equal(await page.locator('.stats-grid').count(), 0)
    assert.equal((await records()).length, 0)
    assert.deepEqual(errors, [])
    console.log('UI regression passed: CRUD, timestamps, filters, B30, language, empty state and responsive navigation')
} finally {
    await browser.close()
}
