<script setup lang="ts">
import { ListMusic } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import ScoreFilters from '../components/ScoreFilters.vue'
import ScoreTable from '../components/ScoreTable.vue'
import { songLanguage } from '../composables/useSettings'
import { useScoreTable } from '../composables/useScoreTable'
import { isPlayedChart, listLibraryCharts, type UnplayedChartRow } from '../core/score/catalog'
import { filterScores, hasScoreFilters, type ScoreFiltersState } from '../core/score/filter'
import type { ScoreRow } from '../db/models'
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
    if (!showAll.value) return hasFilters.value ? `显示 ${filtered.value.length} / ${props.scores.length} 张谱面` : `共 ${props.scores.length} 张谱面`
    return hasFilters.value
        ? `显示 ${filtered.value.length} / ${library.value.length} 张谱面 · 已有成绩 ${playedInView.value}`
        : `曲库 ${library.value.length} 张谱面 · 已有成绩 ${props.scores.length}`
})
const { rows, sort, toggleSort, page, pagination } = useScoreTable(filtered, { sortKey: 'updatedAt', pageSize: 30 })
</script>

<template>
    <section class="panel">
        <div class="section-title between scores-heading">
            <div class="row gap-2">
                <ListMusic :size="18" />
                <h2>成绩一览</h2>
            </div>
            <div class="row gap-2 scores-heading-tools">
                <div class="segmented compact" role="group" aria-label="谱面范围">
                    <button type="button" :class="{ selected: !showAll }" :aria-pressed="!showAll" @click="showAll = false">已有成绩</button>
                    <button type="button" :class="{ selected: showAll }" :aria-pressed="showAll" @click="showAll = true">全部谱面</button>
                </div>
                <span class="count-badge">{{ countLabel }}</span>
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
            :empty-title="showAll ? '没有符合条件的谱面' : '暂时没有成绩'"
            :empty-description="showAll ? '试试其他搜索或筛选条件。' : '试试其他筛选条件，或录入你的第一份成绩。'"
            @sort="toggleSort"
            @page="page = $event"
            @edit="emit('edit', $event)"
            @add="emit('add', $event)"
            @song="emit('song', $event)"
        />
    </section>
</template>
