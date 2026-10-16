import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { utils, write } from 'xlsx'

const origin = process.env.OCR_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Hong_Kong', viewport: { width: 1280, height: 960 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00'))
    // 在同源空白页面准备真实 schema 5 数据，再通过应用打开完成升级
    await page.route(`${origin}/`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>旧数据库准备</body></html>' }))
    await page.goto(origin)
    await page.evaluate(async () => {
        const { default: Dexie } = await import('/node_modules/dexie/dist/dexie.mjs')
        const { default: versions } = await import('/src/data/metadata.json')
        const legacy = new Dexie('groove-archive-fp-history')
        legacy.version(5).stores({
            scores: '++id,&[songId+chartId],songId,chartId,score,rating,updatedAt',
            metadata: '&key',
            scoreHistory: '++id,songId,chartId,source,importedAt,playedAt,[chartId+importedAt],[songId+playedAt]',
            ratingSnapshots: '++id,playedAt',
            albumItems: '[accountId+mediaId],accountId,[accountId+contentHash],stage,[accountId+datasetEpoch+stage]',
            albumState: '&key', chartProtections: '&chartId', recognitionRuns: '&key',
        })
        const time = Date.parse('2026-10-19T12:00:00+08:00')
        await legacy.table('scoreHistory').add({ id: 1, songId: '1', chartId: '1-basic-hard', score: 1000000, rating: 8, source: 'excel', fc: false, ap: false, playedAt: time, importedAt: time, updatedAt: time, batchId: 'legacy' })
        await legacy.table('scores').add({ id: 1, historyId: 1, songId: '1', chartId: '1-basic-hard', score: 1000000, rating: 8, source: 'excel', fc: false, ap: false, updatedAt: time })
        await legacy.table('metadata').put({ key: 'calculation', ...versions })
        await legacy.table('ratingSnapshots').bulkAdd([
            { id: 1, playedAt: Date.parse('2026-10-18T10:00:00+08:00'), basic: .20, advanced: 0 },
            { id: 2, playedAt: Date.parse('2026-10-18T12:00:00+08:00'), basic: .23, advanced: 0 },
            { id: 3, playedAt: Date.parse('2026-10-18T12:00:00+08:00'), basic: .24, advanced: 0 },
            { id: 4, playedAt: time, basic: .26, advanced: 0 },
        ])
        legacy.close()
    })
    await page.unroute(`${origin}/`)
    await page.reload()
    const trend = page.locator('.rating-trend')
    await trend.locator('.trend-value').getByText(/0.26 RT/).waitFor()
    const state = () => page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        return { history: await scoreRepository.history(), best: await scoreRepository.list(), snapshots: await scoreRepository.snapshots() }
    })
    const migrated = (await state()).snapshots
    assert.deepEqual(migrated.map(row => [row.id, row.day, row.basic]), [[3, '2026-10-18', .24], [4, '2026-10-19', .26]])
    await trend.getByRole('img').click({ position: { x: 1, y: 1 } })
    assert.match(await trend.locator('.trend-value').textContent(), /2026\/10\/18.*0.24 RT/)
    await page.reload()
    await trend.locator('.trend-value').waitFor()
    assert.deepEqual((await state()).snapshots, migrated)

    async function upload(chartId, score, target = page, expectFailure = false) {
        await target.evaluate(() => { location.hash = '#home' })
        await target.getByRole('heading', { name: '录入新成绩', exact: true }).waitFor()
        const book = utils.book_new()
        utils.book_append_sheet(book, utils.aoa_to_sheet([['Chart ID', 'Score'], [chartId, score]]), 'BASIC')
        await target.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles({ name: 'daily.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(write(book, { type: 'array', bookType: 'xlsx' })) })
        const dialog = target.getByRole('dialog', { name: '导入 Excel 成绩', exact: true })
        await dialog.locator('.excel-summary').waitFor()
        await dialog.getByRole('button', { name: '确认导入', exact: true }).click()
        if (expectFailure) {
            await dialog.getByRole('alert').getByText(/整批未写入/).waitFor()
            await dialog.getByRole('button', { name: '取消', exact: true }).click()
        }
        await dialog.waitFor({ state: 'hidden' })
    }
    async function edit(score, chain) {
        await page.evaluate(() => { location.hash = '#scores' })
        await page.getByRole('heading', { name: '成绩一览', exact: true }).waitFor()
        await page.locator('tbody tr').filter({ hasText: 'HARD' }).getByRole('button', { name: '编辑成绩' }).click()
        const editor = page.locator('dialog[open]')
        await editor.getByLabel('Score', { exact: true }).fill(String(score))
        if (chain !== undefined) {
            await editor.getByLabel('Max Chain（可选）', { exact: true }).fill(String(chain))
            await editor.getByRole('button', { name: 'FC', exact: true }).click()
        }
        const lower = editor.getByRole('checkbox')
        if (await lower.count()) await lower.check()
        await editor.getByRole('button', { name: '保存成绩', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
    }
    // 未影响总 Rating 的低分、重复和完成信息不会建立或更新当天快照
    await upload('1-basic-hard', 900000)
    assert.deepEqual((await state()).snapshots, migrated)
    // 快照写入失败发生在成绩更新之后，真实导入仍须整批回滚
    const beforeFailure = await state()
    await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        window.failDaily = () => { throw new Error('模拟每日快照写入失败') }
        database.ratingSnapshots.hook('creating', window.failDaily)
    })
    await upload('1-basic-hard', 1040000, page, true)
    assert.deepEqual(await state(), beforeFailure)
    await page.evaluate(async () => { (await import('/src/db/database.ts')).database.ratingSnapshots.hook('creating').unsubscribe(window.failDaily) })
    await upload('1-basic-hard', 1040000)
    let snapshots = (await state()).snapshots
    assert.equal(snapshots.length, 3)
    assert.equal(snapshots.at(-1).day, '2026-10-20')
    const todayId = snapshots.at(-1).id
    await upload('1-basic-hard', 1045000)
    snapshots = (await state()).snapshots
    assert.equal(snapshots.length, 3)
    assert.equal(snapshots.at(-1).id, todayId)
    assert.equal(snapshots.at(-1).basic, .35)
    await edit(1000000)
    await edit(950000)
    snapshots = (await state()).snapshots
    assert.equal(snapshots.length, 3)
    assert.equal(snapshots.at(-1).basic, .26)
    await page.clock.setFixedTime(new Date('2026-10-20T13:00:00+08:00'))
    await edit(1000000, 20)
    assert.deepEqual((await state()).snapshots, snapshots)

    // 跨天后不补写无变化日期，新变化只更新今天，旧日期固定
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00+08:00'))
    await page.reload()
    await page.getByRole('button', { name: '手动新增', exact: true }).waitFor()
    assert.deepEqual((await state()).snapshots, snapshots)
    await upload('1-basic-normal', 1000000)
    // 两个标签页同日提交不同成绩，两个结果都保留且只有一条当天快照
    const second = await context.newPage()
    second.on('pageerror', error => errors.push(error.message))
    await second.clock.setFixedTime(new Date('2026-10-21T12:00:00+08:00'))
    await second.goto(origin)
    await second.locator('.rating-trend .trend-value').waitFor()
    await Promise.all([upload('1-basic-hard', 1045000), upload('1-basic-normal', 1040000, second)])
    await second.close()
    const beforeVersion = (await state()).snapshots
    assert.equal(beforeVersion.length, 4)
    assert.equal(beforeVersion.filter(row => row.day === '2026-10-21').length, 1)
    assert.ok((await state()).best.some(row => row.chartId === '1-basic-hard' && row.score === 1045000))
    assert.ok((await state()).best.some(row => row.chartId === '1-basic-normal' && row.score === 1040000))
    assert.equal(beforeVersion.at(-1).day, '2026-10-21')
    assert.deepEqual(beforeVersion.slice(0, 3), snapshots)
    // 用旧计算版本准备持久化数据，打开应用后恢复当前 Rating 并保留旧快照
    await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        await database.transaction('rw', database.scores, database.scoreHistory, database.metadata, async () => {
            await database.scores.toCollection().modify({ rating: 0 })
            await database.scoreHistory.toCollection().modify({ rating: 0 })
            await database.metadata.update('calculation', { ratingRuleVersion: 'fixture-old' })
        })
    })
    await page.reload()
    await trend.locator('.trend-value').waitFor()
    assert.deepEqual((await state()).snapshots, beforeVersion)
    assert.ok((await state()).history.every(row => row.rating > 0))

    const details = page.getByRole('dialog', { name: '歌曲信息', exact: true })
    await page.locator('.history-table tbody tr').first().getByRole('button').first().click()
    let remaining = (await state()).history.length
    while (remaining) {
        await details.locator('tbody tr').first().getByRole('button', { name: '删除历史成绩' }).click()
        await page.getByRole('button', { name: '确认删除', exact: true }).click()
        await page.getByRole('button', { name: '确认删除', exact: true }).waitFor({ state: 'hidden' })
        remaining--
        await page.waitForFunction(expected => document.querySelectorAll('.song-dialog tbody tr').length === expected, remaining)
    }
    await details.getByRole('button', { name: '关闭歌曲信息' }).click()
    await trend.locator('.trend-value').getByText(/0.00 RT/).waitFor()
    const deleted = await state()
    assert.deepEqual(deleted.best, [])
    assert.equal(deleted.snapshots.length, 4)
    assert.deepEqual(deleted.snapshots.slice(0, 3), snapshots)

    // 使用真实浏览器持久化状态换时区，日期标签不随 recordedAt 重新分组
    const west = await browser.newContext({ locale: 'zh-CN', timezoneId: 'America/Los_Angeles', storageState: await context.storageState({ indexedDB: true }) })
    const westPage = await west.newPage()
    westPage.on('pageerror', error => errors.push(error.message))
    await westPage.clock.setFixedTime(new Date('2026-10-21T23:00:00+08:00'))
    await westPage.goto(origin)
    const westTrend = westPage.locator('.rating-trend')
    await westTrend.getByRole('img').waitFor()
    await westTrend.getByRole('img').click({ position: { x: 1, y: 1 } })
    assert.match(await westTrend.locator('.trend-value').textContent(), /2026\/10\/18.*0.24 RT/)
    await west.close()

    await page.evaluate(() => { location.hash = '#settings' })
    await page.getByRole('button', { name: '清空数据', exact: true }).click()
    await page.getByRole('button', { name: '确认清空全部成绩', exact: true }).click()
    await page.getByRole('button', { name: '确认清空全部成绩', exact: true }).waitFor({ state: 'hidden' })
    await page.reload()
    assert.deepEqual(await state(), { history: [], best: [], snapshots: [] })
    assert.deepEqual(errors, [])
    console.log('Daily Rating acceptance passed: real schema 5 migration, daily updates/return, frozen past days, version recalculation, deletion to zero, timezone persistence and full clear')
} finally { await browser.close() }
