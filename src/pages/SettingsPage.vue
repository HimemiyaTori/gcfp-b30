<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
    songLanguage,
    theme,
    uiLanguages,
    uiLanguage,
} from '../composables/useSettings'
defineProps<{ count: number; historyCount: number; canWrite: boolean; excelBusy: boolean }>()
const emit = defineEmits<{ clear: []; import: []; export: []; template: [] }>()
const { t } = useI18n()
</script>

<template>
    <slot name="account" />
    <section class="panel settings-panel">
        <div class="section-title"><h2>{{ t('settings.appearance') }}</h2></div>
        <div class="setting-row">
            <div>
                <h3>{{ t('settings.theme') }}</h3>
                <p>{{ t('settings.themeDescription') }}</p>
            </div>
            <div class="theme-options">
                <button
                    v-for="option in [
                        { id: 'light', icon: Sun },
                        { id: 'dark', icon: Moon },
                        { id: 'system', icon: Monitor },
                    ] as const"
                    :key="option.id"
                    :class="{ selected: theme === option.id }"
                    @click="theme = option.id"
                >
                    <component :is="option.icon" :size="21" />
                    <span>{{ t(`settings.themes.${option.id}`) }} </span>
                    <Check v-if="theme === option.id" :size="13" />
                </button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>{{ t('settings.uiLanguage') }}</h3>
                <p>{{ t('settings.uiLanguageDescription') }}</p>
            </div>
            <div
                class="segmented ui-settings-options"
                role="group"
                :aria-label="t('settings.uiLanguage')"
            >
                <button
                    v-for="option in uiLanguages"
                    :key="option.id"
                    type="button"
                    :lang="option.id"
                    :class="{
                        selected: uiLanguage === option.id,
                    }"
                    :aria-pressed="uiLanguage === option.id"
                    @click="uiLanguage = option.id"
                >
                    {{ option.label }}
                </button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>{{ t('settings.songLanguage') }}</h3>
                <p>{{ t('settings.songLanguageDescription') }}</p>
            </div>
            <div class="segmented">
                <button
                    :class="{ selected: songLanguage === 'ja' }"
                    @click="songLanguage = 'ja'"
                >
                    日本語
                </button>
                <button
                    :class="{ selected: songLanguage === 'en' }"
                    @click="songLanguage = 'en'"
                >
                    English
                </button>
            </div>
        </div>
    </section>
    <section class="panel settings-panel">
        <div class="section-title"><h2>{{ t('settings.localData') }}</h2></div>
        <div class="setting-row">
            <div>
                <h3>{{ t('settings.excel') }}</h3>
                <p>{{ t('settings.excelDescription', { count }) }}</p>
                <p>{{ t('settings.excelTemplateDescription') }}</p>
                <p v-if="excelBusy" role="status">
                    {{ t('settings.excelBusy') }}
                </p>
            </div>
            <div class="excel-actions">
                <button
                    class="button secondary"
                    :disabled="excelBusy"
                    @click="emit('template')"
                >
                    {{ t('settings.downloadTemplate') }}
                </button>
                <button
                    class="button secondary"
                    :disabled="excelBusy || !canWrite || !count"
                    @click="emit('export')"
                >
                    {{ t('settings.exportScores') }}
                </button>
                <button
                    class="button secondary"
                    :disabled="excelBusy || !canWrite"
                    @click="emit('import')"
                >
                    {{ t('settings.importScores') }}
                </button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>{{ t('settings.clear') }}</h3>
                <p>{{ t('settings.clearDescription', { history: historyCount }) }}</p>
            </div>
            <button
                class="button secondary danger-button"
                :disabled="!canWrite || excelBusy"
                @click="emit('clear')"
            >
                {{ t('settings.clearButton') }}
            </button>
        </div>
    </section>
</template>

<style scoped>
.excel-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
    flex-shrink: 0;
    max-width: 360px;
}
@media (max-width: 680px) {
    .excel-actions {
        justify-content: flex-start;
        max-width: 100%;
    }
}
</style>
