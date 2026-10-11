import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { ScoreRow } from '../db/models'
import { createScoreComparator, type ScoreTableSort, type ScoreTableSortKey } from '../core/scoreSort'
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

export function useScoreTable(
    items: MaybeRefOrGetter<readonly ScoreRow[]>,
    options: { sortKey: ScoreTableSortKey; ascending?: boolean; pageSize?: number; ranked?: boolean },
) {
    const { sort, toggleSort, resetSort } = useScoreSort(options.sortKey, options.ascending)
    const page = ref(1)
    const sortedItems = computed(() => {
        const rows = [...toValue(items)]
        const { key, ascending } = sort.value
        if (key === 'position') return ascending ? rows : rows.reverse()
        const compare = createScoreComparator(key, songLanguage.value, { primaryOnly: options.ranked })
        return rows.sort((a, b) => compare(a, b) * (ascending ? 1 : -1))
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
