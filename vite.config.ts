import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
export default defineConfig({
    plugins: [vue(), UnoCSS()],
    base: process.env.GITHUB_ACTIONS ? '/gcfp-b30/' : '/',
})
