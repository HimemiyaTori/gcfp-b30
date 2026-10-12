import { computed, ref, watch, watchEffect } from 'vue'
import { i18n, t, UI_LANGUAGE_KEY, type UiLanguage } from '../i18n'
export { uiLanguages, type UiLanguage } from '../i18n'
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
export const uiLanguage = ref<UiLanguage>(i18n.global.locale.value as UiLanguage)
const savedSongLanguage = read('ga-language')
// 已保存的曲目信息语言优先，首次访问按界面语言联动
export const songLanguage = ref<'ja' | 'en'>(
    savedSongLanguage === 'en' || savedSongLanguage === 'ja'
        ? savedSongLanguage
        : uiLanguage.value === 'en' ? 'en' : 'ja',
)
watch(uiLanguage, (language) => {
    songLanguage.value = language === 'en' ? 'en' : 'ja'
    try {
        localStorage.setItem(UI_LANGUAGE_KEY, language)
    } catch {
        /* 没有存储权限时仅本次会话生效 */
    }
})
watchEffect(() => {
    i18n.global.locale.value = uiLanguage.value
    document.documentElement.lang = uiLanguage.value
    document.title = t('app.documentTitle')
})
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
