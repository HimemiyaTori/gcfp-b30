<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { isDark, songLanguage, theme } from '../../composables/useSettings'
const { t } = useI18n()
const languageName = (language: 'ja' | 'en') => language === 'ja' ? '日本語' : 'English'
</script>

<template>
    <button
        class="song-language-compact"
        type="button"
        :aria-label="t('display.songLanguageToggle', { current: languageName(songLanguage), next: languageName(songLanguage === 'ja' ? 'en' : 'ja') })"
        :title="t('display.songLanguage', { current: languageName(songLanguage) })"
        @click="songLanguage = songLanguage === 'ja' ? 'en' : 'ja'"
    >
        {{ songLanguage === 'ja' ? '日' : 'EN' }}
    </button>
    <button
        class="sidebar-theme-control"
        type="button"
        :aria-label="isDark ? t('display.toLight') : t('display.toDark')"
        :title="isDark ? t('display.toLight') : t('display.toDark')"
        @click="theme = isDark ? 'light' : 'dark'"
    >
        <Sun v-if="isDark" :size="19" />
        <Moon v-else :size="19" />
    </button>
</template>
