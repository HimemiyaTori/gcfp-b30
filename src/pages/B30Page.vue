<script setup lang="ts">
import { Activity, CircleHelp, Trophy } from 'lucide-vue-next'
import { computed } from 'vue'
import ScoreFilters from '../components/ScoreFilters.vue'
import ScoreTable from '../components/ScoreTable.vue'
import { filterScores, hasScoreFilters, type ScoreFiltersState } from '../core/score/filter'
import type { getModeB30, RatingMode } from '../core/rating/calculator'
const filters = defineModel<ScoreFiltersState>('filters', { required: true })
const hasFilters = computed(() => hasScoreFilters(filters.value))
const props = defineProps<{ modeRatings: ReturnType<typeof getModeB30>[]; selectedRating: ReturnType<typeof getModeB30> }>()
const b30Mode = defineModel<RatingMode>('mode', { required: true })
const b30 = computed(() => props.selectedRating.items)
const filteredB30 = computed(() => filterScores(b30.value, filters.value))
</script>

<template>
    <section
        class="mode-rating-grid"
        aria-label="各模式 Groove Rating"
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
            :aria-label="`查看 ${summary.label} Best 30`"
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
                <div class="rating-floor">
                    <span>B30 Floor</span>
                    <strong>{{
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
                        ? `已收录 ${summary.count} 张谱面 · ${summary.items.length < 30 ? `还差 ${30 - summary.items.length} 张填满 B30` : '已填满 B30'}`
                        : '暂无成绩 · 录入此模式成绩后自动计算'
                }}</span>
                <span>{{
                    b30Mode === summary.mode
                        ? '当前榜单'
                        : '查看榜单 →'
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
                    ? `显示 ${filteredB30.length} / ${b30.length} 张谱面`
                    : `共 ${b30.length} 张谱面`
            }}</span>
        </div>
        <ScoreFilters
            v-model:query="filters.query"
            v-model:category="filters.category"
            :mode="b30Mode"
            hide-mode
            v-model:difficulty="filters.difficulty"
        />
        <ScoreTable
            :key="b30Mode"
            :items="filteredB30"
            :position-items="b30"
            hide-mode
            ranked
        />
    </section>
    <p class="rating-explainer">
        <CircleHelp :size="15" /> 每个模式独立取前 30
        张谱面，Groove Rating = 该模式 B30 Rating 之和 ÷
        30，不足 30 张按 0 补足。Floor
        为该模式最后一张入选谱面的
        Rating；搜索和筛选不改变入选结果。
    </p>
</template>
