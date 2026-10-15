import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import ja from './locales/ja.json'
import en from './locales/en.json'
import { AlbumError, DomainError } from './core/errors'

export const uiLanguages = [
    { id: 'zh-CN', label: '简体中文' },
    { id: 'zh-TW', label: '繁體中文' },
    { id: 'ja', label: '日本語' },
    { id: 'en', label: 'English' },
] as const
export type UiLanguage = (typeof uiLanguages)[number]['id']
export const UI_LANGUAGE_KEY = 'ga-ui-language'

export function matchUiLanguage(tags: readonly string[]): UiLanguage | undefined {
    for (const tag of tags) {
        const value = tag.toLowerCase()
        if (value.startsWith('zh'))
            return /hant|-(tw|hk|mo)\b/.test(value) ? 'zh-TW' : 'zh-CN'
        if (value.startsWith('ja')) return 'ja'
        if (value.startsWith('en')) return 'en'
    }
    return undefined
}

// Node 环境固定简体中文，避免验收脚本随系统语言变化
function initialLanguage(): UiLanguage {
    if (typeof window === 'undefined') return 'zh-CN'
    let saved: string | null = null
    try {
        saved = localStorage.getItem(UI_LANGUAGE_KEY)
    } catch {
        /* 没有存储权限时按浏览器语言匹配 */
    }
    const stored = uiLanguages.find(option => option.id === saved)
    if (stored) return stored.id
    return matchUiLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]) ?? 'zh-CN'
}

export const i18n = createI18n({
    legacy: false,
    locale: initialLanguage(),
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'zh-TW': zhTW, ja, en },
})
export const t = i18n.global.t
export const currentLanguage = () => i18n.global.locale.value as UiLanguage

export function errorMessage(error: unknown, fallback = 'album.failed') {
    if (error instanceof AlbumError) {
        const key = `album.errors.${error.code}`
        return i18n.global.te(key) ? t(key) : t('album.apiError', { code: error.code })
    }
    if (error instanceof DomainError) return t(error.code, error.params)
    return error instanceof Error ? error.message : t(fallback)
}
