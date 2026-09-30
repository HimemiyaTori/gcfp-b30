import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const output = await mkdtemp(join(tmpdir(), 'fp-b30-'))
const browser = await chromium.launch({
    channel: process.env.OCR_BROWSER || 'msedge',
    headless: true,
})
try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 3,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${process.env.OCR_URL || 'http://127.0.0.1:5173'}/#b30`)
    const basicButton = page.getByRole('button', {
        name: '生成 BAS B30',
        exact: true,
    })
    await basicButton.waitFor()
    assert.equal(await basicButton.isDisabled(), true)
    await page.evaluate(async () => {
        const { scoreRepository } = await import('/src/db/scoreRepository.ts')
        const { songService } = await import('/src/core/song/songService.ts')
        for (const [mode, count] of [
            ['basic', 35],
            ['advanced', 7],
        ]) {
            const charts = songService.songs
                .flatMap((song) =>
                    song.charts
                        .filter((chart) => chart.mode === mode)
                        .map((chart) => ({ song, chart })),
                )
                .slice(0, count)
            for (const [index, { song, chart }] of charts.entries()) {
                await scoreRepository.addManual(
                    song.id,
                    chart.id,
                    1050000 - index * 1000,
                    {
                        ap: index === 0 ? true : undefined,
                        fc: index === 1 ? true : undefined,
                    },
                )
            }
        }
    })
    await page
        .getByRole('textbox', { name: '搜索成绩' })
        .fill('no-match-for-export')
    await page.waitForFunction(
        () => !document.querySelector('.page-heading button[disabled]'),
    )
    // 暂缓曲绘请求，确保能检查生成中的排版以及切换模式后的快照
    let resumeCovers
    const coversReady = new Promise((resolve) => {
        resumeCovers = resolve
    })
    await page.route('**/covers/*.jpg', async (route) => {
        await coversReady
        await route.continue()
    })
    const download = page.waitForEvent('download')
    await basicButton.click()
    await page.locator('.b30-poster').waitFor({ state: 'attached' })
    assert.equal(
        await page.locator('.poster-card:not(.poster-empty)').count(),
        30,
    )
    assert.equal(
        await page
            .locator('.poster-card:not(.poster-empty)')
            .evaluateAll((cards) =>
                cards.every((card) => {
                    const box = card.getBoundingClientRect()
                    const rank = card
                        .querySelector('.poster-position')
                        .getBoundingClientRect()
                    const chart = card
                        .querySelector('.poster-chart')
                        .getBoundingClientRect()
                    const title = card
                        .querySelector('.poster-title')
                        .getBoundingClientRect()
                    const score = card
                        .querySelector('.poster-score')
                        .getBoundingClientRect()
                    const rating = card
                        .querySelector('.poster-chart-rating')
                        .getBoundingClientRect()
                    return (
                        rank.left - box.left === 140 &&
                        chart.left - box.left === 182 &&
                        title.top >= chart.bottom &&
                        score.top >= title.bottom &&
                        rating.top >= score.bottom &&
                        rating.bottom <= box.bottom - 10
                    )
                }),
            ),
        true,
    )
    assert.equal(
        await page
            .locator('.poster-badges, .poster-rank, .poster-fc, .poster-ap')
            .count(),
        0,
    )
    assert.doesNotMatch(
        await page.locator('.b30-poster').textContent(),
        /\bRT\b|FULL COMBO|ALL PERFECT|SSS/,
    )
    assert.equal(
        await page.evaluate(() =>
            [...document.fonts].some(
                (face) => face.family === 'QQBotUD' && face.status === 'loaded',
            ),
        ),
        true,
    )
    assert.match(
        await page
            .locator('.poster-score')
            .first()
            .evaluate((element) => getComputedStyle(element).fontFamily),
        /QQBotUD/,
    )
    const titleStyles = await page
        .locator('.poster-title')
        .evaluateAll((titles) =>
            titles.map((title) => ({
                text: title.textContent.trim(),
                overflow: title.scrollWidth > title.clientWidth,
                faded: title.classList.contains('is-overflowing'),
                mask: getComputedStyle(title).maskImage,
                textOverflow: getComputedStyle(title).textOverflow,
            })),
        )
    assert.ok(titleStyles.some((title) => title.overflow))
    assert.ok(titleStyles.some((title) => !title.overflow))
    for (const title of titleStyles) {
        assert.equal(title.faded, title.overflow)
        assert.equal(title.mask !== 'none', title.overflow)
        assert.equal(title.textOverflow, 'clip')
        assert.ok(!title.text.endsWith('…'))
    }
    const posterRating = await page
        .locator('.poster-rating strong')
        .textContent()
    const selectedRating = await page
        .locator('.mode-rating-card.selected .big-rating')
        .textContent()
    assert.ok(selectedRating.includes(posterRating))
    await page
        .getByRole('button', { name: '查看 ADVANCED Best 30', exact: true })
        .click()
    resumeCovers()
    const file = await download
    assert.match(file.suggestedFilename(), /FP_B30_BASIC_/)
    const basicPath = join(output, 'basic.png')
    await file.saveAs(basicPath)
    const metadata = await sharp(await readFile(basicPath)).metadata()
    assert.equal(metadata.width, 1800)
    assert.equal(metadata.height, 1360)
    await page.waitForFunction(() => !document.querySelector('.b30-poster'))
    await page.unroute('**/covers/*.jpg')

    // 手机端、缺图及不足三十条仍导出固定尺寸
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/covers/*.jpg', (route) =>
        route.fulfill({ status: 404, body: 'missing' }),
    )
    const advancedDownload = page.waitForEvent('download')
    await page
        .getByRole('button', { name: '生成 ADV B30', exact: true })
        .click()
    await page.locator('.b30-poster').waitFor({ state: 'attached' })
    assert.equal(await page.locator('.poster-empty').count(), 23)
    const advancedFile = await advancedDownload
    assert.match(advancedFile.suggestedFilename(), /FP_B30_ADVANCED_/)
    await advancedFile.saveAs(join(output, 'advanced-missing.png'))
    const advancedMetadata = await sharp(
        await readFile(join(output, 'advanced-missing.png')),
    ).metadata()
    assert.equal(advancedMetadata.width, 1800)
    assert.equal(advancedMetadata.height, 1360)
    await page.waitForFunction(() => !document.querySelector('.b30-poster'))
    assert.ok(
        (await page.locator('body').textContent()).includes('7 张曲绘未加载'),
    )
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
    )
    await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(
        'B30 export passed: empty state, full unfiltered B30, rating, mode snapshot, PNG size, mobile, missing covers, sparse layout, cleanup',
    )
    console.log('Artifacts:', output)
} finally {
    await browser.close()
}
