<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Music2, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { songLanguage } from '../composables/useSettings'
import { getRankByScore } from '../core/rating/rank'
import type { DemoScore } from '../data/demo'
const props = defineProps<{ items: DemoScore[]; ranked?: boolean; editable?: boolean }>()
defineEmits<{ edit: [score: DemoScore]; remove: [score: DemoScore] }>()
type SortKey = 'position' | 'title' | 'difficulty' | 'level' | 'score' | 'rank' | 'rating'
const sortKey = ref<SortKey>(props.ranked ? 'position' : 'score')
const ascending = ref(props.ranked ?? false)
const ranks = ['E', 'D', 'C', 'B', 'A', 'AA', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+']
const positions = computed(() => new Map(props.items.map((s, i) => [s.id, i + 1])))
const columns = computed(() => [
    ...(props.ranked ? [{ keys: ['position'], labels: ['排名'], numeric: false }] : []),
    { keys: ['title'], labels: ['曲目'], numeric: false },
    { keys: ['difficulty', 'level'], labels: ['难度', '等级'], numeric: false },
    { keys: ['score'], labels: ['Score'], numeric: true },
    { keys: ['rank'], labels: ['Rank'], numeric: true },
    { keys: ['rating'], labels: ['Rating'], numeric: true },
])
function toggleSort(key: string) {
    if (sortKey.value === key) ascending.value = !ascending.value
    else {
        sortKey.value = key as SortKey
        ascending.value = ['title', 'position'].includes(key)
    }
}
function value(s: DemoScore): string | number {
    switch (sortKey.value) {
        case 'position': return positions.value.get(s.id)!
        case 'title': return s[songLanguage.value]
        case 'difficulty': return ['EASY', 'NORMAL', 'HARD', 'MASTER'].indexOf(s.difficulty)
        case 'level': return Number(s.level.replace('+', '')) + (s.level.includes('+') ? .5 : 0)
        case 'rank': return ranks.indexOf(getRankByScore(s.score))
        default: return s[sortKey.value]
    }
}
const sortedItems = computed(() => {
    const collator = new Intl.Collator(songLanguage.value === 'ja' ? 'ja' : 'en', { numeric: true, sensitivity: 'base' })
    return [...props.items].sort((a, b) => {
        const av = value(a), bv = value(b)
        const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv))
        return result * (ascending.value ? 1 : -1) || a.id - b.id
    })
})
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
                <tr v-for="s in sortedItems" :key="s.id">
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
</template>
