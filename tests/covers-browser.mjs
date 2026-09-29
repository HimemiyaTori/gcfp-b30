import { chromium } from 'playwright'
import ExcelJS from 'exceljs'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { songService } from '../src/core/song/songService.ts'
import { coverThumbUrl } from '../src/core/song/cover.ts'

const expected = new Set(songService.songs.map(song => coverThumbUrl(song.coverSourceUrl))).size
const output = await mkdtemp(join(tmpdir(), 'fp-covers-'))
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
try {
    const page = await browser.newPage()
    const requests = []
    const errors = []
    page.on('request', request => { if (/\/covers\/.+\.jpg/.test(request.url())) requests.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#settings`)
    async function download(name) {
        const event = page.waitForEvent('download')
        await page.getByRole('button', { name: '下载导入模板', exact: true }).click()
        const file = await event
        const path = join(output, name)
        await file.saveAs(path)
        const book = new ExcelJS.Workbook()
        await book.xlsx.load(await readFile(path))
        return book
    }
    const blocked = coverThumbUrl(songService.songs[0].coverSourceUrl)
    const route = `**${blocked}`
    await page.route(route, handler => handler.fulfill({ status: 404, body: 'missing' }))
    const partial = await download('missing-cover.xlsx')
    assert.equal(partial.media.length, expected - 1)
    assert.equal(partial.getWorksheet('BASIC').getCell('A6').value, '♪')
    assert.equal(partial.getWorksheet('ADVANCED').getCell('A6').value, '♪')
    assert.equal(new Set(requests).size, expected)

    await page.unroute(route)
    requests.length = 0
    const restored = await download('template.xlsx')
    assert.equal(requests.length, 1)
    assert.equal(restored.media.length, expected)
    for (const sheet of restored.worksheets) {
        assert.equal(sheet.getImages().length, songService.songs.filter(song => song.charts.some(chart => chart.mode.toUpperCase() === sheet.name)).length)
        assert.equal(sheet.getCell('A6').value, null)
    }
    requests.length = 0
    await download('cached-template.xlsx')
    assert.equal(requests.length, 0)

    // 用本地图片模拟外站响应，验证页面的缩略图、原图和占位回退
    const originalUrl = songService.songs[0].coverSourceUrl
    await page.route(route, handler => handler.fulfill({ status: 404, body: 'missing' }))
    await page.route(originalUrl, async handler => handler.fulfill({ contentType: 'image/jpeg', body: await readFile(join('public', 'covers', basename(blocked))) }))
    await page.evaluate(() => { location.hash = '#scores' })
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    await page.waitForFunction(source => {
        const image = document.querySelector('dialog[open] .selected-song img')
        return image?.src === source && image.complete && image.naturalWidth > 0
    }, originalUrl)
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.unroute(originalUrl)
    await page.route(originalUrl, handler => handler.fulfill({ status: 404, body: 'missing' }))
    await page.reload()
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    await page.waitForFunction(() => {
        const cover = document.querySelector('dialog[open] .selected-song .song-cover')
        return cover?.textContent === '♪' && !cover.querySelector('img')
    })
    assert.deepEqual(errors, [])
    console.log(`Covers passed: ${expected} images, workbook and page fallbacks, failed request retry, shared sheets, session cache`)
    console.log('Template:', join(output, 'template.xlsx'))
} finally { await browser.close() }
