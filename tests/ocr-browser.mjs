import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, access, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 先启动 yarn dev；样本默认读 tests/score images，也可通过 OCR_SAMPLES_DIR 指定
const samples = JSON.parse(
    await readFile(new URL('./ocr-samples.json', import.meta.url), 'utf8'),
)
const sampleDirectory = resolve(
    process.env.OCR_SAMPLES_DIR ||
        fileURLToPath(new URL('./score images', import.meta.url)),
)
const samplePath = path => resolve(sampleDirectory, path)
const repeatableResult = samplePath('result/en-bas-hard9-fc.jpg')
const missing = []
for (const sample of samples) {
    try { await access(samplePath(sample.path)) } catch { missing.push(sample.path) }
}
if (missing.length) throw new Error(
    `缺少 ${missing.length} 张 OCR 标注样本，目录：${sampleDirectory}。请按 tests/ocr-samples.json 准备图片，或设置 OCR_SAMPLES_DIR 指向包含 result、select、playing 子目录的样本目录。缺失：${missing.join(', ')}`,
)
// 在批次末尾重复首张截图，验证不相邻的相同成绩只保留一次
samples.push({ ...samples[0] })
await mkdir('.preview', { recursive: true })
const browser = await chromium.launch({
    channel: process.env.OCR_BROWSER || 'msedge',
    headless: true,
})
try {
    const page = await browser.newPage({ locale: 'zh-CN' })
    await page.addInitScript(() => {
        const OriginalWorker = window.Worker
        window.Worker = class extends OriginalWorker {
            constructor(...args) {
                if (window.ocrFailNextWorker) {
                    window.ocrFailNextWorker = false
                    throw new Error('模拟工作线程初始化失败')
                }
                super(...args)
            }
        }
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.OCR_URL || 'http://127.0.0.1:5173')
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.waitForFunction(
        () => !document.body.textContent.includes('正在加载本地成绩'),
    )
    // 通过真实上传验证识别结果、跳过提示和浏览器持久化
    await page
        .getByLabel('选择成绩截图或 Excel', { exact: true })
        .setInputFiles(samples.map((s) => samplePath(s.path)))
    await page.locator('.import-result').first().waitFor()
    await page.waitForFunction(
        () =>
            document.querySelectorAll(
                '.import-result.queued, .import-result.running',
            ).length === 0,
        {},
        { timeout: 180000 },
    )
    const jobs = await page.locator('.import-result').allTextContents()
    assert.equal(jobs.length, samples.length)
    assert.match(jobs.at(-1), /本批次重复/)
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].skip)
            assert.ok(
                jobs[i].includes(samples[i].skip),
                `${samples[i].path}: ${jobs[i]}`,
            )
        else
            assert.ok(
                jobs[i].includes('已处理') || jobs[i].includes('重复'),
                `${samples[i].path}: ${jobs[i]}`,
            )
    }
    const records = await page.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.list(),
    )
    const expected = new Map()
    for (const sample of samples.filter((s) => !s.skip)) {
        const previous = expected.get(sample.chartId)
        if (!previous || sample.score > previous.score)
            expected.set(sample.chartId, sample)
    }
    assert.equal(records.length, expected.size)
    for (const record of records) {
        const sample = expected.get(record.chartId)
        assert.ok(sample, record.chartId)
        for (const key of ['score', 'fc', 'ap', 'maxChain'])
            assert.equal(record[key], sample[key], `${record.chartId}: ${key}`)
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    // 关闭结果弹窗后再次导入，应提示重复成绩
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(repeatableResult)
    await page.waitForFunction(
        () => document.querySelector('.import-result.skipped'),
        {},
        { timeout: 30000 },
    )
    assert.ok((await page.locator('.import-result').textContent()).includes('重复'))
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    console.log('Upload queue and repeated import passed')
    // 完成批次后切页再返回，仍能继续上传
    await page.evaluate(() => { location.hash = '#scores' })
    await page.getByRole('heading', { name: '成绩一览' }).waitFor()
    await page.evaluate(() => { location.hash = '#home' })
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(repeatableResult)
    await page.waitForFunction(() => document.querySelector('.import-result.skipped'), {}, { timeout: 30000 })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    console.log('Upload after page navigation passed')

    // 降低已有成绩，使取消场景中的错误写入能够被发现
    await page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        const target = (await scoreRepository.list()).find(
            (record) => record.chartId === '6-basic-hard',
        )
        await scoreRepository.edit(target.id, 0, true)
    })
    const beforeCancellation = await page.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.list(),
    )
    const beforeHistory = await page.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.history(),
    )
    // 取消识别，再在新批次运行时切换页面，成绩不应改变
    await page
        .getByLabel('选择成绩截图或 Excel', { exact: true })
        .setInputFiles(repeatableResult)
    await page.getByRole('button', { name: '取消识别', exact: true }).click()
    await page
        .getByLabel('选择成绩截图或 Excel', { exact: true })
        .setInputFiles(repeatableResult)
    await page.evaluate(() => {
        location.hash = '#scores'
    })
    await page.waitForFunction(
        () => !document.querySelector('.import-dialog[open]'),
    )
    assert.deepEqual(
        await page.evaluate(async () =>
            (await import('/src/db/scoreRepository.ts')).scoreRepository.list(),
        ),
        beforeCancellation,
    )
    assert.deepEqual(await page.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.history(),
    ), beforeHistory)
    // 手动录入允许 Max Chain 为空；AP 会触发 FC，刷新后仍保留
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.getByRole('button', { name: 'AP', exact: true }).click()
    await dialog.getByRole('button', { name: '保存成绩', exact: true }).click()
    await page.waitForFunction(
        () => !document.querySelector('.editor-dialog[open]'),
    )
    await page.reload()
    const manual = await page.evaluate(async () =>
        (await import('/src/db/scoreRepository.ts')).scoreRepository.list(),
    )
    const added = manual.find(
        (record) => record.chartId === '1-advanced-master',
    )
    assert.equal(added.ap, true)
    assert.equal(added.fc, true)
    assert.equal(added.maxChain, undefined)
    assert.equal(
        manual.find((record) => record.chartId === '6-basic-hard').score,
        0,
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    await page.screenshot({
        path: '.preview/ocr-manual-mobile.png',
        fullPage: true,
    })
    // 模拟初始化失败，同批下一张截图仍能成功保存
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.evaluate(() => {
        location.hash = '#home'
        window.ocrFailNextWorker = true
    })
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles([
        repeatableResult,
        repeatableResult,
    ])
    await page.waitForFunction(
        () => document.querySelectorAll('.import-result').length === 2 &&
            !document.querySelector('.import-result.queued, .import-result.running'),
        {},
        { timeout: 120000 },
    )
    assert.ok((await page.locator('.import-result.failed').textContent()).includes('模拟工作线程初始化失败'))
    assert.equal(await page.locator('.import-result.success').count(), 1)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    // 仅让下一张图片立即超时，后续图片仍能继续处理
    await page.evaluate(() => {
        const timeout = AbortSignal.timeout
        AbortSignal.timeout = function () {
            AbortSignal.timeout = timeout
            return timeout.call(AbortSignal, 0)
        }
    })
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles([
        repeatableResult,
        repeatableResult,
    ])
    await page.waitForFunction(() => document.querySelectorAll('.import-result').length === 2 &&
        !document.querySelector('.import-result.queued, .import-result.running'), {}, { timeout: 120000 })
    assert.equal(await page.locator('.import-result.failed').count(), 1, JSON.stringify(await page.locator('.import-result').allTextContents()))
    assert.match(await page.locator('.import-result.failed').textContent(), /超时/)
    assert.equal(await page.locator('.import-result.skipped').count(), 1)
    await page.getByRole('button', { name: '关闭', exact: true }).click()

    // 开始新批次后，旧批次完成提示不能关闭新的结果弹窗
    await page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        const record = (await scoreRepository.list()).find(item => item.chartId === '6-basic-hard')
        await scoreRepository.edit(record.id, 0, true)
    })
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(repeatableResult)
    await page.waitForFunction(() => document.querySelector('.import-result.success'), {}, { timeout: 30000 })
    await page.getByLabel('选择成绩截图或 Excel', { exact: true }).setInputFiles(repeatableResult)
    await page.waitForFunction(() => document.querySelector('.import-result.skipped'), {}, { timeout: 30000 })
    // 等待用户可见的完成反馈结束，新批次结果弹窗应保持打开
    await page.waitForTimeout(3000)
    assert.equal(await page.locator('.import-dialog[open]').count(), 1)
    assert.equal(await page.locator('.import-result.skipped').count(), 1)
    console.log('Timeout recovery and stale completion callback protection passed')
    assert.deepEqual(errors, [])
    console.log(
        `Browser OCR passed: ${samples.length} samples, ${records.length} distinct charts; repeated upload, navigation, initialization failure and timeout recovery, cancellation, manual AP/optional chain and reload passed.`,
    )
} finally {
    await browser.close()
}
