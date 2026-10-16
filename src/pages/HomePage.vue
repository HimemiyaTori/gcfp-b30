<script setup lang="ts">
import {
    Activity,
    ArrowRight,
    ArrowLeftRight,
    CircleHelp,
    Disc3,
    FileImage,
    History,
    ShieldCheck,
    Sparkles,
    Upload,
} from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ScoreTable from '../components/ScoreTable.vue'
import { useScoreHistory } from '../composables/useScoreHistory'
import { useRatingSnapshots } from '../composables/useRatingSnapshots'
import { useRecognitionSummary } from '../db/recognitionRepository'
import RatingTrend, { type RatingGrain } from '../components/RatingTrend.vue'
import RollingNumber from '../components/common/RollingNumber.vue'
import type { ScoreRow } from '../db/models'
import type { getModeB30, RatingMode } from '../core/rating/calculator'
defineProps<{
    scores: ScoreRow[]
    historyCount: number
    selectedRating: ReturnType<typeof getModeB30>
}>()
const grain = defineModel<RatingGrain>('grain', { required: true })
const b30Mode = defineModel<RatingMode>('mode', { required: true })
const emit = defineEmits<{ upload: [files: File[]]; song: [row: { songId: string; mode: string }]; viewLast: [] }>()
const { t, locale } = useI18n()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const { rows, sort, toggleSort, page, pagination, error, loading, reload } = useScoreHistory()
const { snapshots, error: trendError, loading: trendLoading, reload: reloadTrend } = useRatingSnapshots()
const lastRun = useRecognitionSummary('manual')
function selectFiles(files: FileList | null) {
    const selected = Array.from(files ?? [])
    if (fileInput.value) fileInput.value.value = ''
    if (selected.length) emit('upload', selected)
}
function drop(event: DragEvent) {
    dragging.value = false
    selectFiles(event.dataTransfer?.files ?? null)
}
</script>

<template>
    <section v-if="scores.length" class="stats-grid">
        <article class="rating-card">
            <div class="row gap-2">
                <Activity :size="16" /><span>Groove Rating</span>
                <button
                    type="button"
                    :class="[
                        'metric-tag',
                        'rating-mode-toggle',
                        { advanced: b30Mode === 'ADVANCED' },
                    ]"
                    :aria-label="t('home.modeToggle', { current: selectedRating.label, next: b30Mode === 'BASIC' ? 'ADV' : 'BAS' })"
                    @click="
                        b30Mode = b30Mode === 'BASIC' ? 'ADVANCED' : 'BASIC'
                    "
                >
                    <Transition name="mode-label" mode="out-in"
                        ><span :key="b30Mode">{{
                            b30Mode === 'BASIC' ? 'BAS' : 'ADV'
                        }}</span></Transition
                    >
                    <ArrowLeftRight :size="12" />
                </button>
            </div>
            <div class="rating-values">
                <div class="big-rating">
                    <RollingNumber
                        :value="selectedRating.rating"
                        :decimals="2"
                        :motion-key="b30Mode"
                    /><span>RT</span>
                </div>
                <div class="rating-floor" lang="en">
                    <span>Floor</span>
                    <strong :class="{ 'floor-empty': selectedRating.floor == null }">{{
                        selectedRating.floor?.toFixed(2) ?? '—'
                    }}</strong
                    ><span>RT</span>
                </div>
            </div>
            <div class="metric-bottom">
                {{ t('home.ratingTagline') }} <span>↗</span>
            </div>
            <div class="orbit orbit-one"></div>
            <div class="orbit orbit-two"></div>
        </article>
        <article class="stat-card">
            <div class="between">
                <span>{{ t('home.collected') }}</span
                ><span class="stat-icon blue"><Disc3 :size="18" /></span>
            </div>
            <div class="stat-metrics">
                <div class="stat-value">
                    <RollingNumber :value="scores.length" />
                    <span>{{ t('home.charts') }}</span>
                </div>
                <div class="stat-value">
                    <RollingNumber :value="historyCount" />
                    <span>{{ t('home.history') }}</span>
                </div>
            </div>
            <small>{{ t('home.bestPerChart') }}</small>
            <a href="#scores" class="text-link"
                >{{ t('home.viewAll') }} <ArrowRight :size="13"
            /></a>
        </article>
    </section>

    <template v-if="scores.length || snapshots.length">
        <div v-if="trendError" class="panel error" role="alert">
            {{ trendError }}
            <button class="button secondary" @click="reloadTrend">{{ t('common.retry') }}</button>
        </div>
        <p v-else-if="trendLoading" role="status">{{ t('app.loading') }}</p>
        <RatingTrend v-else :snapshots="snapshots" :mode="b30Mode" v-model:grain="grain" />
    </template>
    <section class="import-grid">
        <article class="panel import-panel">
            <div class="section-title between">
                <div class="row gap-2">
                    <Upload :size="18" />
                    <h2>{{ t('home.importTitle') }}</h2>
                </div>
                <span class="micro-label">SCORE IMPORT</span>
            </div>
            <label
                :class="['drop-zone', { dragging }]"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="drop"
            >
                <div class="upload-illustration">
                    <div class="image-sheet back"></div>
                    <div class="image-sheet">
                        <FileImage :size="33" :stroke-width="1.3" /><span
                            class="plus-bubble"
                            >+</span
                        >
                    </div>
                </div>
                <h3>
                    <span class="drop-title-full">{{ t('home.dropTitle') }}</span>
                    <span class="drop-title-mobile">{{ t('home.dropTitleMobile') }}</span>
                </h3>
                <input
                    ref="fileInput"
                    class="drop-zone-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.xlsx"
                    multiple
                    :aria-label="t('home.fileInput')"
                    @change="
                        selectFiles(($event.target as HTMLInputElement).files)
                    "
                /><small>{{ t('home.dropHint') }}</small>
            </label>
            <div class="import-foot between">
                <span class="row gap-2"
                    ><ShieldCheck :size="14" /> {{ t('home.localOnly') }}</span
                >
                <button
                    v-if="lastRun"
                    type="button"
                    class="text-link"
                    :title="new Date(lastRun.finishedAt).toLocaleString(locale)"
                    @click="emit('viewLast')"
                >
                    <History :size="14" />{{ t('home.lastRun', { count: lastRun.total }, lastRun.total) }}
                </button>
            </div>
        </article>
        <article class="guide-panel">
            <div class="row gap-2">
                <Sparkles :size="17" />
                <h2>{{ t('home.guideTitle') }}</h2>
            </div>
            <p class="guide-intro">{{ t('home.guideIntro') }}</p>
            <div
                v-for="(step, i) in ['add', 'recognize', 'grow']"
                :key="step"
                class="guide-step"
            >
                <span>{{ String(i + 1).padStart(2, '0') }}</span>
                <div>
                    <h3>{{ t(`home.steps.${step}.title`) }}</h3>
                    <p>{{ t(`home.steps.${step}.text`) }}</p>
                </div>
            </div>
            <div class="guide-tip">
                <CircleHelp :size="16" />
                <p>
                    {{ t('home.tipFix') }}<br />{{ t('home.tipManual') }}
                </p>
            </div>
        </article>
    </section>

    <section class="panel">
        <div class="section-title between">
            <div class="row gap-2">
                <h2>{{ t('home.recent') }}</h2>
                <span class="count-badge">{{ historyCount }}</span
                ><span class="muted section-subtitle"
                    >{{ t('home.recentSubtitle') }}</span
                >
            </div>
            <a class="text-link" href="#scores"
                >{{ t('home.manage') }} <ArrowRight :size="14"
            /></a>
        </div>
        <div class="history-table">
            <ScoreTable
                :items="rows"
                :sort="sort"
                :pagination="pagination"
                :error="error"
                :loading="loading"
                time-key="importedAt"
                :empty-title="t('table.noHistory')"
                empty-description=""
                @sort="toggleSort"
                @page="page = $event"
                @retry="reload"
                @song="emit('song', $event)"
            />
        </div>
    </section>
</template>
