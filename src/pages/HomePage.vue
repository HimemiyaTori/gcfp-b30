<script setup lang="ts">
import { Activity, ArrowRight, ArrowLeftRight, CircleHelp, Disc3, FileImage, ShieldCheck, Sparkles, Upload } from 'lucide-vue-next'
import { ref } from 'vue'
import ScoreTable from '../components/ScoreTable.vue'
import RollingNumber from '../components/common/RollingNumber.vue'
import type { ScoreRow } from '../db/models'
import type { getModeB30, RatingMode } from '../core/rating/calculator'
defineProps<{ scores: ScoreRow[]; selectedRating: ReturnType<typeof getModeB30> }>()
const b30Mode = defineModel<RatingMode>('mode', { required: true })
const emit = defineEmits<{ upload: [files: File[]] }>()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
function selectFiles(files: FileList | null) {
    const selected = Array.from(files ?? [])
    if (fileInput.value) fileInput.value.value = ''
    if (selected.length) emit('upload', selected)
}
function drop(event: DragEvent) {
    dragging.value = false
    selectFiles(event.dataTransfer?.files ?? null)
}
</script>

<template>
    <section v-if="scores.length" class="stats-grid">
        <article class="rating-card">
            <div class="row gap-2">
                <Activity :size="16" /><span
                    >Groove Rating</span
                >
                <button
                    type="button"
                    :class="[
                        'metric-tag',
                        'rating-mode-toggle',
                        { advanced: b30Mode === 'ADVANCED' },
                    ]"
                    :aria-label="`当前 ${selectedRating.label}，切换到 ${b30Mode === 'BASIC' ? 'ADV' : 'BAS'}`"
                    @click="
                        b30Mode = b30Mode === 'BASIC' ? 'ADVANCED' : 'BASIC'
                    "
                >
                    <Transition name="mode-label" mode="out-in"><span :key="b30Mode">{{ b30Mode === 'BASIC' ? 'BAS' : 'ADV' }}</span></Transition>
                    <ArrowLeftRight :size="12" />
                </button>
            </div>
            <div class="rating-values">
                <div class="big-rating">
                    <RollingNumber :value="selectedRating.rating" :decimals="2" :motion-key="b30Mode" /><span>RT</span>
                </div>
                <div class="rating-floor">
                    <span>Floor</span>
                    <strong>{{
                        selectedRating.floor?.toFixed(2) ?? '—'
                    }}</strong
                    ><span>RT</span>
                </div>
            </div>
            <div class="metric-bottom">
                每一份热爱，都在这里累积 <span>↗</span>
            </div>
            <div class="orbit orbit-one"></div>
            <div class="orbit orbit-two"></div>
        </article>
        <article class="stat-card">
            <div class="between">
                <span>已收录成绩</span
                ><span class="stat-icon blue"
                    ><Disc3 :size="18"
                /></span>
            </div>
            <div class="stat-value">
                <RollingNumber :value="scores.length" /> <span>谱面</span>
            </div>
            <small>每张谱面，保留一份最佳成绩</small>
            <a href="#scores" class="text-link"
                >查看全部成绩 <ArrowRight :size="13"
            /></a>
        </article>
    </section>


    <section class="import-grid">
        <article class="panel import-panel">
            <div class="section-title between">
                <div class="row gap-2">
                    <Upload :size="18" />
                    <h2>录入新成绩</h2>
                </div>
                <span class="micro-label"
                    >SCORE IMPORT</span
                >
            </div>
            <label
                :class="['drop-zone', { dragging }]"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="drop"
            >
                <div class="upload-illustration">
                    <div class="image-sheet back"></div>
                    <div class="image-sheet">
                        <FileImage
                            :size="33"
                            :stroke-width="1.3"
                        /><span class="plus-bubble">+</span>
                    </div>
                </div>
                <h3>拖入或选择成绩截图 / Excel</h3>
                <input
                    ref="fileInput"
                    class="drop-zone-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.xlsx"
                    multiple
                    aria-label="选择成绩截图或 Excel"
                    @change="
                        selectFiles(
                            ($event.target as HTMLInputElement)
                                .files,
                        )
                    "
                /><small>PNG / JPG / WebP 可批量上传 · Excel 每次一个 .xlsx 文件</small>
            </label>
            <div class="import-foot between">
                <span class="row gap-2"
                    ><ShieldCheck :size="14" />
                    仅在本地识别截图、存储数据</span
                >
            </div>
        </article>
        <article class="guide-panel">
            <div class="row gap-2">
                <Sparkles :size="17" />
                <h2>从文件，到你的成绩库</h2>
            </div>
            <p class="guide-intro">少一点整理，多一点游戏。</p>
            <div
                v-for="(step, i) in [
                    {
                        title: '放入截图或 Excel',
                        text: '截图支持批量上传，Excel 可使用本站模板填写。',
                    },
                    {
                        title: '自动识别与整理',
                        text: '截图识别成功后录入，Excel 检查并预览后确认导入。',
                    },
                    {
                        title: '见证每一次突破',
                        text: '自动计算 Rating，更新你的个人 B30。',
                    },
                ]"
                :key="step.title"
                class="guide-step"
            >
                <span>{{
                    String(i + 1).padStart(2, '0')
                }}</span>
                <div>
                    <h3>{{ step.title }}</h3>
                    <p>{{ step.text }}</p>
                </div>
            </div>
            <div class="guide-tip">
                <CircleHelp :size="16" />
                <p>
                    识别有误？在成绩管理中修改分数。<br />未能识别的成绩也可以手动新增。
                </p>
            </div>
        </article>
    </section>

    <section class="panel">
        <div class="section-title between">
            <div class="row gap-2">
                <h2>成绩一览</h2>
                <span class="count-badge">{{
                    scores.length
                }}</span
                ><span class="muted section-subtitle"
                    >每一个好成绩，都值得再看一眼</span
                >
            </div>
            <a class="text-link" href="#scores"
                >查看全部 <ArrowRight :size="14"
            /></a>
        </div>
        <ScoreTable :items="scores.slice(0, 4)" />
    </section>
</template>
