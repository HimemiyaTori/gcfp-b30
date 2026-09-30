const definitions = [
    { family: 'QQBotUD', file: 'ud-digi-kyokasho-n-bold.woff2', range: '' },
    { family: 'QQBotArialDegree', file: 'arial-degree.woff2', range: 'U+00B0' },
]
let embeddedFonts: Promise<string> | undefined

export function loadPosterFonts() {
    // 复用 QQBot 原字体并嵌入 PNG 的中间 SVG，避免移动端回退到系统字体
    embeddedFonts ??= Promise.all(definitions.map(async ({ family, file, range }) => {
        const response = await fetch(`${import.meta.env.BASE_URL}fonts/b30/${file}`, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('B30 字体加载失败，请重试')
        const blob = await response.blob()
        const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
        })
        const source = `url("${data}") format("woff2")`
        const face = new FontFace(family, source, { weight: '700', ...(range ? { unicodeRange: range } : {}) })
        await face.load()
        document.fonts.add(face)
        return `@font-face { font-family: '${family}'; font-weight: 700; src: ${source}; ${range ? `unicode-range: ${range};` : ''} }`
    })).then(css => css.join('\n')).catch(cause => {
        embeddedFonts = undefined
        throw cause
    })
    return embeddedFonts
}
