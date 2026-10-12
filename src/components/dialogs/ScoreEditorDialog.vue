<script setup lang="ts">
import { Check, ChevronDown, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SongCover from '../SongCover.vue'
import { songLanguage } from '../../composables/useSettings'
import type { ScoreRow } from '../../db/models'
import { scoreRepository } from '../../db/scoreRepository'
import { getChartRating } from '../../core/rating/calculator'
import { getRankByScore } from '../../core/rating/rank'
import { isValidScore } from '../../core/score/validation'
import {
    songService,
    getSongDisplay,
    formatLevel,
} from '../../core/song/songService'
import { searchSongs } from '../../core/search/songSearch'
const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t } = useI18n()
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
    searchSongs(songQuery.value).map((song) =>
        getSongDisplay(song, songLanguage.value),
    ),
)
const currentSong = computed(() =>
    getSongDisplay(
        songService.getSong(selectedSong.value)!,
        songLanguage.value,
    ),
)
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
    () => inputScore.value !== '' && isValidScore(Number(inputScore.value)),
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
function open(s?: ScoreRow, chart?: { songId: string; mode: string; difficulty: string }) {
    songPickerExpanded.value = false
    editing.value = s ?? null
    selectedSong.value = s?.songId ?? chart?.songId ?? songService.songs[0]!.id
    saveError.value = ''
    lowerConfirmed.value = false
    songQuery.value = ''
    editorMode.value = s?.mode ?? chart?.mode ?? 'ADVANCED'
    editorDifficulty.value = s?.difficulty ?? chart?.difficulty ?? 'MASTER'
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
        saveError.value = t('editor.confirmLowerRequired')
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
        emit('notify', t('editor.saved'))
    } catch (error) {
        saveError.value =
            error instanceof Error ? error.message : t('editor.saveFailed')
    } finally {
        pending.value = false
    }
}

function openChart(chart: { songId: string; mode: string; difficulty: string }) {
    open(undefined, chart)
}

defineExpose({ open, openChart })
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
                    <h2>{{ editing ? t('table.edit') : t('editor.addTitle') }}</h2>
                </div>
                <button
                    type="button"
                    class="icon-button"
                    :aria-label="t('editor.close')"
                    @click="dialog?.close()"
                >
                    <X :size="20" />
                </button>
            </div>
            <p class="muted">
                {{ editing ? t('editor.editIntro') : t('editor.addIntro') }}
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
                        ><small>{{ t('editor.selectedSong') }}</small
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
                        ><small>{{ t('editor.currentSong') }}</small
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
                        >{{ t('editor.searchSong') }}<input
                            ref="songSearchInput"
                            v-model="songQuery"
                            type="search"
                            :placeholder="t('editor.searchPlaceholder')"
                    /></label>
                    <div class="song-options" :aria-label="t('editor.searchResults')">
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
                            <Check v-if="selectedSong === song.id" :size="16" />
                        </button>
                        <p v-if="!filteredSongs.length" class="form-note">
                            {{ t('editor.noMatch') }}
                        </p>
                    </div>
                </div>
            </div>
            <div class="editor-control-row">
                <fieldset class="chart-picker" :disabled="!!editing">
                    <legend>{{ t('editor.mode') }}</legend>
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
                    <legend>{{ t('editor.achievement') }}</legend>
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
                <legend>{{ t('table.difficulty') }}</legend>
                <div class="chart-buttons">
                    <button
                        v-for="chart in chartOptions"
                        :key="chart.id"
                        type="button"
                        :aria-pressed="editorDifficulty === chart.difficulty"
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
                    >{{ t('editor.maxChain') }}<input
                        v-model="inputMaxChain"
                        type="number"
                        min="0"
                        step="1"
                        :placeholder="t('editor.notRecorded')"
                /></label>
            </div>
            <div class="live-metrics" aria-live="polite">
                <div>
                    <small>Rank</small><strong>{{ liveRank }}</strong>
                </div>
                <div>
                    <small>{{ t('editor.ratingPreview') }}</small
                    ><strong
                        >{{ chartBase.toFixed(1) }} <span>→</span>
                        {{ liveRating }}</strong
                    >
                </div>
            </div>
            <p v-if="!validScore" class="error">
                {{ t('editor.invalidScore') }}
            </p>
            <p v-if="lowered" class="warning">
                {{ t('editor.lowerWarning', { title: editing?.[songLanguage] }) }}
            </p>
            <label v-if="lowered"
                ><input v-model="lowerConfirmed" type="checkbox" />{{
                    t('editor.lowerConfirm', { title: editing?.[songLanguage] })
                }}</label
            >
            <p v-if="saveError" class="error" role="alert">
                {{ saveError }}
            </p>
            <p v-if="!currentChart" class="error">{{ t('editor.noChart') }}</p>
            <div class="dialog-actions">
                <button
                    type="button"
                    class="button secondary"
                    @click="dialog?.close()"
                >
                    {{ t('common.cancel') }}</button
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
                    {{ pending ? t('editor.saving') : t('editor.save') }}
                </button>
            </div>
        </form>
    </dialog>
</template>
