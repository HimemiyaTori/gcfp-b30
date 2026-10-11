<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { liveQuery } from 'dexie'
import { database } from '../db/database'
import type { ScoreHistory, ScoreRow } from '../db/models'
import { songService, getSongDisplay, formatLevel } from '../core/song/songService'
import { songLanguage } from '../composables/useSettings'
import { createScoreComparator, type ScoreSortKey } from '../core/scoreSort'
import { getRankByScore } from '../core/rating/rank'
import SongCover from './SongCover.vue'
const props = withDefaults(defineProps<{ songId?: string; mode?: string; pageSize?: number; deletable?: boolean; canWrite?: boolean }>(), { pageSize: 10 })
const emit = defineEmits<{ song: [row: ScoreRow]; remove: [row: ScoreRow] }>()
const rows = ref<(ScoreRow & { correctedAt?: number })[]>([]), count = ref(0), page = ref(1), error = ref('')
const loading = ref(true)
const sort = ref<ScoreSortKey | 'importedAt'>('importedAt'), ascending = ref(false)
const columns = [{ key: 'title', label: '曲目' }, { key: 'difficulty', label: '难度' }, { key: 'score', label: 'Score' }, { key: 'rating', label: 'Rating' }, { key: 'importedAt', label: '导入时间' }] as const
let subscription: { unsubscribe(): void } | undefined
function display(record: ScoreHistory) {
    const { song, chart } = songService.getChart(record.songId, record.chartId)
    return { ...getSongDisplay(song, songLanguage.value), ...record, id: record.id!, category: song.genre, mode: chart.mode.toUpperCase(), difficulty: chart.difficulty.toUpperCase(), level: formatLevel(chart.level) }
}
function reload() {
    subscription?.unsubscribe()
    error.value = ''
    loading.value = true
    const currentPage = page.value, key = sort.value, asc = ascending.value, songId = props.songId, mode = props.mode
    subscription = liveQuery(async () => {
        let collection = database.scoreHistory.orderBy('importedAt')
        if (!asc || key !== 'importedAt') collection = collection.reverse()
        collection = collection.filter(row => (!songId || row.songId === songId) && (!mode || songService.getChart(row.songId, row.chartId).chart.mode.toUpperCase() === mode))
        const total = await collection.clone().count()
        const offset = (currentPage - 1) * props.pageSize
        if (key === 'importedAt') return { total, items: (await collection.offset(offset).limit(props.pageSize).toArray()).map(display) }
        const compare = createScoreComparator(key, songLanguage.value)
        const items = (await collection.toArray()).map(display).sort((a, b) => compare(a, b) * (asc ? 1 : -1) || b.id - a.id)
        return { total, items: items.slice(offset, offset + props.pageSize) }
    }).subscribe({ next: result => { loading.value = false; count.value = result.total; rows.value = result.items; if (page.value > Math.max(1, Math.ceil(result.total / props.pageSize))) page.value = Math.max(1, Math.ceil(result.total / props.pageSize)) }, error: () => { loading.value = false; error.value = '无法读取历史成绩，请重试。' } })
}
function toggle(key: typeof sort.value) {
    ascending.value = sort.value === key ? !ascending.value : key === 'title'
    sort.value = key
    page.value = 1
}
watch(() => [props.songId, props.mode, sort.value, ascending.value], () => { page.value = 1 })
watch(() => [props.songId, props.mode, props.pageSize, page.value, sort.value, ascending.value, songLanguage.value], reload, { immediate: true })
onUnmounted(() => subscription?.unsubscribe())
</script>
<template>
    <div class="history-table">
        <p v-if="error" role="alert">{{ error }} <button @click="reload">重试</button></p>
        <p v-if="loading" role="status" class="history-loading">正在读取历史…</p>
        <div class="table-scroll" :aria-busy="loading">
            <table class="score-table">
                <thead><tr><th v-for="column in columns" :key="column.key" :aria-sort="sort === column.key ? (ascending ? 'ascending' : 'descending') : 'none'"><button class="sort-button" @click="toggle(column.key)">{{ column.label }} {{ sort === column.key ? ascending ? '↑' : '↓' : '↕' }}</button></th><th v-if="deletable">操作</th></tr></thead>
                <tbody><tr v-for="row in rows" :key="row.id">
                    <td><button class="row gap-3 song-link" @click="emit('song', row)"><SongCover :src="row.coverSourceUrl" /><span class="song-copy"><strong>{{ row[songLanguage] }}</strong><small>{{ row.artist }}</small></span></button></td>
                    <td><span class="difficulty" :class="row.difficulty.toLowerCase()">{{ row.difficulty }} {{ row.level }}</span><small class="mode">{{ row.mode }}</small></td>
                    <td class="num score-num">{{ row.score.toLocaleString('en-US') }}<small>{{ getRankByScore(row.score) }} {{ row.ap ? 'AP' : row.fc ? 'FC' : '' }}{{ row.maxChain !== undefined ? ` · Max Chain ${row.maxChain}` : '' }}</small></td>
                    <td class="num rating-num">{{ row.rating.toFixed(2) }}</td>
                    <td><time :datetime="new Date(row.importedAt!).toISOString()">{{ new Date(row.importedAt!).toLocaleString() }}</time><small v-if="row.correctedAt">已修正</small></td>
                    <td v-if="deletable"><button class="icon-button" :disabled="!canWrite || loading" aria-label="删除历史成绩" @click="emit('remove', row)">删除</button></td>
                </tr></tbody>
            </table>
            <p v-if="!rows.length && !error && !loading" class="empty">暂无历史成绩</p>
        </div>
        <nav v-if="count > pageSize" class="table-pagination" aria-label="历史成绩分页"><span>第 {{ page }} / {{ Math.ceil(count / pageSize) }} 页 · 共 {{ count }} 条</span><div class="row gap-2"><button :disabled="page === 1 || loading" @click="page--">上一页</button><button :disabled="page * pageSize >= count || loading" @click="page++">下一页</button></div></nav>
    </div>
</template>
