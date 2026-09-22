import { computed, ref, watchEffect } from 'vue'
type Theme = 'system' | 'light' | 'dark'
function read(key: string) {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
const saved = read('ga-theme')
export const theme = ref<Theme>(
    saved === 'light' || saved === 'dark' ? saved : 'system',
)
export const songLanguage = ref<'ja' | 'en'>(
    read('ga-language') === 'en' ? 'en' : 'ja',
)
const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
media.addEventListener('change', (e) => (systemDark.value = e.matches))
export const isDark = computed(
    () =>
        theme.value === 'dark' ||
        (theme.value === 'system' && systemDark.value),
)
watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value)
    try {
        localStorage.setItem('ga-theme', theme.value)
        localStorage.setItem('ga-language', songLanguage.value)
    } catch {
        /* 没有存储权限时仍可继续预览 */
    }
})
