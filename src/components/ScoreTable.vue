<script setup lang="ts">
import { ArrowUpRight, Music2, Pencil, Trash2 } from 'lucide-vue-next'
import { songLanguage } from '../composables/useSettings'
import type { DemoScore } from '../data/demo'
defineProps<{ items: DemoScore[]; ranked?: boolean; editable?: boolean }>()
defineEmits<{ edit: [score: DemoScore]; remove: [score: DemoScore] }>()
</script>
<template>
    <div class="table-scroll">
        <table class="score-table">
            <thead>
                <tr>
                    <th v-if="ranked" class="position">排名</th>
                    <th>曲目 / 艺术家</th>
                    <th>谱面</th>
                    <th class="num">Score</th>
                    <th class="num">Rank</th>
                    <th class="num">Rating <ArrowUpRight :size="12" /></th>
                    <th v-if="editable">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(s, i) in items" :key="s.id">
                    <td
                        v-if="ranked"
                        class="position"
                        :class="{ podium: i < 3 }">
                        {{ String(i + 1).padStart(2, '0') }}
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
                        <span class="rank">{{ s.rank }}</span>
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
