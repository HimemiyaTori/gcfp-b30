import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    // 纯前端产物即使有残留绑定标记，也不能加载相册或请求 API
    const pure = await browser.newContext({ locale: 'zh-CN' })
    await pure.addInitScript(() => localStorage.setItem('groove-nintendo-bound', '1'))
    const purePage = await pure.newPage()
    const api = []
    purePage.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url()) })
    await purePage.goto((process.env.PURE_URL || 'http://127.0.0.1:5176') + '/#settings')
    await purePage.getByRole('heading', { name: '本地数据', exact: true }).waitFor()
    assert.equal(await purePage.getByRole('button', { name: '打开相册设置', exact: true }).count(), 0)
    await purePage.reload()
    await purePage.getByRole('heading', { name: '本地数据', exact: true }).waitFor()
    assert.deepEqual(api, [])
    await pure.close()
    // 用旧版真实 IndexedDB 文件结构准备已有用户数据，再通过页面完成升级和展示
    const context = await browser.newContext({ locale: 'zh-CN' })
    const page = await context.newPage()
    const origin = process.env.ALBUM_URL || 'http://127.0.0.1:5175'
    await page.route('**/__migration_fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body>fixture</body></html>' }))
    await page.goto(origin + '/__migration_fixture')
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('groove-archive-fp-history', 10)
            request.onupgradeneeded = () => {
                const db = request.result
                const scores = db.createObjectStore('scores', { keyPath: 'id', autoIncrement: true })
                scores.createIndex('[songId+chartId]', ['songId', 'chartId'], { unique: true })
                for (const key of ['songId', 'chartId', 'score', 'rating', 'updatedAt']) scores.createIndex(key, key)
                db.createObjectStore('metadata', { keyPath: 'key' })
                const history = db.createObjectStore('scoreHistory', { keyPath: 'id', autoIncrement: true })
                for (const key of ['songId', 'chartId', 'importedAt']) history.createIndex(key, key)
                history.createIndex('[chartId+importedAt]', ['chartId', 'importedAt'])
                const snapshots = db.createObjectStore('ratingSnapshots', { keyPath: 'id', autoIncrement: true })
                snapshots.createIndex('importedAt', 'importedAt')
                history.add({ songId: '1', chartId: '1-basic-hard', score: 1000000, rating: 0, source: 'manual', fc: false, ap: false, importedAt: 1780000000000, updatedAt: 1780000000000, batchId: 'legacy' })
            }
            request.onerror = () => reject(request.error)
            request.onsuccess = () => { request.result.close(); resolve() }
        })
    })
    await page.goto(origin)
    await page.locator('.history-table tbody tr').first().getByText('1,000,000', { exact: false }).waitFor()
    await page.locator('.rating-trend .trend-value').waitFor()
    await page.reload()
    await page.locator('.history-table tbody tr').first().getByText('1,000,000', { exact: false }).waitFor()
    const persisted = await page.evaluate(async () => {
        const { database } = await import('/src/db/database.ts')
        return (await database.scoreHistory.toArray())[0]
    })
    assert.equal(persisted.playedAt, persisted.importedAt)
    assert.equal(persisted.source, 'manual')
    console.log('Deployment mode and legacy database migration acceptance passed')
} finally { await browser.close() }
