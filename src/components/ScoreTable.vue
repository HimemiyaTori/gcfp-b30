<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Music2, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { songLanguage } from '../composables/useSettings'
import { getRankByScore } from '../core/rating/rank'
import { createScoreComparator, type ScoreSortKey } from '../core/scoreSort'
import type { DemoScore } from '../data/demo'
const props = defineProps<{
    items: DemoScore[]
    positionItems?: DemoScore[]
    ranked?: boolean
    editable?: boolean
}>()
defineEmits<{ edit: [score: DemoScore]; remove: [score: DemoScore] }>()
type SortKey = 'position' | ScoreSortKey
const sortKey = ref<SortKey>(
    props.ranked ? 'position' : props.editable ? 'updatedAt' : 'score',
)
const ascending = ref(props.ranked ?? false)
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
function formatUpdatedDate(timestamp: number) {
    const date = new Date(timestamp)
    return (date.getFullYear() === new Date().getFullYear()
        ? monthDayFormatter
        : fullDateFormatter
    ).format(date)
}
const positions = computed(() =>
    new Map((props.positionItems ?? props.items).map((s, i) => [s.id, i + 1])),
)
const columns = computed(() => [
    ...(props.ranked ? [{ keys: ['position'], labels: ['排名'], numeric: false }] : []),
    { keys: ['title'], labels: ['曲目'], numeric: false },
    { keys: ['difficulty', 'level'], labels: ['难度', '等级'], numeric: false },
    { keys: ['score'], labels: ['Score'], numeric: true },
    { keys: ['rank'], labels: ['Rank'], numeric: true },
    { keys: ['rating'], labels: ['Rating'], numeric: true },
    ...(props.editable || props.ranked
        ? [{ keys: ['updatedAt'], labels: ['更新时间'], numeric: false }]
        : []),
])
function toggleSort(key: string) {
    if (sortKey.value === key) ascending.value = !ascending.value
    else {
        sortKey.value = key as SortKey
        ascending.value = ['title', 'position'].includes(key)
    }
}
const sortedItems = computed(() => {
    if (sortKey.value === 'position') {
        return ascending.value ? [...props.items] : [...props.items].reverse()
    }
    const direction = ascending.value ? 1 : -1
    const compare = createScoreComparator(sortKey.value, songLanguage.value, {
        primaryOnly: props.ranked,
    })
    return props.items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => compare(a.item, b.item) * direction || a.index - b.index)
        .map(({ item }) => item)
})
const pageSize = 30
const currentPage = ref(1)
const pageCount = computed(() => Math.ceil(sortedItems.value.length / pageSize))
const visibleItems = computed(() =>
    props.editable
        ? sortedItems.value.slice(
              (currentPage.value - 1) * pageSize,
              currentPage.value * pageSize,
          )
        : sortedItems.value,
)
watch([() => props.items, sortKey, ascending], () => (currentPage.value = 1))
</script>
<template>
    <div class="table-scroll">
        <table class="score-table">
            <thead>
                <tr>
                    <th v-for="column in columns" :key="column.keys[0]" :class="{ num: column.numeric, position: column.keys[0] === 'position' }" :aria-sort="column.keys.includes(sortKey) ? (ascending ? 'ascending' : 'descending') : 'none'">
                        <div class="sort-head" :class="{ 'sort-numeric': column.numeric }">
                            <button v-for="(key, i) in column.keys" :key="key" class="sort-button" :class="{ selected: sortKey === key }" :aria-label="`${column.labels[i]}：${sortKey === key ? (ascending ? '当前升序，点击降序' : '当前降序，点击升序') : '点击排序'}`" @click="toggleSort(key)">
                                {{ column.labels[i] }}
                                <ArrowUp v-if="sortKey === key && ascending" :size="12" />
                                <ArrowDown v-else-if="sortKey === key" :size="12" />
                                <ArrowUpDown v-else :size="11" />
                            </button>
                        </div>
                    </th>
                    <th v-if="editable">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="s in visibleItems" :key="s.id">
                    <td
                        v-if="ranked"
                        class="position"
                        :class="{ podium: (positions.get(s.id) ?? 0) <= 3 }">
                        {{ String(positions.get(s.id)).padStart(2, '0') }}
                    </td>
                    <td>
                        <div class="row gap-3">
                            <div class="song-art" :style="{ '--art': s.color }">
                                {{ s.symbol }}
                            </div>
                            <div class="song-copy">
                                <strong>{{ s[songLanguage] }}</strong
                                ><small>{{ s.artist }}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="row gap-2">
                            <span
                                class="difficulty"
                                :class="s.difficulty.toLowerCase()"
                                >{{ s.difficulty }}</span
                            ><b class="level">{{ s.level }}</b>
                        </div>
                        <small class="mode">{{ s.mode }}</small>
                    </td>
                    <td class="num score-num">
                        {{ s.score.toLocaleString('en-US') }}
                    </td>
                    <td class="num">
                        <span class="rank">{{ getRankByScore(s.score) }}</span>
                    </td>
                    <td class="num rating-num">{{ s.rating.toFixed(2) }}</td>
                    <td v-if="editable || ranked" class="updated-at">
                        <time :datetime="new Date(s.updatedAt).toISOString()">
                            <span class="updated-date">{{ formatUpdatedDate(s.updatedAt) }}</span>
                            <span class="updated-time">{{ timeFormatter.format(s.updatedAt) }}</span>
                        </time>
                    </td>
                    <td v-if="editable">
                        <button
                            class="icon-button"
                            aria-label="编辑成绩"
                            @click="$emit('edit', s)">
                            <Pencil :size="16" /></button
                        ><button
                            class="icon-button"
                            aria-label="删除成绩"
                            @click="$emit('remove', s)">
                            <Trash2 :size="15" />
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
        <div v-if="!items.length" class="empty">
            <Music2 :size="32" />
            <h3>暂时没有成绩</h3>
            <p>试试其他筛选条件，或录入你的第一份成绩。</p>
        </div>
    </div>
    <nav
        v-if="editable && pageCount > 1"
        class="table-pagination"
        aria-label="成绩分页">
        <span>第 {{ currentPage }} / {{ pageCount }} 页</span>
        <div class="row gap-2">
            <button
                type="button"
                :disabled="currentPage === 1"
                @click="currentPage--">
                上一页
            </button>
            <button
                type="button"
                :disabled="currentPage === pageCount"
                @click="currentPage++">
                下一页
            </button>
        </div>
    </nav>
</template>
