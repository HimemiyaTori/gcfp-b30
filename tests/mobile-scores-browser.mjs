import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const url = process.env.OCR_URL || 'http://127.0.0.1:5173'
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const cards = page.locator('.score-list-item:visible')
    const details = page.locator('.song-dialog[open]')
    async function go(name) {
        await page.evaluate(value => { location.hash = `#${value}` }, name)
        await page.waitForFunction(value => document.querySelector(`.nav-item[href="#${value}"]`)?.classList.contains('active'), name)
    }
    async function fits() {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '页面应适合手机宽度')
        for (const list of await page.locator('.score-list:visible, .filter-bar:visible, .score-sort-controls:visible').all()) {
            assert.ok(await list.evaluate(element => element.scrollWidth <= element.clientWidth + 1), '列表和控件应无需横向滚动')
        }
    }
    await page.goto(`${url}/#scores`)
    await page.getByRole('heading', { name: '成绩一览', exact: true }).waitFor()
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
    // 通过真实仓储准备多页成绩及长曲名，验收手机上的用户操作
    const longSong = await page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        const { songService } = await import('/src/core/song/songService.ts')
        const all = songService.songs.flatMap(song => song.charts.filter(chart => chart.mode === 'basic').map(chart => ({ song, chart })))
        const chosen = all.slice(0, 35)
        const used = new Set(chosen.map(({ chart }) => chart.id))
        chosen.push(all.filter(({ chart }) => !used.has(chart.id)).sort((a, b) => Math.max(b.song.title.en?.length ?? 0, b.song.title.ja.length) - Math.max(a.song.title.en?.length ?? 0, a.song.title.ja.length))[0])
        for (const [index, { song, chart }] of chosen.entries()) {
            await scoreRepository.addManual(song.id, chart.id, 980000 + index * 1000, { fc: true, maxChain: 7 })
        }
        return chosen.at(-1).song.title
    })
    await page.getByRole('navigation', { name: '成绩分页' }).waitFor()
    assert.equal(await cards.count(), 30)
    assert.equal(await page.locator('.score-table').isVisible(), false)
    assert.equal(await page.getByLabel('筛选模式', { exact: true }).isVisible(), false)
    assert.equal(await page.getByRole('textbox', { name: '搜索成绩', exact: true }).getAttribute('placeholder'), '搜索曲目')
    assert.equal(await cards.first().getByText('Rating', { exact: true }).isVisible(), true)
    await fits()
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.score-list-item').length === 6)
    await page.waitForFunction(() => {
        const top = document.querySelector('.score-sort-controls').getBoundingClientRect().top
        return top >= 76 && top < innerHeight - 65
    })
    assert.match(await page.locator('.table-pagination').textContent(), /第 2/)
    await page.getByLabel('排序', { exact: true }).selectOption('score')
    await cards.first().getByText('1,015,000', { exact: true }).waitFor()
    assert.match(await page.locator('.table-pagination').textContent(), /第 1/)
    await page.getByRole('button', { name: 'Score：当前降序，点击升序', exact: true }).click()
    await cards.first().getByText('980,000', { exact: true }).waitFor()

    // 筛选收起后仍显示条件，单独清除和全部清除都保留搜索文字
    await page.getByRole('button', { name: '筛选', exact: true }).click()
    await page.getByLabel('筛选模式', { exact: true }).selectOption('BASIC')
    await page.getByLabel('筛选难度', { exact: true }).selectOption('HARD')
    await page.getByLabel('等级下限', { exact: true }).fill('1')
    await page.getByRole('textbox', { name: '搜索成绩', exact: true }).fill('Idol')
    await page.getByRole('button', { name: '筛选 · 3', exact: true }).click()
    assert.equal(await page.getByLabel('筛选难度', { exact: true }).isVisible(), false)
    assert.equal(await cards.count(), 1)
    await page.getByRole('button', { name: '清除筛选：HARD', exact: true }).click()
    await page.getByRole('button', { name: '筛选 · 2', exact: true }).waitFor()
    await go('home')
    await go('scores')
    assert.equal(await page.getByRole('textbox', { name: '搜索成绩', exact: true }).inputValue(), 'Idol')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '搜索成绩', exact: true }).inputValue(), 'Idol')
    assert.equal(await cards.count(), 4)

    // 手机编辑后保存到浏览器，更多信息显示补录的 Max Chain
    await cards.first().getByRole('button', { name: '编辑成绩', exact: true }).click()
    const editor = page.locator('.editor-dialog[open]:not(.song-dialog)')
    await editor.getByLabel('Score', { exact: true }).fill('1040000')
    await editor.getByLabel('Max Chain（可选）', { exact: true }).fill('11')
    await editor.getByRole('button', { name: 'AP', exact: true }).click()
    await editor.getByRole('button', { name: '保存成绩', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    const edited = cards.filter({ hasText: '1,040,000' })
    await edited.getByRole('button', { name: '更多成绩信息', exact: true }).click()
    await edited.getByText('Max Chain 11', { exact: true }).waitFor()
    assert.match(await edited.locator('.score-card-artist').textContent(), /^艺术家：.+/)
    await edited.getByRole('button', { name: '查看详情', exact: true }).click()
    await details.locator('.score-list-item').first().waitFor()
    await details.getByText('Max Chain 11', { exact: true }).waitFor()
    await details.getByRole('button', { name: '关闭歌曲信息', exact: true }).click()
    await page.reload()
    await cards.first().getByText('1,040,000', { exact: true }).waitFor()
    assert.equal(await cards.first().getByText('AP', { exact: true }).isVisible(), true)

    // 全曲库的未游玩谱面可从列表直接录入
    await page.getByRole('button', { name: '谱面范围：已有成绩。点击切换为全部谱面', exact: true }).click()
    await page.getByRole('button', { name: '筛选', exact: true }).click()
    await page.getByLabel('筛选模式', { exact: true }).selectOption('ADVANCED')
    await cards.first().getByText('暂无成绩', { exact: true }).waitFor()
    await cards.first().getByRole('button', { name: '录入成绩', exact: true }).click()
    await editor.getByRole('button', { name: '保存成绩', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    await cards.first().getByText('1,040,000', { exact: true }).waitFor()

    await mkdir('.preview', { recursive: true })
    await go('b30')
    await cards.first().locator('.score-card-position').getByText('01', { exact: true }).waitFor()
    assert.equal(await cards.count(), 30)
    await page.screenshot({ path: '.preview/mobile-b30.png', animations: 'disabled', fullPage: true })
    await fits()

    // 最近记录直接显示时间，歌曲内历史省去重复曲名，并保留确认删除流程
    await go('home')
    await cards.first().locator('.score-card-time time').waitFor()
    await page.screenshot({ path: '.preview/mobile-history.png', animations: 'disabled', fullPage: true })
    await cards.first().getByRole('button').first().click()
    const historyCards = details.locator('.score-list-item:visible')
    await historyCards.first().waitFor()
    assert.equal(await details.locator('.score-card-song').count(), 0)
    assert.equal(await historyCards.first().getByRole('button', { name: '删除历史成绩', exact: true }).isVisible(), true)
    assert.equal(await details.getByRole('button', { name: '更多成绩信息', exact: true }).count(), 0)
    await details.locator('.score-sort-controls').scrollIntoViewIfNeeded()
    await page.screenshot({ path: '.preview/mobile-song-history.png', animations: 'disabled' })
    await fits()
    await historyCards.first().getByRole('button', { name: '删除历史成绩', exact: true }).click()
    await page.getByRole('button', { name: '保留成绩', exact: true }).click()
    assert.ok(await details.isVisible())
    await historyCards.first().getByRole('button', { name: '删除历史成绩', exact: true }).click()
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await details.getByText('暂无历史成绩', { exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭歌曲信息', exact: true }).click()

    await go('scores')
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await page.screenshot({ path: '.preview/mobile-scores.png', animations: 'disabled', fullPage: true })
    // 多语言和明暗主题在窄屏仍能浏览列表、展开筛选并排序
    for (const [language, heading, toggle] of [
        ['English', 'All scores', 'Filters'],
        ['日本語', 'スコア一覧', '絞り込み'],
        ['繁體中文', '成績一覽', '篩選'],
        ['简体中文', '成绩一览', '筛选'],
    ]) {
        await go('settings')
        await page.locator('.ui-settings-options').getByRole('button', { name: language, exact: true }).click()
        await go('scores')
        await page.getByRole('heading', { name: heading, exact: true }).waitFor()
        for (const width of [320, 390, 680]) {
            await page.setViewportSize({ width, height: 844 })
            await fits()
        }
        await page.setViewportSize({ width: 320, height: 844 })
        await page.getByRole('button', { name: toggle, exact: true }).click()
        await fits()
        await page.locator('.topbar-mobile-controls .sidebar-theme-control').click()
        await cards.first().getByRole('button', { expanded: false }).click()
        await fits()
        if (language === 'English') await page.screenshot({ path: '.preview/mobile-scores-english-dark.png', animations: 'disabled', fullPage: true })
    }

    // 桌面仍可通过表头排序，切回手机后保留当前排序
    await page.setViewportSize({ width: 1280, height: 900 })
    assert.ok(await page.locator('.score-table').isVisible())
    assert.equal(await page.locator('.score-list').isVisible(), false)
    await page.getByRole('button', { name: /^Score：/ }).click()
    await page.locator('tbody tr').first().getByText('1,040,000', { exact: false }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.getByLabel('排序', { exact: true }).inputValue(), 'score')
    await cards.first().getByText('1,040,000', { exact: true }).waitFor()
    await page.getByRole('textbox', { name: '搜索成绩', exact: true }).fill('no-such-song-mobile')
    await page.getByRole('heading', { name: '暂时没有成绩', exact: true }).waitFor()
    assert.equal(await page.locator('.table-pagination').count(), 0)
    await fits()
    // 电脑端历史在日语和英语界面下完整展示长曲名对应的所有列
    await page.setViewportSize({ width: 1280, height: 960 })
    for (const [language, songLanguage] of [['日本語', 'ja'], ['English', 'en']]) {
        await go('settings')
        await page.locator('.ui-settings-options').getByRole('button', { name: language, exact: true }).click()
        await go('home')
        const recent = page.locator('.history-table')
        const row = recent.locator('tbody tr').filter({ hasText: longSong[songLanguage] || longSong.ja }).first()
        await row.waitFor()
        async function historyFits(target) {
            const { available, content } = await target.locator('.table-scroll').evaluate(element => ({ available: element.clientWidth, content: element.scrollWidth }))
            assert.ok(content <= available + 1, `${language}历史的时间和操作列应无需横向滚动：${content}/${available}`)
        }
        await historyFits(recent)
        await row.getByRole('button').first().click()
        const songHistory = details.locator('.history-table')
        await songHistory.locator('tbody tr').first().waitFor()
        await historyFits(songHistory)
        assert.equal(await songHistory.locator('thead .song-column').isVisible(), true)
        await songHistory.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `.preview/desktop-history-${songLanguage}.png`, animations: 'disabled' })
        // 歌曲弹窗变窄时隐藏重复曲目信息，保留完整的成绩列和删除入口
        for (const width of [1000, 900, 800, 700, 681]) {
            await page.setViewportSize({ width, height: 960 })
            await historyFits(songHistory)
            assert.equal(await songHistory.locator('thead .song-column').isVisible(), false)
            assert.equal(await songHistory.locator('tbody .song-link').first().isVisible(), false)
            if (width === 800) {
                await songHistory.scrollIntoViewIfNeeded()
                await page.screenshot({ path: `.preview/desktop-history-narrow-${songLanguage}.png`, animations: 'disabled' })
            }
        }
        await songHistory.locator('tbody tr').first().locator('td').last().getByRole('button').click()
        await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2)
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 1)
        await page.setViewportSize({ width: 1280, height: 960 })
        await historyFits(songHistory)
        assert.equal(await songHistory.locator('thead .song-column').isVisible(), true)
        await page.keyboard.press('Escape')
        await details.waitFor({ state: 'hidden' })
    }
    assert.deepEqual(errors, [])
    console.log('Score layout acceptance passed: mobile lists, sort, filters, persistence, B30, deletion, languages, themes, narrow screens and desktop history columns')
} finally {
    await browser.close()
}
