import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { compareChartIdentity, createScoreComparator, lacksSortMetric, type ScoreTableSort, type ScoreTableSortKey, type SortableChart } from '../core/scoreSort'
import { songLanguage } from './useSettings'

export function useScoreSort(key: ScoreTableSortKey, ascending = false) {
    const sort = ref<ScoreTableSort>({ key, ascending })
    function toggleSort(nextKey: ScoreTableSortKey) {
        sort.value = {
            key: nextKey,
            ascending: sort.value.key === nextKey
                ? !sort.value.ascending
                : nextKey === 'title' || nextKey === 'position',
        }
    }
    function resetSort() {
        sort.value = { key, ascending }
    }
    return { sort, toggleSort, resetSort }
}

export function useScoreTable<T extends SortableChart>(
    items: MaybeRefOrGetter<readonly T[]>,
    options: { sortKey: ScoreTableSortKey; ascending?: boolean; pageSize?: number; ranked?: boolean },
) {
    const { sort, toggleSort, resetSort } = useScoreSort(options.sortKey, options.ascending)
    const page = ref(1)
    const sortedItems = computed(() => {
        const rows = [...toValue(items)]
        const { key, ascending } = sort.value
        if (key === 'position') return ascending ? rows : rows.reverse()
        const language = songLanguage.value
        const compare = createScoreComparator(key, language, { primaryOnly: options.ranked })
        // 没有分数或时间的谱面固定排在后面，彼此按曲名、模式、难度排列
        return rows.sort((a, b) => {
            const blankA = lacksSortMetric(a, key)
            const blankB = lacksSortMetric(b, key)
            if (blankA || blankB) {
                if (blankA !== blankB) return blankA ? 1 : -1
                return compareChartIdentity(a, b, language)
            }
            return compare(a, b) * (ascending ? 1 : -1)
        })
    })
    const pageCount = computed(() => options.pageSize
        ? Math.max(1, Math.ceil(sortedItems.value.length / options.pageSize))
        : 1,
    )
    const rows = computed(() => options.pageSize
        ? sortedItems.value.slice((page.value - 1) * options.pageSize, page.value * options.pageSize)
        : sortedItems.value,
    )
    const pagination = computed(() => ({ page: page.value, pageCount: pageCount.value }))
    watch([() => toValue(items), sort], () => { page.value = 1 })
    return { rows, sort, toggleSort, resetSort, page, pagination }
}
