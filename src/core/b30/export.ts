import { createApp, nextTick } from 'vue'
import { toBlob } from 'html-to-image'
import B30Poster from '../../components/B30Poster.vue'
import type { getModeB30 } from '../rating/calculator'
import { loadPosterFonts } from './fonts'

// 导出前把同源素材固化为数据 URL，缺图保留组件中的文字或音符占位
async function embedImages(root: HTMLElement) {
    const images = [...root.querySelectorAll('img')]
    const sources = [...new Set(images.map(image => image.src))]
    const results = new Map<string, string>()
    const deadline = AbortSignal.timeout(20000)
    let position = 0
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (position < sources.length && !deadline.aborted) {
            const source = sources[position++]!
            try {
                const response = await fetch(source, { signal: AbortSignal.any([deadline, AbortSignal.timeout(4000)]) })
                if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue
                const blob = await response.blob()
                const data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(String(reader.result))
                    reader.onerror = () => reject(reader.error)
                    reader.readAsDataURL(blob)
                })
                results.set(source, data)
            } catch {
                // 素材不可用时继续导出，下一次生成会重新尝试
            }
        }
    }))
    let missing = 0
    await Promise.all(images.map(async image => {
        const data = results.get(image.src)
        try {
            if (!data) throw new Error('图片不可用')
            image.src = data
            await image.decode()
        } catch {
            if (image.hasAttribute('data-cover')) missing++
            image.remove()
        }
    }))
    return missing
}

export async function exportB30(summary: ReturnType<typeof getModeB30>, language: 'ja' | 'en') {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1800px;pointer-events:none'
    host.setAttribute('aria-hidden', 'true')
    host.inert = true
    document.body.append(host)
    const now = new Date()
    const app = createApp(B30Poster, { summary, language, generatedAt: now.toLocaleString('zh-CN', { hour12: false }) })
    try {
        const fontEmbedCSS = await loadPosterFonts()
        app.mount(host)
        await nextTick()
        await document.fonts.ready
        const root = host.firstElementChild as HTMLElement
        // 用原字体加载后的实际排版判定溢出，仅长曲名的末尾应用透明渐变
        for (const title of root.querySelectorAll<HTMLElement>('.poster-title')) {
            title.classList.toggle('is-overflowing', title.scrollWidth > title.clientWidth)
        }
        const missing = await embedImages(root)
        const blob = await toBlob(root, { pixelRatio: 1, fontEmbedCSS, backgroundColor: '#354c70' })
        if (!blob) throw new Error('图片生成失败，请重试')
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `FP_B30_${summary.mode}_${now.toISOString().replace(/[:.]/g, '-')}.png`
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 60000)
        return { missing }
    } finally {
        app.unmount()
        host.remove()
    }
}
