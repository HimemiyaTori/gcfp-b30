<script setup lang="ts">
import { Search, SlidersHorizontal } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { songLanguage } from '../composables/useSettings'
import { sanitizeLevelInput } from '../core/score/filter'
import { songCategories, type SongCategory } from '../data/categories'

defineProps<{ hideMode?: boolean }>()
const { t } = useI18n()

const query = defineModel<string>('query', { required: true })
const category = defineModel<SongCategory | 'ALL'>('category', { required: true })
const mode = defineModel<string>('mode', { required: true })
const difficulty = defineModel<string>('difficulty', { required: true })
const levelMin = defineModel<string>('levelMin', { required: true })
const levelMax = defineModel<string>('levelMax', { required: true })

function writeLevel(event: Event, target: 'min' | 'max') {
    const input = event.target as HTMLInputElement
    const next = sanitizeLevelInput(input.value)
    input.value = next
    if (target === 'min') levelMin.value = next
    else levelMax.value = next
}
</script>

<template>
    <div class="filter-bar">
        <label class="search-field"
            ><Search :size="17" /><input
                v-model="query"
                :placeholder="t('filters.searchPlaceholder')"
                :aria-label="t('filters.search')"
        /></label>
        <div class="row gap-2">
            <SlidersHorizontal :size="16" />
            <select v-model="category" class="category-select" :aria-label="t('filters.category')">
                <option value="ALL">{{ t('filters.allCategories') }}</option>
                <option
                    v-for="item in songCategories"
                    :key="item.id"
                    :value="item.id">
                    {{ item[songLanguage] }}
                </option>
            </select>
            <select v-if="!hideMode" v-model="mode" :aria-label="t('filters.mode')">
                <option value="ALL">{{ t('filters.allModes') }}</option>
                <option>BASIC</option>
                <option>ADVANCED</option>
            </select>
            <select v-model="difficulty" :aria-label="t('filters.difficulty')">
                <option value="ALL">{{ t('filters.allDifficulties') }}</option>
                <option>MASTER</option>
                <option>HARD</option>
                <option>NORMAL</option>
                <option>EASY</option>
            </select>
            <div class="level-range" role="group" :aria-label="t('filters.level')">
                <input
                    :value="levelMin"
                    placeholder="1"
                    :aria-label="t('filters.levelMin')"
                    inputmode="text"
                    autocomplete="off"
                    @input="writeLevel($event, 'min')"
                />
                <span aria-hidden="true">–</span>
                <input
                    :value="levelMax"
                    placeholder="14+"
                    :aria-label="t('filters.levelMax')"
                    inputmode="text"
                    autocomplete="off"
                    @input="writeLevel($event, 'max')"
                />
            </div>
        </div>
    </div>
</template>
