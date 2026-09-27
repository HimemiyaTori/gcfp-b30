<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { isDark, songLanguage, theme } from '../../composables/useSettings'
</script>

<template>
    <button
        class="song-language-compact"
        type="button"
        :aria-label="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}。点击切换为${songLanguage === 'ja' ? 'English' : '日本語'}`"
        :title="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}`"
        @click="songLanguage = songLanguage === 'ja' ? 'en' : 'ja'"
    >
        {{ songLanguage === 'ja' ? '日' : 'EN' }}
    </button>
    <button
        class="sidebar-theme-control"
        type="button"
        :aria-label="
            isDark ? '切换到浅色主题' : '切换到深色主题'
        "
        :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
        @click="theme = isDark ? 'light' : 'dark'"
    >
        <Sun v-if="isDark" :size="19" />
        <Moon v-else :size="19" />
    </button>
</template>
