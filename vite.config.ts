import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import {
    DESKTOP_MEDIA_QUERY,
    MOBILE_BREAKPOINT_PX,
    MOBILE_MEDIA_QUERY,
} from './src/breakpoints'

const mediaQueryAliases = [
    ['(--mobile)', MOBILE_MEDIA_QUERY],
    ['(--desktop)', DESKTOP_MEDIA_QUERY],
] as const

// CSS 断点别名统一从共享宽度常量展开
const responsiveMediaAliases = {
    postcssPlugin: 'gcfp-responsive-media-aliases',
    AtRule: {
        media(rule: { params: string }) {
            for (const [alias, query] of mediaQueryAliases) {
                rule.params = rule.params.replaceAll(alias, query)
            }
        },
    },
}

export default defineConfig({
    plugins: [vue(), UnoCSS()],
    css: {
        postcss: {
            plugins: [responsiveMediaAliases],
        },
    },
    base: process.env.GITHUB_ACTIONS ? '/gcfp-b30/' : '/',
    build: {
        rollupOptions: {
            output: {
                assetFileNames(asset) {
                    // 与 public/ocr 共用稳定地址，避免同一 Worker 和 WASM 再生成哈希副本
                    if (asset.names.some(name => /^worker-entry-.*\.js$/.test(name))) return 'ocr/worker.js'
                    if (asset.names.includes('ort-wasm-simd-threaded.jsep.wasm')) return 'ocr/[name][extname]'
                    return 'assets/[name]-[hash][extname]'
                },
            },
        },
    },
})
