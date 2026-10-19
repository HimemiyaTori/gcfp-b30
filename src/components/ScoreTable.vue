<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis, Music2, Pencil, Plus, Info, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { songLanguage } from '../composables/useSettings'
import { MOBILE_MEDIA_QUERY } from '../breakpoints'
import { isPlayedChart, type ChartListRow, type UnplayedChartRow } from '../core/score/catalog'
import { getRankByScore } from '../core/rating/rank'
import { formatDisplayDate } from '../core/dateTime'
import type { ScoreTableSort, ScoreTableSortKey } from '../core/scoreSort'
import SongCover from './SongCover.vue'
import SelectField from './common/SelectField.vue'
import type { ScoreRow } from '../db/models'

const props = withDefaults(defineProps<{
    items: readonly ChartListRow[]
    sort: ScoreTableSort
    positions?: ReadonlyMap<number, number>
    hideMode?: boolean
    hideSongWhenNarrow?: boolean
    ranked?: boolean
    editable?: boolean
    deletable?: boolean
    canWrite?: boolean
    timeKey?: 'updatedAt' | 'importedAt'
    rowKey?: 'id' | 'chartId'
    pagination?: { page: number; pageCount: number; total?: number }
    loading?: boolean
    error?: string
    emptyTitle?: string
    emptyDescription?: string
}>(), {
    canWrite: true,
    timeKey: 'updatedAt',
    rowKey: 'id',
})
const { t, locale } = useI18n()
const controlsId = useId()
const expandedRow = ref<ReturnType<typeof rowDomKey> | null>(null)
const mobileControls = ref<HTMLElement>()

const emit = defineEmits<{
    edit: [score: ScoreRow]
    add: [chart: UnplayedChartRow]
    song: [score: { songId: string; mode: string }]
    remove: [score: ScoreRow]
    sort: [key: ScoreTableSortKey]
    page: [page: number]
    retry: []
}>()

function rowDomKey(row: ChartListRow) {
    return props.rowKey === 'chartId' ? row.chartId : isPlayedChart(row) ? row.id : row.chartId
}
function recordId(row: ChartListRow) {
    return isPlayedChart(row) ? row.id : undefined
}
function rowTime(row: ChartListRow) {
    return isPlayedChart(row) ? row[props.timeKey] : undefined
}
function rowDetailsId(row: ChartListRow) {
    return `${controlsId}-details-${rowDomKey(row)}`
}
function rowPosition(row: ChartListRow) {
    const id = recordId(row)
    return id == null ? undefined : props.positions?.get(id)
}

const formatters = computed(() => ({
    monthDay: new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric' }),
    fullDate: new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'numeric', day: 'numeric' }),
    time: new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }),
}))
function formatDate(timestamp: number) {
    if (locale.value === 'en') return formatDisplayDate(timestamp, locale.value)
    const date = new Date(timestamp)
    return (date.getFullYear() === new Date().getFullYear()
        ? formatters.value.monthDay
        : formatters.value.fullDate
    ).format(date)
}
function sortLabel(label: string, key: ScoreTableSortKey) {
    const state = props.sort.key !== key
        ? t('table.sortNone')
        : props.sort.ascending ? t('table.sortAscending') : t('table.sortDescending')
    return t('table.sortLabel', { label, state })
}
const columns = computed(() => {
    const columns: { keys: ScoreTableSortKey[]; labels: string[]; numeric: boolean }[] = [
        { keys: ['title'], labels: [t('table.title')], numeric: false },
        { keys: ['difficulty', 'level'], labels: [t('table.difficulty'), t('table.level')], numeric: false },
        { keys: ['score'], labels: ['Score'], numeric: true },
        { keys: ['rank'], labels: ['Rank'], numeric: true },
        { keys: ['rating'], labels: ['Rating'], numeric: true },
        { keys: [props.timeKey], labels: [props.timeKey === 'importedAt' ? t('table.importedAt') : t('table.updatedAt')], numeric: false },
    ]
    if (props.ranked) columns.unshift({ keys: ['position'], labels: [t('table.position')], numeric: false })
    return columns
})
const sortOptions = computed(() => columns.value.flatMap(column =>
    column.keys.map((key, i) => ({ key, label: column.labels[i]! })),
))
const selectedSortLabel = computed(() => sortOptions.value.find(option => option.key === props.sort.key)?.label ?? '')
const mobileSort = computed({
    get: () => props.sort.key,
    set: (key: ScoreTableSortKey) => emit('sort', key),
})
async function changePage(page: number) {
    expandedRow.value = null
    emit('page', page)
    await nextTick()
    if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) mobileControls.value?.scrollIntoView({ block: 'start' })
}
</script>

<template>
    <p v-if="error" role="alert">
        {{ error }} <button type="button" @click="$emit('retry')">{{ t('common.retry') }}</button>
    </p>
    <p v-if="loading" role="status" class="table-loading">{{ t('table.loading') }}</p>
    <div ref="mobileControls" class="score-sort-controls">
        <label :for="`${controlsId}-sort`">{{ t('table.sortBy') }}</label>
        <SelectField>
            <select :id="`${controlsId}-sort`" v-model="mobileSort">
                <option v-for="option in sortOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
            </select>
        </SelectField>
        <button type="button" :aria-label="sortLabel(selectedSortLabel, sort.key)" @click="emit('sort', sort.key)">
            <ArrowUp v-if="sort.ascending" :size="15" />
            <ArrowDown v-else :size="15" />
            {{ t(sort.ascending ? 'table.ascending' : 'table.descending') }}
        </button>
    </div>
    <div class="table-scroll" :class="{ 'contextual-score-table': hideSongWhenNarrow }" :aria-busy="loading">
        <table class="score-table">
            <thead>
                <tr>
                    <th
                        v-for="column in columns"
                        :key="column.keys[0]"
                        :class="{ num: column.numeric, position: column.keys[0] === 'position', 'song-column': column.keys[0] === 'title' }"
                        :aria-sort="column.keys.includes(sort.key) ? (sort.ascending ? 'ascending' : 'descending') : 'none'">
                        <div class="sort-head" :class="{ 'sort-numeric': column.numeric }">
                            <button
                                v-for="(key, i) in column.keys"
                                :key="key"
                                type="button"
                                class="sort-button"
                                :class="{ selected: sort.key === key }"
                                :aria-label="sortLabel(column.labels[i]!, key)"
                                @click="$emit('sort', key)">
                                {{ column.labels[i] }}
                                <ArrowUp v-if="sort.key === key && sort.ascending" :size="12" />
                                <ArrowDown v-else-if="sort.key === key" :size="12" />
                                <ArrowUpDown v-else :size="11" />
                            </button>
                        </div>
                    </th>
                    <th v-if="editable || deletable">{{ t('table.actions') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="s in items" :key="rowDomKey(s)">
                    <td
                        v-if="ranked"
                        class="position"
                        :class="{ podium: (positions?.get(recordId(s) ?? -1) ?? Infinity) <= 3 }">
                        {{ recordId(s) != null && positions?.has(recordId(s)!) ? String(positions.get(recordId(s)!)).padStart(2, '0') : '—' }}
                    </td>
                    <td class="song-column">
                        <button type="button" class="row gap-3 song-link" @click="$emit('song', s)">
                            <SongCover :src="s.coverSourceUrl" />
                            <div class="song-copy">
                                <strong>{{ s[songLanguage] }}</strong
                                ><small :title="s.artist">{{ s.artist }}</small>
                            </div>
                        </button>
                    </td>
                    <td>
                        <div class="row gap-2">
                            <span class="difficulty" :class="s.difficulty.toLowerCase()">{{ s.difficulty }}</span
                            ><b class="level">{{ s.level }}</b>
                        </div>
                        <small v-if="!hideMode" class="mode">{{ s.mode }}</small>
                    </td>
                    <td class="num score-num">
                        <template v-if="isPlayedChart(s)">
                            {{ s.score.toLocaleString('en-US') }}
                            <small>{{ s.ap ? 'AP' : s.fc ? 'FC' : '' }}{{ s.maxChain !== undefined ? ` · Max Chain ${s.maxChain}` : '' }}</small>
                        </template>
                        <span v-else>—</span>
                    </td>
                    <td class="num">
                        <span v-if="isPlayedChart(s)" class="rank">{{ getRankByScore(s.score) }}</span>
                        <span v-else>—</span>
                    </td>
                    <td class="num rating-num">
                        <template v-if="isPlayedChart(s)">{{ s.rating.toFixed(2) }}</template>
                        <span v-else>—</span>
                    </td>
                    <td class="updated-at">
                        <time v-if="rowTime(s) !== undefined" :datetime="new Date(rowTime(s)!).toISOString()">
                            <span class="updated-date">{{ formatDate(rowTime(s)!) }}</span>
                            <span class="updated-time">{{ formatters.time.format(rowTime(s)!) }}</span>
                        </time>
                        <span v-else>—</span>
                        <small v-if="timeKey === 'importedAt' && isPlayedChart(s) && s.correctedAt">{{ t('table.corrected') }}</small>
                    </td>
                    <td v-if="editable || deletable">
                        <template v-if="editable">
                            <button v-if="isPlayedChart(s)" type="button" class="icon-button" :aria-label="t('table.edit')" @click="emit('edit', s)">
                                <Pencil :size="16" />
                            </button>
                            <button v-else type="button" class="icon-button" :aria-label="t('table.add')" @click="emit('add', s)">
                                <Plus :size="16" />
                            </button>
                            <button type="button" class="icon-button" :aria-label="t('song.title')" @click="emit('song', s)">
                                <Info :size="15" />
                            </button>
                        </template>
                        <button
                            v-if="deletable && isPlayedChart(s)"
                            type="button"
                            class="icon-button"
                            :disabled="!canWrite || loading"
                            :aria-label="t('table.removeHistory')"
                            @click="emit('remove', s)">
                            <Trash2 :size="16" />
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
        <ul v-if="items.length" class="score-list" :aria-label="t('table.list')">
            <li v-for="s in items" :key="rowDomKey(s)" class="score-list-item">
                <div class="score-card-summary">
                    <span v-if="ranked" class="score-card-position" :class="{ podium: (rowPosition(s) ?? Infinity) <= 3 }">
                        {{ rowPosition(s) == null ? '—' : String(rowPosition(s)).padStart(2, '0') }}
                    </span>
                    <div v-if="hideSongWhenNarrow" class="score-card-chart">
                        <span class="difficulty" :class="s.difficulty.toLowerCase()">{{ s.difficulty }}</span>
                        <b class="level">{{ s.level }}</b>
                    </div>
                    <button v-else type="button" class="score-card-song" @click="emit('song', s)">
                        <SongCover :src="s.coverSourceUrl" :size="44" />
                        <span class="score-card-copy">
                            <strong>{{ s[songLanguage] }}</strong>
                            <span class="score-card-chart">
                                <span class="difficulty" :class="s.difficulty.toLowerCase()">{{ s.difficulty }}</span>
                                <b class="level">{{ s.level }}</b>
                                <span v-if="!hideMode" class="score-card-mode">{{ s.mode }}</span>
                            </span>
                        </span>
                    </button>
                    <span class="score-card-rating">
                        <strong>{{ isPlayedChart(s) ? s.rating.toFixed(2) : '—' }}</strong>
                        <small>Rating</small>
                    </span>
                </div>
                <div class="score-card-footer">
                    <div v-if="isPlayedChart(s)" class="score-card-result">
                        <span class="score-num">{{ s.score.toLocaleString('en-US') }}</span>
                        <span class="rank">{{ getRankByScore(s.score) }}</span>
                        <span v-if="s.ap || s.fc" class="score-card-status">{{ s.ap ? 'AP' : 'FC' }}</span>
                    </div>
                    <span v-else class="score-card-unplayed">{{ t('table.unplayed') }}</span>
                    <div class="score-card-actions">
                        <template v-if="editable">
                            <button v-if="isPlayedChart(s)" type="button" class="icon-button" :aria-label="t('table.edit')" @click="emit('edit', s)">
                                <Pencil :size="17" />
                            </button>
                            <button v-else type="button" class="icon-button" :aria-label="t('table.add')" @click="emit('add', s)">
                                <Plus :size="18" />
                            </button>
                        </template>
                        <button
                            v-if="deletable && isPlayedChart(s)"
                            type="button"
                            class="icon-button score-card-delete"
                            :disabled="!canWrite || loading"
                            :aria-label="t('table.removeHistory')"
                            @click="emit('remove', s)">
                            <Trash2 :size="17" />
                        </button>
                        <button
                            v-else-if="isPlayedChart(s)"
                            type="button"
                            class="icon-button"
                            :aria-label="t('table.more')"
                            :aria-expanded="expandedRow === rowDomKey(s)"
                            :aria-controls="rowDetailsId(s)"
                            @click="expandedRow = expandedRow === rowDomKey(s) ? null : rowDomKey(s)">
                            <Ellipsis :size="20" />
                        </button>
                    </div>
                </div>
                <div v-if="timeKey === 'importedAt' && rowTime(s) !== undefined" class="score-card-time">
                    <time :datetime="new Date(rowTime(s)!).toISOString()">
                        {{ formatDate(rowTime(s)!) }} {{ formatters.time.format(rowTime(s)!) }}
                    </time>
                    <span v-if="isPlayedChart(s) && s.correctedAt">{{ t('table.corrected') }}</span>
                    <span v-if="deletable && isPlayedChart(s) && s.maxChain !== undefined">Max Chain {{ s.maxChain }}</span>
                </div>
                <div v-if="isPlayedChart(s) && !deletable" v-show="expandedRow === rowDomKey(s)" :id="rowDetailsId(s)" class="score-card-details">
                    <div class="score-card-detail-copy">
                        <span v-if="!hideSongWhenNarrow" class="score-card-artist">{{ t('table.artist', { artist: s.artist }) }}</span>
                        <span v-if="s.maxChain !== undefined">Max Chain {{ s.maxChain }}</span>
                        <span v-if="timeKey === 'updatedAt' && rowTime(s) !== undefined">
                            {{ t('table.updatedAt') }}
                            <time :datetime="new Date(rowTime(s)!).toISOString()">{{ formatDate(rowTime(s)!) }} {{ formatters.time.format(rowTime(s)!) }}</time>
                        </span>
                    </div>
                    <button type="button" class="score-card-view" @click="emit('song', s)">
                        <Info :size="16" />{{ t('table.viewDetails') }}
                    </button>
                </div>
            </li>
        </ul>
        <div v-if="!items.length && !loading && !error" class="empty">
            <Music2 :size="32" />
            <h3>{{ emptyTitle ?? t('table.empty') }}</h3>
            <p v-if="emptyDescription ?? t('table.emptyHint')">{{ emptyDescription ?? t('table.emptyHint') }}</p>
        </div>
    </div>
    <nav
        v-if="pagination && pagination.pageCount > 1"
        class="table-pagination"
        :aria-label="timeKey === 'importedAt' ? t('table.historyPages') : t('table.pages')">
        <span>{{ t('table.page', { page: pagination.page, count: pagination.pageCount }) }}<template v-if="pagination.total !== undefined"> · {{ t('table.entries', { count: pagination.total }, pagination.total) }}</template></span>
        <div class="row gap-2">
            <button type="button" :disabled="pagination.page === 1 || loading" @click="changePage(pagination.page - 1)">
                {{ t('table.previous') }}
            </button>
            <button type="button" :disabled="pagination.page === pagination.pageCount || loading" @click="changePage(pagination.page + 1)">
                {{ t('table.next') }}
            </button>
        </div>
    </nav>
</template>
