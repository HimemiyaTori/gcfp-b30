<script setup lang="ts">
import { liveQuery } from 'dexie'
import { ChevronDown, History, X } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useScoreHistory } from '../../composables/useScoreHistory'
import { songLanguage } from '../../composables/useSettings'
import type { Chart } from '../../core/song/models'
import {
    formatLevel,
    formatSongPack,
    getSongArtist,
    getSongTitle,
    songService,
} from '../../core/song/songService'
import { songCategories } from '../../data/categories'
import { database } from '../../db/database'
import type { ScoreRow } from '../../db/models'
import ScoreTable from '../ScoreTable.vue'
import SongCover from '../SongCover.vue'
import ScoreDeleteDialog from './ScoreDeleteDialog.vue'
const chartFields: { key: keyof Chart; label: string }[] = [
    { key: 'note', label: 'note数' },
    { key: 'special', label: '特殊note' },
    { key: 'combo', label: '总连击' },
    { key: 'circle', label: '圆圈' },
    { key: 'goldCircle', label: '特殊圆圈' },
    { key: 'hold', label: '长按' },
    { key: 'goldHold', label: '特殊长按' },
    { key: 'arrow', label: '滑动' },
    { key: 'goldArrow', label: '特殊滑动' },
    { key: 'square', label: '方块' },
    { key: 'goldSquare', label: '特殊方块' },
    { key: 'advNote', label: '进阶note' },
    { key: 'blueCircle', label: '蓝色圆圈' },
    { key: 'redCircle', label: '红色圆圈' },
    { key: 'advHold', label: '进阶长按' },
    { key: 'advArrow', label: '进阶滑动' },
    { key: 'blueArrow', label: '蓝色滑动' },
    { key: 'redArrow', label: '红色滑动' },
]
const props = defineProps<{ canWrite: boolean; scores: ScoreRow[] }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const dialog = ref<HTMLDialogElement>(),
    deletion = ref<InstanceType<typeof ScoreDeleteDialog>>()
const songId = ref(''),
    mode = ref('BASIC'),
    active = ref(false),
    notesOpen = ref(false),
    playCounts = ref(new Map<string, number>())
let playSubscription: { unsubscribe(): void } | undefined
const { rows, sort, toggleSort, page, pagination, error, loading, reload } =
    useScoreHistory({ songId, mode, pageSize: 30, enabled: active })
const song = computed(() => songService.getSong(songId.value))
const charts = computed(
    () =>
        song.value?.charts.filter(
            (chart) => chart.mode.toUpperCase() === mode.value,
        ) ?? [],
)
const best = computed(
    () =>
        new Map(
            props.scores
                .filter((row) => row.songId === songId.value)
                .map((row) => [row.chartId, row]),
        ),
)
const vocalName = computed(() =>
    (
        song.value?.vocal?.[songLanguage.value] ||
        song.value?.vocal?.ja ||
        ''
    ).trim(),
)
const packName = computed(() =>
    formatSongPack(song.value?.pack, songLanguage.value),
)
watch([songId, active], () => {
    playSubscription?.unsubscribe()
    playSubscription = undefined
    const id = songId.value
    if (!active.value || !id) {
        playCounts.value = new Map()
        return
    }
    playSubscription = liveQuery(() =>
        database.scoreHistory.where('songId').equals(id).toArray(),
    ).subscribe({
        next(records) {
            if (songId.value !== id) return
            const counts = new Map<string, number>()
            for (const record of records)
                counts.set(
                    record.chartId,
                    (counts.get(record.chartId) ?? 0) + 1,
                )
            playCounts.value = counts
        },
    })
})
onUnmounted(() => playSubscription?.unsubscribe())
function closeOnOutside(event: MouseEvent) {
    const element = dialog.value
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const { clientX, clientY } = event
    if (
        clientX < bounds.left ||
        clientX > bounds.right ||
        clientY < bounds.top ||
        clientY > bounds.bottom
    )
        element.close()
}
function open(row: { songId: string; mode: string }) {
    songId.value = row.songId
    mode.value = row.mode
    notesOpen.value = false
    active.value = true
    if (!dialog.value?.open) dialog.value?.showModal()
}
defineExpose({ open })
</script>
<template>
    <dialog
        ref="dialog"
        class="editor-dialog song-dialog"
        aria-labelledby="song-details-title"
        @click="closeOnOutside"
        @close="active = false"
    >
        <template v-if="song && active">
            <div class="between">
                <h2 id="song-details-title">歌曲信息</h2>
                <button
                    class="icon-button"
                    aria-label="关闭歌曲信息"
                    @click="dialog?.close()"
                >
                    <X :size="20" />
                </button>
            </div>
            <div class="song-identity">
                <SongCover :src="song.coverSourceUrl" :size="110" />
                <div>
                    <h3>{{ getSongTitle(song, songLanguage) }}</h3>
                    <p>{{ getSongArtist(song, songLanguage) }}</p>
                </div>
            </div>
            <dl class="song-metadata">
                <div v-if="vocalName">
                    <dt>歌手</dt>
                    <dd>{{ vocalName }}</dd>
                </div>
                <div>
                    <dt>分类</dt>
                    <dd>
                        {{
                            songCategories.find(
                                (category) => category.id === song!.genre,
                            )?.[songLanguage] ||
                            song.genre ||
                            '--'
                        }}
                    </dd>
                </div>
                <div>
                    <dt>BPM</dt>
                    <dd>
                        {{ song.bpm || '--'
                        }}{{ song.bpmMax ? ` - ${song.bpmMax}` : '' }}
                    </dd>
                </div>
                <div v-if="packName">
                    <dt>曲包</dt>
                    <dd>{{ packName }}</dd>
                </div>
            </dl>
            <div class="chart-heading">
                <h3>谱面信息</h3>
                <div
                    class="segmented chart-mode"
                    role="group"
                    aria-label="歌曲模式"
                >
                    <button
                        v-for="item in ['BASIC', 'ADVANCED']"
                        :key="item"
                        :class="{ selected: mode === item }"
                        :aria-pressed="mode === item"
                        @click="mode = item"
                    >
                        {{ item }}
                    </button>
                </div>
            </div>
            <div class="chart-details-grid">
                <article
                    v-for="chart in charts"
                    :key="chart.id"
                    class="chart-detail"
                    :class="chart.difficulty"
                >
                    <div class="chart-body">
                        <div class="chart-copy">
                            <div class="chart-level">
                                Lv. {{ formatLevel(chart.level) }}
                            </div>
                            <p
                                class="chart-score"
                                :class="{ 'is-empty': !best.get(chart.id) }"
                            >
                                {{
                                    best
                                        .get(chart.id)
                                        ?.score.toLocaleString('en-US') ?? '--'
                                }}
                            </p>
                            <span class="chart-caption">最高成绩</span>
                            <div class="chart-metrics">
                                <div>
                                    <strong
                                        :class="{
                                            'is-empty': !best.get(chart.id),
                                        }"
                                        >{{
                                            best
                                                .get(chart.id)
                                                ?.rating.toFixed(2) ?? '--'
                                        }}</strong
                                    >
                                    <span>Rating</span>
                                </div>
                                <div>
                                    <strong
                                        :class="{
                                            'is-empty': !playCounts.get(
                                                chart.id,
                                            ),
                                        }"
                                        >{{
                                            playCounts.get(chart.id) ?? 0
                                        }}</strong
                                    >
                                    <span>游玩次数</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                class="chart-notes-toggle"
                                :aria-expanded="notesOpen"
                                @click="notesOpen = !notesOpen"
                            >
                                物量详情
                                <ChevronDown :size="14" />
                            </button>
                        </div>
                        <span class="chart-watermark" aria-hidden="true">{{
                            chart.difficulty.toUpperCase()
                        }}</span>
                    </div>
                    <dl v-if="notesOpen">
                        <template v-for="field in chartFields" :key="field.key">
                            <dt
                                :class="{
                                    'is-empty': chart[field.key] == null,
                                }"
                            >
                                {{ field.label }}
                            </dt>
                            <dd
                                :class="{
                                    'is-empty': chart[field.key] == null,
                                }"
                            >
                                {{ chart[field.key] ?? '--' }}
                            </dd>
                        </template>
                    </dl>
                </article>
            </div>
            <section class="panel song-history">
                <div class="section-title between">
                    <div class="row gap-2">
                        <History :size="18" />
                        <h2>历史成绩</h2>
                    </div>
                    <span class="count-badge"
                        >共 {{ pagination.total }} 条</span
                    >
                </div>
                <div class="history-table">
                    <ScoreTable
                        :items="rows"
                        :sort="sort"
                        :pagination="pagination"
                        :error="error"
                        :loading="loading"
                        time-key="importedAt"
                        empty-title="暂无历史成绩"
                        empty-description=""
                        deletable
                        :can-write="canWrite"
                        @sort="toggleSort"
                        @page="page = $event"
                        @retry="reload"
                        @remove="deletion?.open($event)"
                        @song="open"
                    />
                </div>
            </section>
        </template>
    </dialog>
    <ScoreDeleteDialog
        ref="deletion"
        :can-write="canWrite"
        @notify="(message, title) => emit('notify', message, title)"
    />
</template>
<style scoped>
.song-dialog {
    width: min(1080px, calc(100vw - 32px));
    max-width: 1080px;
}
.song-history h2 {
    font-size: 15px;
    font-weight: 650;
}
.song-identity {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 22px 0 18px;
    min-width: 0;
}
.song-identity > div {
    min-width: 0;
}
.song-identity h3 {
    font-size: 24px;
    font-weight: 650;
    line-height: 1.35;
    overflow-wrap: anywhere;
}
.song-identity p {
    margin-top: 6px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.song-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 32px;
}
dt {
    color: var(--muted);
    font-size: 12px;
}
dd {
    margin: 4px 0;
}
.chart-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 26px 0 14px;
}
.chart-heading h3 {
    font-size: 15px;
    font-weight: 650;
}
.chart-mode {
    flex-shrink: 0;
}
.chart-mode button {
    padding: 7px 14px;
    font-size: 12px;
    letter-spacing: 0.04em;
}
.chart-details-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin: 0 0 24px;
}
.chart-detail {
    position: relative;
    overflow: hidden;
    container-type: inline-size;
    border: 1px solid transparent;
    border-radius: 16px;
    padding: 16px 16px 14px;
    color: var(--text);
}
.chart-detail.easy {
    background: linear-gradient(155deg, #f8fbf3 0%, #eef6df 48%, #e4f0c6 100%);
    border-color: #d7e6b6;
}
.chart-detail.normal {
    background: linear-gradient(155deg, #f7fbff 0%, #e7f1fb 48%, #d8e7f7 100%);
    border-color: #c9dcf1;
}
.chart-detail.hard {
    background: linear-gradient(155deg, #fff8f7 0%, #fbeceb 48%, #f7deda 100%);
    border-color: #f0d0cb;
}
.chart-detail.master {
    background: linear-gradient(155deg, #fdf9fe 0%, #f6eaf9 48%, #eedff4 100%);
    border-color: #e5d0eb;
}
.chart-body {
    position: relative;
}
.chart-copy {
    position: relative;
    z-index: 1;
}
.chart-level {
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.04em;
}
.chart-detail.easy .chart-level,
.chart-detail.easy .chart-watermark {
    color: #6f8f3d;
}
.chart-detail.normal .chart-level,
.chart-detail.normal .chart-watermark {
    color: #4f7eab;
}
.chart-detail.hard .chart-level,
.chart-detail.hard .chart-watermark {
    color: #c16f68;
}
.chart-detail.master .chart-level,
.chart-detail.master .chart-watermark {
    color: #9a62a8;
}
.chart-score {
    margin-top: 14px;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.04em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}
.chart-caption {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
}
.chart-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 16px;
}
.chart-metrics strong {
    display: block;
    font-size: 16px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
}
.chart-metrics span {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: var(--muted);
}
.chart-notes-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 14px;
    padding: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
}
.chart-notes-toggle:hover {
    color: var(--accent);
}
.chart-notes-toggle svg {
    transition: transform 0.2s ease;
}
.chart-notes-toggle[aria-expanded='true'] svg {
    transform: rotate(180deg);
}
.chart-watermark {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 0;
    max-width: 100%;
    font-size: 20px;
    font-weight: 700;
    font-style: italic;
    letter-spacing: 0.04em;
    line-height: 1;
    white-space: nowrap;
    opacity: 0.16;
    pointer-events: none;
    user-select: none;
}
@container (min-width: 180px) {
    .chart-watermark {
        font-size: 30px;
    }
}
.chart-detail dl {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px 12px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, currentColor 16%, transparent);
}
.chart-detail dt,
.chart-detail dd {
    font-size: 12px;
    line-height: 1.4;
}
.chart-detail dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text);
}
.chart-detail .is-empty {
    color: color-mix(in srgb, var(--muted) 58%, transparent);
}
:global(.dark .song-dialog .chart-detail.easy) {
    background: linear-gradient(155deg, #1c3224 0%, #274433 52%, #345844 100%);
    border-color: #314434;
}
:global(.dark .song-dialog .chart-detail.normal) {
    background: linear-gradient(155deg, #1a2c44 0%, #243c5c 52%, #305078 100%);
    border-color: #2c3d56;
}
:global(.dark .song-dialog .chart-detail.hard) {
    background: linear-gradient(155deg, #3a2426 0%, #4e3032 52%, #644044 100%);
    border-color: #4a3332;
}
:global(.dark .song-dialog .chart-detail.master) {
    background: linear-gradient(155deg, #2c2238 0%, #3e304e 52%, #524066 100%);
    border-color: #433650;
}
:global(.dark .song-dialog .chart-detail.easy .chart-level),
:global(.dark .song-dialog .chart-detail.easy .chart-watermark) {
    color: #d7f0b4;
}
:global(.dark .song-dialog .chart-detail.normal .chart-level),
:global(.dark .song-dialog .chart-detail.normal .chart-watermark) {
    color: #d4ebff;
}
:global(.dark .song-dialog .chart-detail.hard .chart-level),
:global(.dark .song-dialog .chart-detail.hard .chart-watermark) {
    color: #ffd8d4;
}
:global(.dark .song-dialog .chart-detail.master .chart-level),
:global(.dark .song-dialog .chart-detail.master .chart-watermark) {
    color: #f0d8f8;
}
@media (max-width: 680px) {
    .song-history h2 {
        font-size: 14px;
    }
    .song-identity h3 {
        font-size: 20px;
    }
    .chart-heading {
        align-items: flex-start;
    }
    .chart-score {
        font-size: 22px;
    }
    .chart-details-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
@media (prefers-reduced-motion: reduce) {
    .chart-notes-toggle svg {
        transition: none;
    }
}
</style>
