import type ExcelJS from 'exceljs'
import { songService } from '../song/songService'
import { coverThumbUrl } from '../song/cover'

export type CoverLoader = (url: string, signal: AbortSignal) => Promise<string>
// 与成绩列表使用同一缩略图地址，已显示过的曲绘直接命中浏览器缓存
const loadCover: CoverLoader = async (url, signal) => {
    const response = await fetch(url, { signal })
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new Error('曲绘加载失败')
    const blob = await response.blob()
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}
const loaded = new Map<string, string>()

export async function addWorkbookCovers(book: ExcelJS.Workbook, loader: CoverLoader = loadCover) {
    const targets = new Map<string, { sheet: ExcelJS.Worksheet; row: number; count: number }[]>()
    for (const sheet of book.worksheets) {
        for (let row = 6; row <= sheet.rowCount;) {
            const id = String(sheet.getCell(row, 14).value ?? '')
            let end = row + 1
            while (end <= sheet.rowCount && sheet.getCell(end, 14).value === id) end++
            const url = coverThumbUrl(songService.getSong(id)?.coverSourceUrl ?? '')
            if (url) targets.set(url, [...(targets.get(url) ?? []), { sheet, row, count: end - row }])
            row = end
        }
    }
    const queue = [...targets.keys()]
    const deadline = AbortSignal.timeout(20000)
    // 仅默认加载器复用会话内结果，避免重复导出时再次请求
    const cache = loader === loadCover ? loaded : new Map<string, string>()
    let position = 0, success = 0
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (position < queue.length && !deadline.aborted) {
            const url = queue[position++]!
            try {
                const data = cache.get(url) ?? await loader(url, AbortSignal.any([deadline, AbortSignal.timeout(4000)]))
                cache.set(url, data)
                const id = book.addImage({ base64: data, extension: 'jpeg' })
                for (const target of targets.get(url)!) {
                    target.sheet.getCell(target.row, 1).value = null
                    const size = Math.min(92, target.count * 28 * 4 / 3 - 8)
                    target.sheet.addImage(id, { tl: { col: 0.12, row: target.row - 1 + (target.count - size / (28 * 4 / 3)) / 2 }, ext: { width: size, height: size }, editAs: 'oneCell' })
                }
                success++
            } catch {
                // 网络或解码失败保留曲绘占位，不阻止成绩文件下载
            }
        }
    }))
    return { loaded: success, missing: queue.length - success }
}
