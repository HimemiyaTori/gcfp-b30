<script setup lang="ts">
import { Check, ChevronDown, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import SongCover from '../SongCover.vue'
import { songLanguage } from '../../composables/useSettings'
import type { ScoreRow } from '../../db/models'
import { scoreRepository } from '../../db/scoreRepository'
import { getChartRating } from '../../core/rating/calculator'
import { getRankByScore } from '../../core/rating/rank'
import { isValidScore } from '../../core/score/validation'
import { songService, getSongDisplay, formatLevel } from '../../core/song/songService'
import { searchSongs } from '../../core/search/songSearch'
const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const dialog = ref<HTMLDialogElement>(),
    editing = ref<ScoreRow | null>(null)
const inputScore = ref<number | string>(1040000)
const inputAchievement = ref('unknown')
const inputMaxChain = ref<number | string>('')
const songPickerExpanded = ref(false)
const songSearchInput = ref<HTMLInputElement>(),
    songPickerButton = ref<HTMLButtonElement>()
async function toggleSongPicker() {
    songPickerExpanded.value = !songPickerExpanded.value
    if (songPickerExpanded.value) {
        await nextTick()
        songSearchInput.value?.focus()
    }
}
function selectSong(id: string) {
    selectedSong.value = id
    songPickerExpanded.value = false
    songPickerButton.value?.focus()
}
const songQuery = ref(''),
    selectedSong = ref(songService.songs[0]!.id)
const editorMode = ref('ADVANCED'),
    editorDifficulty = ref('MASTER')
const filteredSongs = computed(() =>
    searchSongs(songQuery.value).map(song => getSongDisplay(song, songLanguage.value)),
)
const currentSong = computed(() => getSongDisplay(songService.getSong(selectedSong.value)!, songLanguage.value))
const chartOptions = computed(() =>
    songService
        .getSong(selectedSong.value)!
        .charts.filter((chart) => chart.mode.toUpperCase() === editorMode.value)
        .map((chart) => ({
            ...chart,
            difficulty: chart.difficulty.toUpperCase(),
            levelLabel: formatLevel(chart.level),
        })),
)
const currentChart = computed(() =>
    chartOptions.value.find(
        (chart) => chart.difficulty === editorDifficulty.value,
    ),
)
watch(chartOptions, (options) => {
    if (!options.some((chart) => chart.difficulty === editorDifficulty.value))
        editorDifficulty.value = options[options.length - 1]?.difficulty ?? ''
})
const chartBase = computed(() => currentChart.value?.level ?? 0)
const pending = ref(false),
    saveError = ref(''),
    lowerConfirmed = ref(false)
watch([inputScore, selectedSong, editorMode, editorDifficulty], () => {
    lowerConfirmed.value = false
    saveError.value = ''
})
const validScore = computed(
    () =>
        inputScore.value !== '' &&
        isValidScore(Number(inputScore.value)),
)
const liveRank = computed(() =>
    validScore.value ? getRankByScore(Number(inputScore.value)) : '—',
)
const liveRating = computed(() =>
    validScore.value && currentChart.value
        ? getChartRating(Number(inputScore.value), chartBase.value).toFixed(2)
        : '—',
)
const lowered = computed(
    () => editing.value && Number(inputScore.value) < editing.value.score,
)
function open(s?: ScoreRow) {
    songPickerExpanded.value = false
    editing.value = s ?? null
    selectedSong.value = s?.songId ?? songService.songs[0]!.id
    saveError.value = ''
    lowerConfirmed.value = false
    songQuery.value = ''
    editorMode.value = s?.mode ?? 'ADVANCED'
    editorDifficulty.value = s?.difficulty ?? 'MASTER'
    inputScore.value = s?.score ?? 1040000
    inputAchievement.value = s?.ap
        ? 'ap'
        : s?.fc
          ? 'fc'
          : s?.fc === false
            ? 'clear'
            : 'unknown'
    inputMaxChain.value = s?.maxChain ?? ''
    dialog.value?.showModal()
}
async function saveScore() {
    if (
        !validScore.value ||
        !currentChart.value ||
        pending.value ||
        !props.canWrite
    )
        return
    if (lowered.value && !lowerConfirmed.value) {
        saveError.value = '请勾选确认调低该曲目的成绩。'
        return
    }
    pending.value = true
    saveError.value = ''
    try {
        const achievements = {
            fc:
                inputAchievement.value === 'unknown'
                    ? undefined
                    : inputAchievement.value !== 'clear',
            ap:
                inputAchievement.value === 'unknown'
                    ? undefined
                    : inputAchievement.value === 'ap',
            maxChain:
                inputMaxChain.value === ''
                    ? undefined
                    : Number(inputMaxChain.value),
        }
        if (editing.value)
            await scoreRepository.edit(
                editing.value.id,
                Number(inputScore.value),
                lowerConfirmed.value,
                achievements,
            )
        else
            await scoreRepository.addManual(
                selectedSong.value,
                currentChart.value.id,
                Number(inputScore.value),
                achievements,
            )
        dialog.value?.close()
        emit('notify', '成绩已保存到本机。')
    } catch (error) {
        saveError.value =
            error instanceof Error ? error.message : '保存失败，请重试。'
    } finally {
        pending.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog
        ref="dialog"
        class="editor-dialog"
        @click="$event.target === dialog && dialog?.close()"
    >
        <form @submit.prevent="saveScore">
            <div class="between">
                <div>
                    <div class="eyebrow">SCORE PREVIEW</div>
                    <h2>{{ editing ? '编辑成绩' : '手动新增成绩' }}</h2>
                </div>
                <button
                    type="button"
                    class="icon-button"
                    aria-label="关闭弹窗"
                    @click="dialog?.close()"
                >
                    <X :size="20" />
                </button>
            </div>
            <p class="muted">
                {{
                    editing
                        ? '可修改 Score、完成状态与 Max Chain，曲目与谱面保持不变。'
                        : '选择曲目与谱面，记录你的精彩发挥。'
                }}
            </p>
            <div class="song-picker">
                <button
                    v-if="!editing"
                    ref="songPickerButton"
                    type="button"
                    class="selected-song song-picker-toggle"
                    :aria-expanded="songPickerExpanded"
                    aria-controls="song-search-panel"
                    @click="toggleSongPicker"
                >
                    <SongCover :src="currentSong.coverSourceUrl" />
                    <span class="song-picker-copy"
                        ><small>已选曲目</small
                        ><strong>{{ currentSong[songLanguage] }}</strong
                        ><small>{{ currentSong.artist }}</small></span
                    >
                    <ChevronDown
                        :size="18"
                        :class="{
                            'picker-chevron-open': songPickerExpanded,
                        }"
                    />
                </button>
                <div v-else class="selected-song song-picker-toggle">
                    <SongCover :src="currentSong.coverSourceUrl" />
                    <span class="song-picker-copy"
                        ><small>当前曲目</small
                        ><strong>{{ currentSong[songLanguage] }}</strong
                        ><small>{{ currentSong.artist }}</small></span
                    >
                </div>
                <div
                    v-if="!editing && songPickerExpanded"
                    id="song-search-panel"
                    class="song-search-panel"
                >
                    <label
                        >搜索曲目<input
                            ref="songSearchInput"
                            v-model="songQuery"
                            type="search"
                            placeholder="输入日文 / 英文曲名或艺术家"
                    /></label>
                    <div class="song-options" aria-label="曲目搜索结果">
                        <button
                            v-for="song in filteredSongs"
                            :key="song.id"
                            type="button"
                            :class="{ selected: selectedSong === song.id }"
                            :aria-pressed="selectedSong === song.id"
                            @click="selectSong(song.id)"
                        >
                            <SongCover :src="song.coverSourceUrl" />
                            <span class="song-picker-copy"
                                >{{ song[songLanguage]
                                }}<small>{{ song.artist }}</small></span
                            >
                            <Check
                                v-if="selectedSong === song.id"
                                :size="16"
                            />
                        </button>
                        <p v-if="!filteredSongs.length" class="form-note">
                            未找到匹配曲目，试试其他关键词。已选曲目保持不变。
                        </p>
                    </div>
                </div>
            </div>
            <div class="editor-control-row">
                <fieldset class="chart-picker" :disabled="!!editing">
                    <legend>模式</legend>
                    <div class="chart-buttons">
                        <button
                            v-for="item in [
                                { id: 'BASIC', label: 'BASIC' },
                                { id: 'ADVANCED', label: 'ADV' },
                            ]"
                            :key="item.id"
                            type="button"
                            :aria-pressed="editorMode === item.id"
                            :class="{ selected: editorMode === item.id }"
                            @click="editorMode = item.id"
                        >
                            {{ item.label }}
                        </button>
                    </div>
                </fieldset>
                <fieldset class="chart-picker">
                    <legend>完成状态</legend>
                    <div class="chart-buttons">
                        <button
                            v-for="item in [
                                { id: 'fc', label: 'FC' },
                                { id: 'ap', label: 'AP' },
                            ]"
                            :key="item.id"
                            type="button"
                            :aria-pressed="inputAchievement === item.id"
                            :class="{
                                selected: inputAchievement === item.id,
                            }"
                            @click="
                                inputAchievement =
                                    inputAchievement === item.id
                                        ? 'unknown'
                                        : item.id
                            "
                        >
                            {{ item.label }}
                        </button>
                    </div>
                </fieldset>
            </div>
            <fieldset class="chart-picker" :disabled="!!editing">
                <legend>难度</legend>
                <div class="chart-buttons">
                    <button
                        v-for="chart in chartOptions"
                        :key="chart.id"
                        type="button"
                        :aria-pressed="
                            editorDifficulty === chart.difficulty
                        "
                        :class="{
                            selected: editorDifficulty === chart.difficulty,
                        }"
                        @click="editorDifficulty = chart.difficulty"
                    >
                        {{ chart.difficulty }} {{ chart.levelLabel }}
                    </button>
                </div>
            </fieldset>
            <div class="editor-control-row">
                <label
                    >Score<input
                        v-model="inputScore"
                        type="number"
                        min="0"
                        max="1050000"
                        step="1"
                        required
                /></label>
                <label
                    >Max Chain（可选）<input
                        v-model="inputMaxChain"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="未记录"
                /></label>
            </div>
            <div class="live-metrics" aria-live="polite">
                <div>
                    <small>Rank</small><strong>{{ liveRank }}</strong>
                </div>
                <div>
                    <small>歌曲定数 → 单曲 Rating</small
                    ><strong
                        >{{ chartBase.toFixed(1) }} <span>→</span>
                        {{ liveRating }}</strong
                    >
                </div>
            </div>
            <p v-if="!validScore" class="error">
                请输入 0～1,050,000 范围内的整数。
            </p>
            <p v-if="lowered" class="warning">
                将调低「{{ editing?.[songLanguage] }}」的成绩，保存后 Rank
                与 Rating 会重新计算。
            </p>
            <div class="form-note">
                Rank 与 Rating 随 Score
                实时计算，保存后刷新页面仍可查看成绩。
            </div>
            <label v-if="lowered"
                ><input
                    v-model="lowerConfirmed"
                    type="checkbox"
                />确认调低「{{ editing?.[songLanguage] }}」的成绩</label
            >
            <p v-if="saveError" class="error" role="alert">
                {{ saveError }}
            </p>
            <p v-if="!currentChart" class="error">该模式没有可选谱面。</p>
            <div class="dialog-actions">
                <button
                    type="button"
                    class="button secondary"
                    @click="dialog?.close()"
                >
                    取消</button
                ><button
                    class="button primary"
                    :disabled="
                        !validScore ||
                        !currentChart ||
                        pending ||
                        !canWrite ||
                        (!!lowered && !lowerConfirmed)
                    "
                >
                    {{ pending ? '保存中…' : '保存成绩' }}
                </button>
            </div>
        </form>
    </dialog>
</template>
