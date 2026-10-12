<script setup lang="ts">
import { Activity, CircleHelp, Trophy } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ScoreFilters from '../components/ScoreFilters.vue'
import ScoreTable from '../components/ScoreTable.vue'
import { useScoreTable } from '../composables/useScoreTable'
import { filterScores, hasScoreFilters, type ScoreFiltersState } from '../core/score/filter'
import type { getModeB30, RatingMode } from '../core/rating/calculator'
const emit = defineEmits<{ song: [score: { songId: string; mode: string }] }>()
const filters = defineModel<ScoreFiltersState>('filters', { required: true })
const hasFilters = computed(() => hasScoreFilters(filters.value))
const props = defineProps<{ modeRatings: ReturnType<typeof getModeB30>[]; selectedRating: ReturnType<typeof getModeB30> }>()
const b30Mode = defineModel<RatingMode>('mode', { required: true })
const b30 = computed(() => props.selectedRating.items)
const filteredB30 = computed(() => filterScores(b30.value, filters.value))
const positions = computed(() => new Map(b30.value.map((row, index) => [row.id, index + 1])))
const { rows, sort, toggleSort, resetSort } = useScoreTable(filteredB30, { sortKey: 'position', ascending: true, ranked: true })
watch(b30Mode, resetSort)
const { t } = useI18n()
</script>

<template>
    <section
        class="mode-rating-grid"
        :aria-label="t('b30.modes')"
    >
        <button
            v-for="summary in modeRatings"
            :key="summary.mode"
            type="button"
            :class="[
                'rating-card',
                'mode-rating-card',
                {
                    selected:
                        b30Mode === summary.mode,
                    advanced: summary.mode === 'ADVANCED',
                },
            ]"
            :aria-pressed="
                b30Mode === summary.mode
            "
            :aria-label="t('b30.view', { mode: summary.label })"
            @click="b30Mode = summary.mode"
        >
            <div class="row gap-2">
                <Activity :size="16" /><strong>{{
                    summary.label
                }}</strong>
                <span>Groove Rating</span>
            </div>
            <div class="rating-values">
                <div class="big-rating">
                    {{ summary.rating.toFixed(2)
                    }}<span>RT</span>
                </div>
                <div class="rating-floor" lang="en">
                    <span>B30 Floor</span>
                    <strong :class="{ 'floor-empty': summary.floor == null }">{{
                        summary.floor?.toFixed(2) ?? '—'
                    }}</strong
                    ><span>RT</span>
                </div>
            </div>
            <div class="mode-progress" aria-hidden="true">
                <span
                    :style="{
                        width: `${(summary.items.length / 30) * 100}%`,
                    }"
                ></span>
            </div>
            <div class="metric-bottom">
                <span>{{
                    summary.count
                        ? `${t('b30.collected', { count: summary.count }, summary.count)} · ${summary.items.length < 30 ? t('b30.remaining', { count: 30 - summary.items.length }, 30 - summary.items.length) : t('b30.full')}`
                        : t('b30.empty')
                }}</span>
                <span>{{
                    b30Mode === summary.mode
                        ? t('b30.current')
                        : t('b30.open')
                }}</span>
            </div>
        </button>
    </section>


    <section class="panel">
        <div class="section-title between">
            <div class="row gap-2">
                <Trophy :size="18" />
                <h2>{{ selectedRating.label }} · Best 30</h2>
            </div>
            <span class="count-badge">{{
                hasFilters
                    ? t('count.showing', { shown: filteredB30.length, total: b30.length }, b30.length)
                    : t('count.total', { total: b30.length }, b30.length)
            }}</span>
        </div>
        <ScoreFilters
            v-model:query="filters.query"
            v-model:category="filters.category"
            :mode="b30Mode"
            hide-mode
            v-model:difficulty="filters.difficulty"
            v-model:level-min="filters.levelMin"
            v-model:level-max="filters.levelMax"
        />
        <ScoreTable @song="emit('song', $event)"
            :items="rows"
            :sort="sort"
            :positions="positions"
            hide-mode
            ranked
            @sort="toggleSort"
        />
    </section>
    <p class="rating-explainer">
        <CircleHelp :size="15" /> {{ t('b30.explainer') }}
    </p>
</template>
