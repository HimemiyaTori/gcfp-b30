import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, access, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// 先启动 yarn dev；样本仅保存在本地，不提交到版本库
const samples = JSON.parse(
    await readFile(new URL('./ocr-samples.json', import.meta.url), 'utf8'),
)
await mkdir('.preview', { recursive: true })
for (const sample of samples)
    await access(resolve('src/data/test', sample.path))
const browser = await chromium.launch({
    channel: process.env.OCR_BROWSER || 'msedge',
    headless: true,
})
try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.OCR_URL || 'http://127.0.0.1:5173')
    await page.getByRole('heading', { name: '录入新成绩' }).waitFor()
    await page.waitForFunction(
        () => !document.body.textContent.includes('正在加载本地成绩'),
    )
    const recognized = await page.evaluate(
        async (paths) => {
            const { createRecognizer } =
                await import('/src/core/ocr/recognizer.ts')
            const engine = createRecognizer()
            try {
                const results = []
                for (const path of paths)
                    results.push(
                        await engine.recognize(
                            await (
                                await fetch(`/src/data/test/${path}`)
                            ).blob(),
                            new AbortController().signal,
                        ),
                    )
                return results
            } finally {
                engine.dispose()
            }
        },
        samples.map((s) => s.path),
    )
    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i],
            result = recognized[i]
        if (sample.skip) {
            assert.equal(result.kind, 'skipped')
            assert.ok(result.reason.includes(sample.skip))
        } else {
            assert.equal(result.kind, 'score', sample.path)
            assert.equal(result.chartId, sample.chartId, sample.path)
            assert.equal(result.score, sample.score, sample.path)
            for (const key of ['fc', 'ap', 'maxChain'])
                assert.equal(
                    result.achievements[key],
                    sample[key],
                    `${sample.path}: ${key}`,
                )
        }
    }
    // 一并验证实际上传队列、解析器和 IndexedDB 持久化流程
    await page
        .locator('input[type=file]')
        .setInputFiles(samples.map((s) => resolve('src/data/test', s.path)))
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
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].skip)
            assert.ok(
                jobs[i].includes(samples[i].skip),
                `${samples[i].path}: ${jobs[i]}`,
            )
        else
            assert.ok(
                jobs[i].includes('已处理'),
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
        assert.ok(
            Object.keys(record).every(
                (key) => !/file|blob|image|canvas/i.test(key),
            ),
        )
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    // 提高待上传成绩，避免延迟写入因重复记录而被误判为无操作
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
    // 取消进行中的工作线程，再在替代批次运行时切换页面
    await page
        .locator('input[type=file]')
        .setInputFiles(resolve('src/data/test/result/6292.jpg'))
    await page.getByRole('button', { name: '取消识别', exact: true }).click()
    await page
        .locator('input[type=file]')
        .setInputFiles(resolve('src/data/test/result/6292.jpg'))
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
    // 手动录入允许 Max Chain 为空；AP 会触发 FC，刷新后仍保留
    await page.getByRole('button', { name: '手动新增', exact: true }).click()
    const dialog = page.locator('dialog[open]')
    await dialog.getByLabel('完成状态').selectOption('ap')
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
    assert.deepEqual(errors, [])
    console.log(
        `Browser OCR passed: ${samples.length} samples, ${records.length} distinct charts; cancellation, manual AP/optional chain and reload passed.`,
    )
} finally {
    await browser.close()
}
