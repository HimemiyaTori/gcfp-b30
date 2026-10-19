<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
    songLanguage,
    theme,
    uiLanguage,
    uiLanguages,
} from '../composables/useSettings'
defineProps<{
    count: number
    historyCount: number
    canWrite: boolean
    excelBusy: boolean
}>()
const emit = defineEmits<{ clear: []; import: []; export: []; template: [] }>()
const { t } = useI18n()
</script>

<template>
    <slot name="account" />
    <section class="panel settings-panel">
        <div class="section-title">
            <h2>{{ t('settings.appearance') }}</h2>
        </div>
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
                    :aria-label="option.label"
                    :class="{
                        selected: uiLanguage === option.id,
                        'english-language-option': option.id === 'en',
                    }"
                    :aria-pressed="uiLanguage === option.id"
                    @click="uiLanguage = option.id"
                >
                    <template
                        v-if="
                            option.id === 'zh-CN' ||
                            option.id === 'zh-TW' ||
                            option.id === 'ja'
                        "
                    >
                        {{ option.label.slice(0, 2) }}<wbr />{{
                            option.label.slice(2)
                        }}
                    </template>
                    <template v-else>
                        <span class="language-label-full">{{ option.label }}</span>
                        <span class="language-label-short" aria-hidden="true">EN</span>
                    </template>
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
                    class="english-language-option"
                    aria-label="English"
                    :class="{ selected: songLanguage === 'en' }"
                    @click="songLanguage = 'en'"
                >
                    <span class="language-label-full">English</span>
                    <span class="language-label-short" aria-hidden="true">EN</span>
                </button>
            </div>
        </div>
    </section>
    <section class="panel settings-panel">
        <div class="section-title">
            <h2>{{ t('settings.localData') }}</h2>
        </div>
        <div class="setting-row local-data-row">
            <div class="local-data-copy">
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
        <div class="setting-row local-data-row">
            <div class="local-data-copy">
                <h3>{{ t('settings.clear') }}</h3>
                <p>
                    {{
                        t('settings.clearDescription', {
                            history: historyCount,
                        })
                    }}
                </p>
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
.english-language-option {
    container-type: inline-size;
    container-name: english-language-option;
    contain-intrinsic-inline-size: 3.5em;
}
.language-label-short {
    display: none;
}
@container english-language-option (max-width: 3.25em) {
    .language-label-full {
        display: none;
    }
    .language-label-short {
        display: inline;
    }
}
.local-data-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 20px 25px;
}
.local-data-copy {
    flex: 1 1 24rem;
    min-width: 0;
}
.excel-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-width: 100%;
}
.excel-actions .button {
    min-width: 0;
    min-height: 44px;
    text-wrap: balance;
}
.local-data-row > .button {
    flex-shrink: 0;
    min-height: 44px;
    white-space: nowrap;
}
@media (max-width: 520px) {
    .excel-actions {
        grid-template-columns: minmax(0, 1fr);
        width: 100%;
    }
}
</style>
