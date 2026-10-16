import { computed, onUnmounted, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import Dexie, { liveQuery } from 'dexie'
import { database } from '../db/database'
import type { ScoreHistory, ScoreRow } from '../db/models'
import { getScoreRow } from '../core/score/display'
import { songService } from '../core/song/songService'
import { createScoreComparator } from '../core/scoreSort'
import { t } from '../i18n'
import { songLanguage } from './useSettings'
import { useScoreSort } from './useScoreTable'

export function useScoreHistory(options: {
    songId?: MaybeRefOrGetter<string | undefined>
    mode?: MaybeRefOrGetter<string | undefined>
    pageSize?: number
    enabled?: MaybeRefOrGetter<boolean>
} = {}) {
    const records = shallowRef<ScoreHistory[]>([])
    const count = ref(0), page = ref(1), failed = ref(false), loading = ref(false)
    const error = computed(() => failed.value ? t('errors.readHistory') : '')
    const pageSize = options.pageSize ?? 10
    const { sort, toggleSort, resetSort } = useScoreSort('importedAt')
    const enabled = () => toValue(options.enabled) ?? true
    const songId = () => toValue(options.songId)
    const mode = () => toValue(options.mode)
    const inMemory = () => sort.value.key !== 'importedAt'
    const pageCount = computed(() => Math.max(1, Math.ceil(count.value / pageSize)))
    const pagination = computed(() => ({ page: page.value, pageCount: pageCount.value, total: count.value }))
    const displayRows = computed(() => records.value.map(record => getScoreRow(record, songLanguage.value)))
    const sortedRows = computed(() => {
        const { key, ascending } = sort.value
        if (key === 'importedAt' || key === 'position') return displayRows.value
        const compare = createScoreComparator(key, songLanguage.value)
        return [...displayRows.value].sort((a, b) => compare(a, b) * (ascending ? 1 : -1) || b.id - a.id)
    })
    const rows = computed<ScoreRow[]>(() => inMemory()
        ? sortedRows.value.slice((page.value - 1) * pageSize, page.value * pageSize)
        : displayRows.value)
    let subscription: { unsubscribe(): void } | undefined
    let revision = 0
    let queryScope = ''

    function reload() {
        const current = ++revision
        subscription?.unsubscribe()
        subscription = undefined
        failed.value = false
        if (!enabled()) {
            records.value = []
            // 主动更新惰性计算缓存，关闭视图时释放完整排序数组
            void sortedRows.value
            queryScope = ''
            count.value = 0
            loading.value = false
            return
        }
        loading.value = true
        const currentPage = page.value
        const memory = inMemory(), ascending = sort.value.ascending
        const currentSongId = songId(), currentMode = mode()
        const scope = JSON.stringify([currentSongId, currentMode])
        if (scope !== queryScope) records.value = []
        else if (!memory) {
            records.value = records.value.slice(0, pageSize)
            void sortedRows.value
        }
        queryScope = scope
        subscription = liveQuery(() => database.transaction('r', database.scoreHistory, async () => {
            let collection = currentSongId
                ? database.scoreHistory.where('[songId+playedAt]').between([currentSongId, Dexie.minKey], [currentSongId, Dexie.maxKey])
                : database.scoreHistory.orderBy('playedAt')
            if (memory || !ascending) collection = collection.reverse()
            if (currentMode) collection = collection.filter(record => songService.getChart(record.songId, record.chartId).chart.mode.toUpperCase() === currentMode)
            // 完整匹配数据与页码、排序和语言解耦，翻页只截取已排序结果
            if (memory) {
                const items = await collection.toArray()
                return { total: items.length, items }
            }
            const total = await collection.clone().count()
            const items = await collection.offset((currentPage - 1) * pageSize).limit(pageSize).toArray()
            return { total, items }
        })).subscribe({
            next: result => {
                if (current !== revision) return
                count.value = result.total
                if (!memory && currentPage > pageCount.value) {
                    page.value = pageCount.value
                    return
                }
                records.value = result.items
                loading.value = false
            },
            error: () => {
                if (current !== revision) return
                loading.value = false
                failed.value = true
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
    watch(pageCount, maximum => { if (page.value > maximum) page.value = maximum })
    watch([enabled, songId, mode, inMemory, () => inMemory() ? 0 : page.value, () => inMemory() ? false : sort.value.ascending], reload, { immediate: true })
    onUnmounted(() => { revision++; subscription?.unsubscribe(); records.value = []; void sortedRows.value })
    return { rows, count, sort, toggleSort, page, pagination, error, loading, reload }
}
