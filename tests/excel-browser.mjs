import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { utils, read } from 'xlsx'
import { createScoreWorkbook, parseScoreWorkbook, workbookBytes } from '../src/core/excel/workbook.ts'
import { songService } from '../src/core/song/songService.ts'

const song = songService.songs[0]
const records = [
    { songId: song.id, chartId: song.charts[0].id, score: 1000000, fc: false, ap: false, maxChain: 0, rating: 0, source: 'manual', createdAt: 1000, updatedAt: 2000 },
    { songId: song.id, chartId: song.charts[1].id, score: 1040000, fc: true, ap: true, maxChain: 200, rating: 0, source: 'manual', createdAt: 3000, updatedAt: 4000 },
]
const browser = await chromium.launch({ channel: process.env.OCR_BROWSER || 'msedge', headless: true })
const downloads = await mkdtemp(join(tmpdir(), 'fp-excel-'))
try {
    await mkdir('.preview', { recursive: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#settings`)
    const exportButton = page.getByRole('button', { name: '导出全部成绩', exact: true })
    const importButton = page.getByRole('button', { name: '导入 Excel', exact: true })
    await importButton.waitFor()
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
    assert.ok(await exportButton.isDisabled())
    let downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载导入模板', exact: true }).click()
    const template = await downloadEvent
    assert.equal(template.suggestedFilename(), 'FP_B30_导入模板.xlsx')
    await template.saveAs(join(downloads, 'template.xlsx'))
    const templateData = await readFile(join(downloads, 'template.xlsx'))
    assert.deepEqual(read(templateData).SheetNames, ['BASIC', 'ADVANCED'])
    assert.equal(parseScoreWorkbook(templateData.buffer.slice(templateData.byteOffset, templateData.byteOffset + templateData.byteLength)).rows.length, 0)

    const dialog = page.getByRole('dialog', { name: '导入 Excel 成绩', exact: true })
    async function upload(workbook, name = '成绩.xlsx') {
        const chooserEvent = page.waitForEvent('filechooser')
        await importButton.click()
        const chooser = await chooserEvent
        await chooser.setFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbookBytes(workbook)) })
        await dialog.waitFor()
        await page.waitForFunction(() => !document.querySelector('.excel-dialog')?.textContent.includes('正在处理'))
    }
    async function count() {
        return page.evaluate(async () => (await import('/src/db/scoreRepository.ts')).scoreRepository.list().then(rows => rows.length))
    }
    await upload(createScoreWorkbook([], 'ja', true))
    assert.match(await dialog.textContent(), /没有可导入/)
    assert.ok(await dialog.getByRole('button', { name: '确认导入' }).isDisabled())
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    const validBook = createScoreWorkbook(records)
    await upload(validBook)
    assert.match(await dialog.textContent(), /预计新增 2 条/)
    assert.equal(await count(), 0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await count(), 0)

    const invalidBook = createScoreWorkbook(records)
    invalidBook.getWorksheet('BASIC').getCell('E7').value = 1050001
    await upload(invalidBook)
    assert.match(await dialog.textContent(), /BASIC 第 7 行/)
    assert.ok(await dialog.getByRole('button', { name: '确认导入' }).isDisabled())
    assert.equal(await count(), 0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await upload(validBook)
    await page.screenshot({ path: '.preview/excel-import-desktop.png', fullPage: true })
    await dialog.getByRole('button', { name: '确认导入' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await count(), 2)
    await page.reload()
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载本地成绩'))
    assert.equal(await count(), 2)
    downloadEvent = page.waitForEvent('download')
    await exportButton.click()
    const exported = await downloadEvent
    await exported.saveAs(join(downloads, 'export.xlsx'))
    const data = await readFile(join(downloads, 'export.xlsx'))
    const exportedRows = parseScoreWorkbook(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)).rows
    assert.equal(exportedRows.length, 2)
    assert.equal(exportedRows.find(row => row.score === 1000000).fc, false)
    await upload(validBook)
    assert.match(await dialog.textContent(), /跳过 2 条/)
    await dialog.getByRole('button', { name: '确认导入' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await count(), 2)

    // 在独立浏览器上下文恢复真实下载的文件
    const restored = await browser.newPage()
    await restored.goto(`${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#settings`)
    const restoreChooser = restored.waitForEvent('filechooser')
    await restored.getByRole('button', { name: '导入 Excel', exact: true }).click()
    await (await restoreChooser).setFiles(join(downloads, 'export.xlsx'))
    await restored.getByRole('button', { name: '确认导入', exact: true }).click()
    await restored.getByRole('dialog', { name: '导入 Excel 成绩' }).waitFor({ state: 'hidden' })
    const actual = await restored.evaluate(async () => (await import('/src/db/scoreRepository.ts')).scoreRepository.list())
    assert.equal(actual.length, 2)
    assert.equal(actual.find(r => r.score === 1000000).maxChain, 0)
    assert.equal(actual.find(r => r.score === 1040000).updatedAt, 4000)
    await restored.close()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: '.preview/excel-settings-mobile.png', fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await upload(invalidBook)
    await page.screenshot({ path: '.preview/excel-error-mobile.png', fullPage: true })
    assert.ok(await page.evaluate(() => document.querySelector('.excel-dialog').getBoundingClientRect().right <= innerWidth))
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await upload(validBook, '错误格式.csv')
    assert.match(await dialog.textContent(), /请选择 .xlsx/)
    assert.equal(await count(), 2)
    assert.deepEqual(errors, [])
    console.log('Downloads:', downloads)
    console.log('Excel browser regression passed: template/download/import/preview/cancel/errors/restore/idempotency/mobile')
} finally { await browser.close() }

