import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { liveQuery } from 'dexie'
import { database } from '../db/database'
import type { ScoreRow } from '../db/models'
import { getScoreRow } from '../core/score/display'
import { songService } from '../core/song/songService'
import { createScoreComparator } from '../core/scoreSort'
import { songLanguage } from './useSettings'
import { useScoreSort } from './useScoreTable'

export function useScoreHistory(options: {
    songId?: MaybeRefOrGetter<string | undefined>
    mode?: MaybeRefOrGetter<string | undefined>
    pageSize?: number
    enabled?: MaybeRefOrGetter<boolean>
} = {}) {
    const rows = ref<ScoreRow[]>([])
    const count = ref(0)
    const page = ref(1)
    const error = ref('')
    const loading = ref(false)
    const pageSize = options.pageSize ?? 10
    const { sort, toggleSort, resetSort } = useScoreSort('importedAt')
    const enabled = () => toValue(options.enabled) ?? true
    const songId = () => toValue(options.songId)
    const mode = () => toValue(options.mode)
    const pageCount = computed(() => Math.max(1, Math.ceil(count.value / pageSize)))
    const pagination = computed(() => ({ page: page.value, pageCount: pageCount.value, total: count.value }))
    let subscription: { unsubscribe(): void } | undefined

    function reload() {
        subscription?.unsubscribe()
        subscription = undefined
        error.value = ''
        if (!enabled()) {
            rows.value = []
            count.value = 0
            loading.value = false
            return
        }
        loading.value = true
        const currentPage = page.value
        const { key, ascending } = sort.value
        const currentSongId = songId()
        const currentMode = mode()
        const language = songLanguage.value
        subscription = liveQuery(() => database.transaction('r', database.scoreHistory, async () => {
            let collection = database.scoreHistory.orderBy('importedAt')
            if (!ascending || key !== 'importedAt') collection = collection.reverse()
            collection = collection.filter(record => (!currentSongId || record.songId === currentSongId)
                && (!currentMode || songService.getChart(record.songId, record.chartId).chart.mode.toUpperCase() === currentMode))
            const total = await collection.clone().count()
            const offset = (currentPage - 1) * pageSize
            // 导入时间排序直接读取当前页，其他列在全部匹配历史中排序
            if (key === 'importedAt') {
                const records = await collection.offset(offset).limit(pageSize).toArray()
                return { total, items: records.map(record => getScoreRow(record, language)) }
            }
            const items = (await collection.toArray()).map(record => getScoreRow(record, language))
            if (key !== 'position') {
                const compare = createScoreComparator(key, language)
                items.sort((a, b) => compare(a, b) * (ascending ? 1 : -1) || b.id - a.id)
            }
            return { total, items: items.slice(offset, offset + pageSize) }
        })).subscribe({
            next: result => {
                count.value = result.total
                // 删除末页记录后回到有效页，并由页码变化重新查询
                if (currentPage > pageCount.value) {
                    page.value = pageCount.value
                    return
                }
                rows.value = result.items
                loading.value = false
            },
            error: () => {
                loading.value = false
                error.value = '无法读取历史成绩，请重试。'
            },
        })
    }

    watch([songId, mode, sort], () => { page.value = 1 })
    watch(enabled, active => {
        if (active) {
            resetSort()
            page.value = 1
        }
    })
    watch([enabled, songId, mode, sort, page, songLanguage], reload, { immediate: true })
    onUnmounted(() => subscription?.unsubscribe())
    return { rows, count, sort, toggleSort, page, pagination, error, loading, reload }
}
