<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Music2, Pencil, Info, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { songLanguage } from '../composables/useSettings'
import { getRankByScore } from '../core/rating/rank'
import type { ScoreTableSort, ScoreTableSortKey } from '../core/scoreSort'
import SongCover from './SongCover.vue'
import type { ScoreRow } from '../db/models'

const props = withDefaults(defineProps<{
    items: readonly ScoreRow[]
    sort: ScoreTableSort
    positions?: ReadonlyMap<number, number>
    hideMode?: boolean
    ranked?: boolean
    editable?: boolean
    deletable?: boolean
    canWrite?: boolean
    timeKey?: 'updatedAt' | 'importedAt'
    pagination?: { page: number; pageCount: number; total?: number }
    loading?: boolean
    error?: string
    emptyTitle?: string
    emptyDescription?: string
}>(), {
    canWrite: true,
    timeKey: 'updatedAt',
    emptyTitle: '暂时没有成绩',
    emptyDescription: '试试其他筛选条件，或录入你的第一份成绩。',
})

defineEmits<{
    edit: [score: ScoreRow]
    song: [score: ScoreRow]
    remove: [score: ScoreRow]
    sort: [key: ScoreTableSortKey]
    page: [page: number]
    retry: []
}>()

const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
})
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})
function formatDate(timestamp: number) {
    const date = new Date(timestamp)
    return (date.getFullYear() === new Date().getFullYear()
        ? monthDayFormatter
        : fullDateFormatter
    ).format(date)
}
const columns = computed(() => {
    const columns: { keys: ScoreTableSortKey[]; labels: string[]; numeric: boolean }[] = [
        { keys: ['title'], labels: ['曲目'], numeric: false },
        { keys: ['difficulty', 'level'], labels: ['难度', '等级'], numeric: false },
        { keys: ['score'], labels: ['Score'], numeric: true },
        { keys: ['rank'], labels: ['Rank'], numeric: true },
        { keys: ['rating'], labels: ['Rating'], numeric: true },
        { keys: [props.timeKey], labels: [props.timeKey === 'importedAt' ? '导入时间' : '更新时间'], numeric: false },
    ]
    if (props.ranked) columns.unshift({ keys: ['position'], labels: ['排名'], numeric: false })
    return columns
})
</script>

<template>
    <p v-if="error" role="alert">
        {{ error }} <button type="button" @click="$emit('retry')">重试</button>
    </p>
    <p v-if="loading" role="status" class="table-loading">正在读取成绩…</p>
    <div class="table-scroll" :aria-busy="loading">
        <table class="score-table">
            <thead>
                <tr>
                    <th
                        v-for="column in columns"
                        :key="column.keys[0]"
                        :class="{ num: column.numeric, position: column.keys[0] === 'position' }"
                        :aria-sort="column.keys.includes(sort.key) ? (sort.ascending ? 'ascending' : 'descending') : 'none'">
                        <div class="sort-head" :class="{ 'sort-numeric': column.numeric }">
                            <button
                                v-for="(key, i) in column.keys"
                                :key="key"
                                type="button"
                                class="sort-button"
                                :class="{ selected: sort.key === key }"
                                :aria-label="`${column.labels[i]}：${sort.key === key ? (sort.ascending ? '当前升序，点击降序' : '当前降序，点击升序') : '点击排序'}`"
                                @click="$emit('sort', key)">
                                {{ column.labels[i] }}
                                <ArrowUp v-if="sort.key === key && sort.ascending" :size="12" />
                                <ArrowDown v-else-if="sort.key === key" :size="12" />
                                <ArrowUpDown v-else :size="11" />
                            </button>
                        </div>
                    </th>
                    <th v-if="editable || deletable">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="s in items" :key="s.id">
                    <td
                        v-if="ranked"
                        class="position"
                        :class="{ podium: (positions?.get(s.id) ?? Infinity) <= 3 }">
                        {{ positions?.has(s.id) ? String(positions.get(s.id)).padStart(2, '0') : '—' }}
                    </td>
                    <td>
                        <button type="button" class="row gap-3 song-link" @click="$emit('song', s)">
                            <SongCover :src="s.coverSourceUrl" />
                            <div class="song-copy">
                                <strong>{{ s[songLanguage] }}</strong
                                ><small>{{ s.artist }}</small>
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
                        {{ s.score.toLocaleString('en-US') }}
                        <small>{{ s.ap ? 'AP' : s.fc ? 'FC' : '' }}{{ s.maxChain !== undefined ? ` · Max Chain ${s.maxChain}` : '' }}</small>
                    </td>
                    <td class="num">
                        <span class="rank">{{ getRankByScore(s.score) }}</span>
                    </td>
                    <td class="num rating-num">{{ s.rating.toFixed(2) }}</td>
                    <td class="updated-at">
                        <time v-if="s[timeKey] !== undefined" :datetime="new Date(s[timeKey]!).toISOString()">
                            <span class="updated-date">{{ formatDate(s[timeKey]!) }}</span>
                            <span class="updated-time">{{ timeFormatter.format(s[timeKey]!) }}</span>
                        </time>
                        <span v-else>—</span>
                        <small v-if="timeKey === 'importedAt' && s.correctedAt">已修正</small>
                    </td>
                    <td v-if="editable || deletable">
                        <template v-if="editable">
                            <button type="button" class="icon-button" aria-label="编辑成绩" @click="$emit('edit', s)">
                                <Pencil :size="16" />
                            </button>
                            <button type="button" class="icon-button" aria-label="歌曲信息" @click="$emit('song', s)">
                                <Info :size="15" />
                            </button>
                        </template>
                        <button
                            v-if="deletable"
                            type="button"
                            class="icon-button"
                            :disabled="!canWrite || loading"
                            aria-label="删除历史成绩"
                            @click="$emit('remove', s)">
                            <Trash2 :size="16" />
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
        <div v-if="!items.length && !loading && !error" class="empty">
            <Music2 :size="32" />
            <h3>{{ emptyTitle }}</h3>
            <p v-if="emptyDescription">{{ emptyDescription }}</p>
        </div>
    </div>
    <nav
        v-if="pagination && pagination.pageCount > 1"
        class="table-pagination"
        :aria-label="timeKey === 'importedAt' ? '历史成绩分页' : '成绩分页'">
        <span>第 {{ pagination.page }} / {{ pagination.pageCount }} 页<template v-if="pagination.total !== undefined"> · 共 {{ pagination.total }} 条</template></span>
        <div class="row gap-2">
            <button type="button" :disabled="pagination.page === 1 || loading" @click="$emit('page', pagination.page - 1)">
                上一页
            </button>
            <button type="button" :disabled="pagination.page === pagination.pageCount || loading" @click="$emit('page', pagination.page + 1)">
                下一页
            </button>
        </div>
    </nav>
</template>
