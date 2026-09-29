import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { COVER_DIR, COVER_SIZE, coverFileName } from '../src/core/song/cover.ts'

// 外站曲绘无 CORS，构建时转为同源缩略图，供页面显示与 Excel 导出共用
const target = new URL(`../public/${COVER_DIR}/`, import.meta.url)
const songs = JSON.parse(await readFile(new URL('../src/data/songs.json', import.meta.url), 'utf8'))
const files = new Map()
for (const { id, coverSourceUrl: url } of songs) {
    if (!url) continue
    const name = coverFileName(url)
    if (files.has(name) && files.get(name) !== url) throw new Error(`曲绘文件名冲突：歌曲 ${id}`)
    files.set(name, url)
}
await mkdir(target, { recursive: true })
const existing = new Set(await readdir(target))
for (const name of existing) if (!files.has(name)) await rm(new URL(name, target), { force: true })
const pending = [...files].filter(([name]) => !existing.has(name))
const failed = []
async function download(url) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return Buffer.from(await response.arrayBuffer())
        } catch (error) {
            if (attempt >= 3) throw error
        }
    }
}
await Promise.all(Array.from({ length: 6 }, async () => {
    for (let item = pending.shift(); item; item = pending.shift()) {
        const [name, url] = item
        try {
            const image = await sharp(await download(url))
                .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 80, mozjpeg: true })
                .toBuffer()
            await writeFile(new URL(name, target), image)
        } catch (error) {
            failed.push(`${url}（${error instanceof Error ? error.message : error}）`)
        }
    }
}))
// 下载失败不阻止构建，页面回退来源原图，Excel 保留占位
if (failed.length) console.warn(`曲绘缩略图 ${failed.length} 张生成失败：\n${failed.join('\n')}`)
