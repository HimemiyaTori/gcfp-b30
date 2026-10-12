import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { utils, read, write } from 'xlsx'
import ExcelJS from 'exceljs'
import {
    createScoreWorkbook,
    parseScoreWorkbook,
    workbookBytes,
} from '../src/core/excel/workbook.ts'
import { songService } from '../src/core/song/songService.ts'

const song = songService.songs[0]
const records = [
    {
        songId: song.id,
        chartId: song.charts[0].id,
        score: 1000000,
        fc: false,
        ap: false,
        maxChain: 0,
        rating: 0,
        source: 'manual',
        updatedAt: 2000,
    },
    {
        songId: song.id,
        chartId: song.charts[1].id,
        score: 1040000,
        fc: true,
        ap: true,
        maxChain: 2000,
        rating: 0,
        source: 'manual',
        updatedAt: 4000,
    },
]
const expectedInputMessages = {
    简体中文: ['分数无效', '请填写 0～1050000 的整数，未游玩时留空', 'Max Chain 无效', 'Max Chain 必须为 0～2000 的整数，未知时留空', '完成标记无效', '达成时填写 √，未达成时留空', '检查分数'],
    繁體中文: ['分數無效', '請填寫 0～1050000 的整數，未遊玩時留空', 'Max Chain 無效', 'Max Chain 必須為 0～2000 的整數，未知時留空', '完成標記無效', '達成時填寫 √，未達成時留空', '檢查分數'],
    日本語: ['スコアが無効です', '0～1050000 の整数を入力してください。未プレイの場合は空欄にしてください', 'Max Chain が無効です', 'Max Chain は 0～2000 の整数を入力してください。不明な場合は空欄にしてください', '達成マークが無効です', '達成した場合は √ を入力し、未達成の場合は空欄にしてください', 'スコアを確認'],
    English: ['Invalid score', 'Enter an integer from 0 to 1050000. Leave blank if unplayed', 'Invalid Max Chain', 'Max Chain must be an integer from 0 to 2000. Leave blank if unknown', 'Invalid achievement', 'Enter √ if achieved. Otherwise, leave blank', 'Check'],
}
function checkDownloadedInputs(sheet, messages) {
    for (const address of ['D2', 'D3'])
        assert.equal(sheet.getCell(address).alignment.horizontal, 'center')
    assert.deepEqual(sheet.getCell('J2').dataValidation.formulae, [0, 2000])
    for (const [address, title, body] of [
        ['E2', messages[0], messages[1]],
        ['J2', messages[2], messages[3]],
        ['H2', messages[4], messages[5]],
        ['I2', messages[4], messages[5]],
    ]) {
        assert.equal(sheet.getCell(address).dataValidation.errorTitle, title)
        assert.equal(sheet.getCell(address).dataValidation.error, body)
    }
    for (const address of ['F2', 'G2'])
        assert.ok(sheet.getCell(address).formula.includes(`"${messages[6]}"`))
}
const browser = await chromium.launch({
    channel: process.env.OCR_BROWSER || 'msedge',
    headless: true,
})
const downloads = await mkdtemp(join(tmpdir(), 'fp-excel-'))
try {
    await mkdir('.preview', { recursive: true })
    const page = await browser.newPage({
        viewport: { width: 1280, height: 950 },
        locale: 'zh-CN',
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
        `${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#settings`,
    )
    const exportButton = page.getByRole('button', {
        name: '导出成绩',
        exact: true,
    })
    const importButton = page.getByRole('button', {
        name: '导入成绩',
        exact: true,
    })
    await importButton.waitFor()
    await page.waitForFunction(
        () => !document.body.textContent.includes('正在加载本地成绩'),
    )
    assert.ok(await exportButton.isDisabled())
    let downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载模板', exact: true }).click()
    const template = await downloadEvent
    assert.equal(template.suggestedFilename(), 'FP_B30_导入模板.xlsx')
    await template.saveAs(join(downloads, 'template.xlsx'))
    const templateData = await readFile(join(downloads, 'template.xlsx'))
    assert.deepEqual(read(templateData).SheetNames, ['BASIC', 'ADVANCED'])
    const templateBook = new ExcelJS.Workbook()
    await templateBook.xlsx.load(templateData)
    for (const sheet of templateBook.worksheets) {
        assert.deepEqual(sheet.getRow(1).values.slice(1), ['曲绘', '曲名', '难度', '等级', '分数', '评级', 'Rating', 'FC', 'AP', 'Max Chain', '更新时间', '谱面 ID', '曲目 ID'])
        assert.equal(sheet.getCell('H2').value, null)
        assert.equal(sheet.getCell('I2').value, null)
        assert.equal(sheet.views[0].ySplit, 1)
        assert.equal(sheet.getColumn(6).width, sheet.getColumn(5).width)
        assert.equal(sheet.getColumn(7).width, sheet.getColumn(5).width)
        assert.equal(sheet.getCell('H2').dataValidation.formulae[0], '"√"')
        assert.equal(sheet.getCell('I2').dataValidation.formulae[0], '"√"')
        checkDownloadedInputs(sheet, expectedInputMessages.简体中文)
    }
    assert.equal(
        parseScoreWorkbook(
            templateData.buffer.slice(
                templateData.byteOffset,
                templateData.byteOffset + templateData.byteLength,
            ),
        ).rows.length,
        0,
    )

    const dialog = page.getByRole('dialog', {
        name: '导入 Excel 成绩',
        exact: true,
    })
    async function upload(workbook, name = '成绩.xlsx') {
        const chooserEvent = page.waitForEvent('filechooser')
        await importButton.click()
        const chooser = await chooserEvent
        await chooser.setFiles({
            name,
            mimeType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(await workbookBytes(workbook)),
        })
        await dialog.waitFor()
        await page.waitForFunction(
            () =>
                !document
                    .querySelector('.excel-dialog')
                    ?.textContent.includes('正在处理'),
        )
    }
    async function count() {
        return page.evaluate(async () =>
            (await import('/src/db/scoreRepository.ts')).scoreRepository
                .list()
                .then((rows) => rows.length),
        )
    }
    await upload(createScoreWorkbook([], 'ja', true))
    assert.match(await dialog.textContent(), /没有可导入/)
    assert.ok(
        await dialog.getByRole('button', { name: '确认导入' }).isDisabled(),
    )
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    // 在真实下载的模板中填写 √ 或留空，验证用户填写后的导入流程
    const validBook = templateBook
    for (const [index, record] of records.entries()) {
        const row = validBook.getWorksheet('BASIC').getRow(index + 2)
        row.getCell(5).value = record.score
        row.getCell(8).value = record.fc ? '√' : null
        row.getCell(9).value = record.ap ? '√' : null
        row.getCell(10).value = record.maxChain
        row.getCell(11).value = new Date(record.updatedAt).toISOString()
    }
    await upload(validBook)
    assert.match(await dialog.textContent(), /最佳新增 2 条/)
    assert.equal(await count(), 0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await count(), 0)

    const invalidBook = createScoreWorkbook(records)
    invalidBook.getWorksheet('BASIC').getCell('E3').value = 1050001
    await upload(invalidBook)
    assert.match(await dialog.textContent(), /BASIC 第 3 行/)
    assert.ok(
        await dialog.getByRole('button', { name: '确认导入' }).isDisabled(),
    )
    assert.equal(await count(), 0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    const invalidChainBook = createScoreWorkbook(records)
    invalidChainBook.getWorksheet('BASIC').getCell('J2').value = 2001
    await upload(invalidChainBook)
    assert.match(await dialog.textContent(), /Max Chain 必须为 0～2000 的整数/)
    assert.ok(await dialog.getByRole('button', { name: '确认导入' }).isDisabled())
    assert.equal(await count(), 0)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await upload(validBook)
    await page.screenshot({
        path: '.preview/excel-import-desktop.png',
        fullPage: true,
    })
    await dialog.getByRole('button', { name: '确认导入' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await count(), 2)
    await page.reload()
    await page.waitForFunction(
        () => !document.body.textContent.includes('正在加载本地成绩'),
    )
    assert.equal(await count(), 2)
    downloadEvent = page.waitForEvent('download')
    await exportButton.click()
    const exported = await downloadEvent
    await exported.saveAs(join(downloads, 'export.xlsx'))
    const data = await readFile(join(downloads, 'export.xlsx'))
    const exportedRows = parseScoreWorkbook(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ).rows
    assert.equal(exportedRows.length, 2)
    assert.equal(exportedRows.find((row) => row.score === 1000000).fc, false)
    await upload(validBook)
    assert.match(await dialog.textContent(), /跳过 2 条/)
    await dialog.getByRole('button', { name: '确认导入' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await count(), 2)

    // 在独立浏览器上下文恢复真实下载的文件
    const restored = await browser.newPage({ locale: 'zh-CN' })
    await restored.goto(
        `${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#settings`,
    )
    const restoreChooser = restored.waitForEvent('filechooser')
    await restored
        .getByRole('button', { name: '导入成绩', exact: true })
        .click()
    await (await restoreChooser).setFiles(join(downloads, 'export.xlsx'))
    await restored
        .getByRole('button', { name: '确认导入', exact: true })
        .click()
    await restored
        .getByRole('dialog', { name: '导入 Excel 成绩' })
        .waitFor({ state: 'hidden' })
    const actual = await restored.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.list(),
    )
    assert.equal(actual.length, 2)
    assert.equal(actual.find((r) => r.score === 1000000).maxChain, 0)
    assert.equal(actual.find((r) => r.score === 1000000).fc, false)
    assert.equal(actual.find((r) => r.score === 1000000).ap, false)
    assert.equal(actual.find((r) => r.score === 1040000).updatedAt, 4000)
    assert.equal(actual.find((r) => r.score === 1040000).fc, true)
    assert.equal(actual.find((r) => r.score === 1040000).ap, true)
    assert.equal(actual.find((r) => r.score === 1040000).maxChain, 2000)
    await restored.close()

    // 切换界面语言后下载真实文件，跨语言重新导入并保留完成标记
    const texts = {
        简体中文: { group: '界面语言', template: '下载模板', export: '导出成绩', import: '导入成绩', dialog: '导入 Excel 成绩', cancel: '取消', skipped: /重复跳过 2 条/, files: ['FP_B30_导入模板', 'FP_B30_成绩'] },
        繁體中文: { group: '介面語言', template: '下載範本', export: '匯出成績', import: '匯入成績', dialog: '匯入 Excel 成績', cancel: '取消', skipped: /重複略過 2 筆/, files: ['FP_B30_匯入範本', 'FP_B30_成績'] },
        日本語: { group: '表示言語', template: 'テンプレートをダウンロード', export: 'スコアをエクスポート', import: 'スコアをインポート', dialog: 'Excel のスコアをインポート', cancel: 'キャンセル', skipped: /重複スキップ 2 件/, files: ['FP_B30_インポートテンプレート', 'FP_B30_スコア'] },
        English: { group: 'Interface language', template: 'Download template', export: 'Export scores', import: 'Import scores', dialog: 'Import Excel scores', cancel: 'Cancel', skipped: /Duplicates skipped 2/, files: ['FP_B30_Import_Template', 'FP_B30_Scores'] },
    }
    let current = texts.简体中文
    async function switchLanguage(label) {
        await page.getByRole('main').getByRole('group', { name: current.group, exact: true }).getByRole('button', { name: label, exact: true }).click()
        current = texts[label]
        await page.getByRole('button', { name: current.import, exact: true }).waitFor()
    }
    for (const [label, headers] of [
        ['繁體中文', ['曲繪', '曲名', '難度', '等級', '分數', '評級', 'Rating', 'FC', 'AP', 'Max Chain', '更新時間', '譜面 ID', '曲目 ID']],
        ['日本語', ['ジャケット', '曲名', '難易度', 'レベル', 'スコア', 'ランク', 'レーティング', 'FC', 'AP', 'Max Chain', '更新日時', '譜面 ID', '楽曲 ID']],
        ['English', ['Cover', 'Title', 'Difficulty', 'Level', 'Score', 'Rank', 'Rating', 'FC', 'AP', 'Max Chain', 'Updated At', 'Chart ID', 'Song ID']],
        ['简体中文', ['曲绘', '曲名', '难度', '等级', '分数', '评级', 'Rating', 'FC', 'AP', 'Max Chain', '更新时间', '谱面 ID', '曲目 ID']],
    ]) {
        await switchLanguage(label)
        for (const button of ['template', 'export']) {
            const event = page.waitForEvent('download')
            await page.getByRole('button', { name: texts[label][button], exact: true }).click()
            const file = await event
            if (button === 'template') assert.equal(file.suggestedFilename(), `${texts[label].files[0]}.xlsx`)
            else assert.ok(file.suggestedFilename().startsWith(`${texts[label].files[1]}_`))
            const path = join(downloads, `${label}-${button}.xlsx`)
            await file.saveAs(path)
            const bytes = await readFile(path)
            const saved = read(bytes)
            const downloadedBook = new ExcelJS.Workbook()
            await downloadedBook.xlsx.load(bytes)
            for (const sheet of downloadedBook.worksheets)
                checkDownloadedInputs(sheet, expectedInputMessages[label])
            for (const sheet of Object.values(saved.Sheets)) {
                assert.deepEqual(utils.sheet_to_json(sheet, { header: 1 })[0], headers)
                assert.equal(sheet.H2?.v ?? null, null)
                assert.equal(sheet.I2?.v ?? null, null)
            }
            const preview = parseScoreWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
            assert.deepEqual(preview.issues, [])
            assert.equal(preview.rows.length, button === 'template' ? 0 : 2)
            if (button === 'export') {
                assert.equal(saved.Sheets.BASIC.H3.v, '√')
                assert.equal(saved.Sheets.BASIC.I3.v, '√')
                await switchLanguage(label === 'English' ? '简体中文' : 'English')
                const chooser = page.waitForEvent('filechooser')
                await page.getByRole('button', { name: current.import, exact: true }).click()
                await (await chooser).setFiles(path)
                const localizedDialog = page.getByRole('dialog', { name: current.dialog, exact: true })
                await localizedDialog.getByText(current.skipped).waitFor()
                await localizedDialog.getByRole('button', { name: current.cancel, exact: true }).click()
            }
        }
    }
    await switchLanguage('简体中文')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
        path: '.preview/excel-settings-mobile.png',
        fullPage: true,
    })
    assert.ok(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    )
    await upload(invalidBook)
    await page.screenshot({
        path: '.preview/excel-error-mobile.png',
        fullPage: true,
    })
    assert.ok(
        await page.evaluate(
            () =>
                document.querySelector('.excel-dialog').getBoundingClientRect()
                    .right <= innerWidth,
        ),
    )
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await upload(validBook, '错误格式.csv')
    assert.match(await dialog.textContent(), /请选择 .xlsx/)
    assert.equal(await count(), 2)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()

    // 首页选择和拖入 Excel 复用预览确认流程，删减模板仍能读取
    await page.evaluate(() => {
        location.hash = '#home'
    })
    const homeInput = page.getByLabel('选择成绩截图或 Excel', { exact: true })
    await homeInput.waitFor()
    assert.match(await homeInput.getAttribute('accept'), /\.xlsx/)
    const trimmed = utils.book_new()
    utils.book_append_sheet(
        trimmed,
        utils.aoa_to_sheet([
            ['Chart ID', 'Score'],
            [song.charts[2].id, 1000000],
        ]),
        'BASIC',
    )
    const homeFile = {
        name: '删减模板.xlsx',
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(
            write(trimmed, { bookType: 'xlsx', type: 'array' }),
        ),
    }
    await homeInput.setInputFiles(homeFile)
    await dialog.waitFor()
    await page
        .getByText('预计录入 1 条 · 最佳新增 1 条 · 变化 0 条 · 重复跳过 0 条 · 候选忽略 0 条', { exact: true })
        .waitFor()
    assert.equal(await count(), 2)
    assert.equal(await page.locator('.import-dialog').isVisible(), false)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await count(), 2)
    await homeInput.setInputFiles(homeFile)
    await dialog.getByRole('button', { name: '确认导入' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await count(), 3)
    await page.screenshot({
        path: '.preview/excel-home-mobile.png',
        fullPage: true,
    })
    assert.ok(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    )
    const transfer = await page.evaluateHandle(
        ({ name, data }) => {
            const transfer = new DataTransfer()
            transfer.items.add(
                new File(
                    [Uint8Array.from(atob(data), (char) => char.charCodeAt(0))],
                    name,
                    {
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    },
                ),
            )
            return transfer
        },
        { name: homeFile.name, data: homeFile.buffer.toString('base64') },
    )
    await page
        .locator('.drop-zone')
        .dispatchEvent('drop', { dataTransfer: transfer })
    await dialog.waitFor()
    await page
        .getByText('预计录入 0 条 · 最佳新增 0 条 · 变化 0 条 · 重复跳过 1 条 · 候选忽略 0 条', { exact: true })
        .waitFor()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await transfer.dispose()

    await homeInput.setInputFiles([
        homeFile,
        { ...homeFile, name: '另一份.xlsx' },
    ])
    await page
        .getByText('Excel 请一次上传一个文件，成绩截图请单独上传。', {
            exact: true,
        })
        .waitFor()
    assert.equal(await dialog.isVisible(), false)
    await homeInput.setInputFiles([
        homeFile,
        { name: '截图.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
    ])
    assert.equal(await dialog.isVisible(), false)
    assert.equal(await page.locator('.import-dialog').isVisible(), false)
    await homeInput.setInputFiles({
        name: '截图.png',
        mimeType: 'image/png',
        buffer: Buffer.alloc(0),
    })
    await page.locator('.import-dialog').waitFor()
    await page
        .getByText('图片不能为空，且不得超过 20 MB。', { exact: true })
        .waitFor()
    assert.equal(await dialog.isVisible(), false)
    assert.equal(await count(), 3)
    assert.deepEqual(errors, [])
    console.log('Downloads:', downloads)
    console.log(
        'Excel browser regression passed: first-row multilingual headers/centered levels/Max Chain limit/localized input errors/achievement marks and blanks/cross-language import/template/download/import/preview/cancel/errors/restore/idempotency/mobile/home picker and drop/trimmed template/image routing',
    )
} finally {
    await browser.close()
}
