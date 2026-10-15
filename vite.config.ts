import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
export default defineConfig({
    plugins: [vue(), UnoCSS()],
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
