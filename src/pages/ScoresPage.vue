<script setup lang="ts">
import { ArrowLeftRight, ListMusic } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ScoreFilters from '../components/ScoreFilters.vue'
import ScoreTable from '../components/ScoreTable.vue'
import { songLanguage } from '../composables/useSettings'
import { useScoreTable } from '../composables/useScoreTable'
import { isPlayedChart, listLibraryCharts, type UnplayedChartRow } from '../core/score/catalog'
import { filterScores, hasScoreFilters, type ScoreFiltersState } from '../core/score/filter'
import type { ScoreRow } from '../db/models'
const { t } = useI18n()
const filters = defineModel<ScoreFiltersState>('filters', { required: true })
const showAll = ref(false)
const hasFilters = computed(() => hasScoreFilters(filters.value))
const props = defineProps<{ scores: ScoreRow[] }>()
const emit = defineEmits<{ edit: [score: ScoreRow]; add: [chart: UnplayedChartRow]; song: [score: { songId: string; mode: string }] }>()
const library = computed(() => listLibraryCharts(props.scores, songLanguage.value))
const source = computed(() => showAll.value ? library.value : props.scores)
const filtered = computed(() => filterScores(source.value, filters.value))
const playedInView = computed(() => filtered.value.filter(isPlayedChart).length)
const countLabel = computed(() => {
    const total = showAll.value ? library.value.length : props.scores.length
    const base = hasFilters.value
        ? t('count.showing', { shown: filtered.value.length, total }, total)
        : showAll.value
          ? t('count.library', { total }, total)
          : t('count.total', { total }, total)
    if (!showAll.value) return base
    return `${base} · ${t('count.played', { count: hasFilters.value ? playedInView.value : props.scores.length })}`
})
const { rows, sort, toggleSort, page, pagination } = useScoreTable(filtered, { sortKey: 'updatedAt', pageSize: 30 })
</script>

<template>
    <section class="panel">
        <div class="section-title between scores-heading" :class="{ 'scores-all': showAll }">
            <button
                type="button"
                class="scores-scope-hit"
                :aria-pressed="showAll"
                :aria-label="t('scores.scopeToggle', { current: showAll ? t('scores.all') : t('scores.played'), next: showAll ? t('scores.played') : t('scores.all') })"
                @click="showAll = !showAll"
            ></button>
            <div class="row gap-2">
                <ListMusic :size="18" />
                <h2>{{ t('scores.title') }}</h2>
            </div>
            <div class="row gap-2 scores-heading-tools">
                <div class="segmented compact" role="group" :aria-label="t('scores.scope')">
                    <button type="button" :class="{ selected: !showAll }" :aria-pressed="!showAll" @click="showAll = false">{{ t('scores.played') }}</button>
                    <button type="button" :class="{ selected: showAll }" :aria-pressed="showAll" @click="showAll = true">{{ t('scores.all') }}</button>
                </div>
                <span class="count-badge">{{ countLabel }}</span>
                <span class="scores-scope-hint" aria-hidden="true"><ArrowLeftRight :size="13" /></span>
            </div>
        </div>
        <ScoreFilters
            v-model:query="filters.query"
            v-model:category="filters.category"
            v-model:mode="filters.mode"
            v-model:difficulty="filters.difficulty"
            v-model:level-min="filters.levelMin"
            v-model:level-max="filters.levelMax"
        />
        <ScoreTable
            :items="rows"
            :sort="sort"
            :pagination="pagination"
            row-key="chartId"
            editable
            :empty-title="showAll ? t('scores.noCharts') : t('table.empty')"
            :empty-description="showAll ? t('scores.noChartsHint') : t('table.emptyHint')"
            @sort="toggleSort"
            @page="page = $event"
            @edit="emit('edit', $event)"
            @add="emit('add', $event)"
            @song="emit('song', $event)"
        />
    </section>
</template>
