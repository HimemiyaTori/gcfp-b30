<script setup lang="ts">
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { Chart } from '../../core/song/models'
import type { ScoreRow } from '../../db/models'
import {
    songService,
    formatLevel,
    getSongArtist,
} from '../../core/song/songService'
import { songLanguage } from '../../composables/useSettings'
import { songCategories } from '../../data/categories'
import ScoreTable from '../ScoreTable.vue'
import { useScoreHistory } from '../../composables/useScoreHistory'
import SongCover from '../SongCover.vue'
import ScoreDeleteDialog from './ScoreDeleteDialog.vue'
const chartFields: { key: keyof Chart; label: string }[] = [
    { key: 'target', label: '目标数' },
    { key: 'special', label: '特殊目标' },
    { key: 'combo', label: '总连击' },
    { key: 'note', label: '音符' },
    { key: 'goldNote', label: '金色音符' },
    { key: 'hold', label: '长按' },
    { key: 'goldHold', label: '金色长按' },
    { key: 'arrow', label: '滑动' },
    { key: 'goldArrow', label: '金色滑动' },
    { key: 'square', label: '方形目标' },
    { key: 'goldSquare', label: '金色方形目标' },
    { key: 'advNote', label: '进阶音符' },
    { key: 'blueNote', label: '蓝色音符' },
    { key: 'redNote', label: '红色音符' },
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
    active = ref(false)
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
function open(row: ScoreRow) {
    songId.value = row.songId
    mode.value = row.mode
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
            <div class="song-details-heading row gap-3">
                <SongCover :src="song.coverSourceUrl" />
                <div>
                    <h3>{{ song.title.ja || '--' }}</h3>
                    <p>{{ song.title.en || '--' }}</p>
                </div>
            </div>
            <dl class="song-metadata">
                <div>
                    Rank 与 Rating 随 Score 实时计算
                    <dt>艺术家</dt>
                    <dd>{{ getSongArtist(song, songLanguage) || '--' }}</dd>
                </div>
                <div>
                    <dt>歌手</dt>
                    <dd>
                        {{
                            song.vocal?.[songLanguage] || song.vocal?.ja || '--'
                        }}
                    </dd>
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
                        }}{{ song.bpmMax ? `–${song.bpmMax}` : '' }}
                    </dd>
                </div>
                <div>
                    <dt>曲包</dt>
                    <dd>{{ song.pack || '--' }}</dd>
                </div>
            </dl>
            <div class="segmented" role="group" aria-label="歌曲模式">
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
            <h3 class="details-section-title">谱面信息</h3>
            <div class="chart-details-grid">
                <article
                    v-for="chart in charts"
                    :key="chart.id"
                    class="chart-detail"
                >
                    <span class="difficulty" :class="chart.difficulty"
                        >{{ chart.difficulty.toUpperCase() }}
                        {{ formatLevel(chart.level) }}</span
                    >
                    <p>
                        {{
                            best.get(chart.id)?.score.toLocaleString('en-US') ??
                            '--'
                        }}
                        <small>最高成绩</small>
                    </p>
                    <small
                        >Rating
                        {{
                            best.get(chart.id)?.rating.toFixed(2) ?? '--'
                        }}</small
                    >
                    <details>
                        <summary>物量详情</summary>
                        <dl>
                            <template
                                v-for="field in chartFields"
                                :key="field.key"
                                ><dt>{{ field.label }}</dt>
                                <dd>
                                    {{ chart[field.key] ?? '--' }}
                                </dd></template
                            >
                        </dl>
                    </details>
                </article>
            </div>
            <h3>历史成绩</h3>
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
.details-section-title {
    margin-top: 20px;
}
.song-details-heading {
    margin: 20px 0;
}
.song-details-heading p {
    margin: 6px 0;
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
.chart-details-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0 24px;
}
.chart-detail {
    border: 1px solid var(--line);
    padding: 14px;
    border-radius: 12px;
}
.chart-detail summary {
    cursor: pointer;
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted);
}
.chart-detail dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
}
@media (max-width: 680px) {
    .chart-details-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
