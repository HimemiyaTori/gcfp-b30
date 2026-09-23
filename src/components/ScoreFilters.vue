<script setup lang="ts">
import { Search, SlidersHorizontal } from 'lucide-vue-next'
import { songLanguage } from '../composables/useSettings'
import { songCategories, type SongCategory } from '../data/categories'

const query = defineModel<string>('query', { required: true })
const category = defineModel<SongCategory | 'ALL'>('category', { required: true })
const mode = defineModel<string>('mode', { required: true })
const difficulty = defineModel<string>('difficulty', { required: true })
</script>

<template>
    <div class="filter-bar">
        <label class="search-field"
            ><Search :size="17" /><input
                v-model="query"
                placeholder="搜索日文 / 英文曲名、艺术家"
                aria-label="搜索成绩"
        /></label>
        <div class="row gap-2">
            <SlidersHorizontal :size="16" />
            <select v-model="category" aria-label="筛选歌曲分类">
                <option value="ALL">全部分类</option>
                <option
                    v-for="item in songCategories"
                    :key="item.id"
                    :value="item.id">
                    {{ item[songLanguage] }}
                </option>
            </select>
            <select v-model="mode" aria-label="筛选模式">
                <option value="ALL">全部模式</option>
                <option>BASIC</option>
                <option>ADVANCED</option>
            </select>
            <select v-model="difficulty" aria-label="筛选难度">
                <option value="ALL">全部难度</option>
                <option>MASTER</option>
                <option>HARD</option>
                <option>NORMAL</option>
                <option>EASY</option>
            </select>
        </div>
    </div>
</template>
