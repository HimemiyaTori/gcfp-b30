<script setup lang="ts">
import { ListMusic } from 'lucide-vue-next'
import { computed } from 'vue'
import ScoreFilters from '../components/ScoreFilters.vue'
import ScoreTable from '../components/ScoreTable.vue'
import type { ScoreRow } from '../db/models'
import { filterScores, hasScoreFilters, type ScoreFiltersState } from '../core/score/filter'
const filters = defineModel<ScoreFiltersState>('filters', { required: true })
const hasFilters = computed(() => hasScoreFilters(filters.value))
const props = defineProps<{ scores: ScoreRow[] }>()
const emit = defineEmits<{ edit: [score: ScoreRow]; remove: [score: ScoreRow] }>()
const filtered = computed(() => filterScores(props.scores, filters.value))
</script>

<template>
    <section class="panel">
        <div class="section-title between">
            <div class="row gap-2">
                <ListMusic :size="18" />
                <h2>成绩一览</h2>
            </div>
            <span class="count-badge">{{
                hasFilters
                    ? `显示 ${filtered.length} / ${scores.length} 张谱面`
                    : `共 ${scores.length} 张谱面`
            }}</span>
        </div>
        <ScoreFilters
            v-model:query="filters.query"
            v-model:category="filters.category"
            v-model:mode="filters.mode"
            v-model:difficulty="filters.difficulty"
        />
        <ScoreTable
            :items="filtered"
            editable
            @edit="emit('edit', $event)"
            @remove="emit('remove', $event)"
        />
    </section>
</template>
