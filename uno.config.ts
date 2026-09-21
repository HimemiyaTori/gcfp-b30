import presetWind3 from 'unocss/preset-wind3'
import { defineConfig } from 'unocss/vite'
export default defineConfig({
    presets: [presetWind3()],
    shortcuts: {
        row: 'flex items-center',
        between: 'flex items-center justify-between',
        stack: 'flex flex-col',
    },
})
