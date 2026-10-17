<script setup lang="ts">
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-vue-next'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { songLanguage } from '../composables/useSettings'
import { sanitizeLevelInput } from '../core/score/filter'
import { songCategories, type SongCategory } from '../data/categories'

const props = defineProps<{ hideMode?: boolean }>()
const { t } = useI18n()
const expanded = ref(false)
const controlsId = useId()

const query = defineModel<string>('query', { required: true })
const category = defineModel<SongCategory | 'ALL'>('category', { required: true })
const mode = defineModel<string>('mode', { required: true })
const difficulty = defineModel<string>('difficulty', { required: true })
const levelMin = defineModel<string>('levelMin', { required: true })
const levelMax = defineModel<string>('levelMax', { required: true })
type FilterKey = 'category' | 'mode' | 'difficulty' | 'level'
const activeFilters = computed(() => {
    const filters: { key: FilterKey; label: string }[] = []
    if (category.value !== 'ALL') filters.push({ key: 'category', label: songCategories.find(item => item.id === category.value)?.[songLanguage.value] ?? category.value })
    if (!props.hideMode && mode.value !== 'ALL') filters.push({ key: 'mode', label: mode.value })
    if (difficulty.value !== 'ALL') filters.push({ key: 'difficulty', label: difficulty.value })
    if (levelMin.value || levelMax.value) filters.push({ key: 'level', label: `${levelMin.value || '1'}–${levelMax.value || '14+'}` })
    return filters
})
function clearFilter(key: FilterKey) {
    if (key === 'category') category.value = 'ALL'
    if (key === 'mode') mode.value = 'ALL'
    if (key === 'difficulty') difficulty.value = 'ALL'
    if (key === 'level') {
        levelMin.value = ''
        levelMax.value = ''
    }
}
function clearFilters() {
    for (const filter of activeFilters.value) clearFilter(filter.key)
}

function writeLevel(event: Event, target: 'min' | 'max') {
    const input = event.target as HTMLInputElement
    const next = sanitizeLevelInput(input.value)
    input.value = next
    if (target === 'min') levelMin.value = next
    else levelMax.value = next
}
</script>

<template>
    <div class="filter-bar" :class="{ 'filters-expanded': expanded }">
        <label class="search-field"
            ><Search :size="17" /><input
                v-model="query"
                :placeholder="t('filters.searchPlaceholder')"
                :aria-label="t('filters.search')"
        /></label>
        <button type="button" class="filter-toggle" :aria-expanded="expanded" :aria-controls="controlsId" @click="expanded = !expanded">
            <SlidersHorizontal :size="17" />
            <span>{{ t('filters.toggle') }}<template v-if="activeFilters.length"> · {{ activeFilters.length }}</template></span>
            <ChevronDown :size="15" />
        </button>
        <div
            :id="controlsId"
            class="row gap-2 filter-controls"
            :class="{ 'filter-controls-single-mode': hideMode }"
        >
            <SlidersHorizontal class="filter-icon" :size="16" />
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
        <div v-if="activeFilters.length" class="filter-chips" role="group" :aria-label="t('filters.active')">
            <button v-for="filter in activeFilters" :key="filter.key" type="button" class="filter-chip" :aria-label="t('filters.remove', { label: filter.label })" @click="clearFilter(filter.key)">
                <span>{{ filter.label }}</span><X :size="13" />
            </button>
            <button type="button" class="filter-clear" @click="clearFilters">{{ t('filters.clear') }}</button>
        </div>
    </div>
</template>
