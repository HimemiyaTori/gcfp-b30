<script setup lang="ts">
import {
    Activity,
    ArrowDownToLine,
    ArrowRight,
    Check,
    CheckCircle2,
    CircleHelp,
    Disc3,
    FileImage,
    LayoutGrid,
    ListMusic,
    LoaderCircle,
    Monitor,
    Moon,
    Music2,
    Plus,
    Search,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Sun,
    Trophy,
    Upload,
    X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { songCategories, type SongCategory } from './data/categories'
import { getRankByScore } from './core/rating/rank'
import { getChartRating } from './core/rating/calculator'
import AnimatedProgress from './components/common/AnimatedProgress.vue'
import CardTransition from './components/common/CardTransition.vue'
import { motionTiming } from './components/common/motion'
import ScoreTable from './components/ScoreTable.vue'
import { isDark, songLanguage, theme } from './composables/useSettings'
import { demoScores, type DemoScore } from './data/demo'
const { t } = useI18n()
const navigation = [
    { id: 'home', icon: LayoutGrid },
    { id: 'scores', icon: ListMusic },
    { id: 'b30', icon: Trophy },
    { id: 'settings', icon: Settings2 },
] as const
type Page = (typeof navigation)[number]['id']
const page = ref<Page>('home')
function readHash() {
    const id = location.hash.slice(1)
    page.value = navigation.some((n) => n.id === id) ? (id as Page) : 'home'
}
onMounted(() => {
    readHash()
    window.addEventListener('hashchange', readHash)
})
onUnmounted(() => {
    window.removeEventListener('hashchange', readHash)
    clearTimeout(timer)
})
const category = ref<SongCategory | 'ALL'>('ALL')
const query = ref(''),
    difficulty = ref('ALL'),
    mode = ref('ALL'),
    emptyPreview = ref(false)
const scores = computed(() => (emptyPreview.value ? [] : demoScores))
const b30 = computed(() =>
    [...scores.value].sort((a, b) => b.rating - a.rating).slice(0, 30),
)
const totalRating = computed(() =>
    (
        Math.floor(
            b30.value.reduce((sum, s) => sum + Math.round(s.rating * 100), 0) /
                30,
        ) / 100
    ).toFixed(2),
)
const filtered = computed(() =>
    scores.value.filter(
        (s) =>
            `${s.ja} ${s.en} ${s.artist}`
                .toLowerCase()
                .includes(query.value.toLowerCase()) &&
            (difficulty.value === 'ALL' || s.difficulty === difficulty.value) &&
            (mode.value === 'ALL' || s.mode === mode.value) &&
            (category.value === 'ALL' || s.category === category.value),
    ),
)
const fileInput = ref<HTMLInputElement>(),
    dragging = ref(false)
type ImportJob = { name: string; index: number; status: 'queued' | 'running' | 'success' | 'failed'; error: string }
const importDialog = ref<HTMLDialogElement>()
const jobs = ref<ImportJob[]>([])
const completed = computed(() => jobs.value.filter(j => j.status === 'success' || j.status === 'failed').length)
const failures = computed(() => jobs.value.filter(j => j.status === 'failed'))
const importing = computed(() => jobs.value.some(j => j.status === 'running' || j.status === 'queued'))
let timer: ReturnType<typeof setTimeout>
function clearJobs() {
    clearTimeout(timer)
    importDialog.value?.close()
    jobs.value = []
}
function startImport(entries: { name: string; error?: string }[]) {
    clearJobs()
    jobs.value = entries.map((j, i) => ({ name: j.name, index: i + 1, status: 'queued', error: j.error ?? '' }))
    importDialog.value?.showModal()
    function process(index: number) {
        const job = jobs.value[index]
        if (!job) {
            if (!failures.value.length) {
                // Let the final progress segment reach 100% before closing the dialog.
                const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress + 40
                timer = setTimeout(() => {
                    importDialog.value?.close()
                    notify(`已完成 ${jobs.value.length} 张截图的录入流程演示，未写入成绩。`, '录入完成')
                    jobs.value = []
                }, delay)
            }
            return
        }
        job.status = 'running'
        timer = setTimeout(() => {
            job.status = job.error ? 'failed' : 'success'
            process(index + 1)
        }, 650)
    }
    process(0)
}
function simulate(withErrors = false) {
    startImport([
        { name: 'FP_result_001.png' },
        { name: 'FP_result_002.png', error: withErrors ? '未匹配到曲目。请使用完整、清晰的成绩截图，或手动新增该成绩。' : '' },
        { name: 'FP_result_003.png', error: withErrors ? '无法解析 Score：分数区域不完整。请重新截取完整成绩画面。' : '' },
    ])
}
function selectFiles(files: FileList | null) {
    if (!files?.length) return
    startImport(Array.from(files).map(f => ({
        name: f.name,
        error: !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) ? '不支持的图片格式，请选择 PNG、JPG 或 WebP。' : f.size === 0 ? '图片文件为空，请重新选择。' : '',
    })))
    if (fileInput.value) fileInput.value.value = ''
}
function drop(e: DragEvent) {
    dragging.value = false
    selectFiles(e.dataTransfer?.files ?? null)
}
watch(page, () => {
    clearJobs()
    dragging.value = false
})
const deleteDialog = ref<HTMLDialogElement>(),
    deleting = ref<DemoScore | null>(null)
function openDelete(s: DemoScore) {
    deleting.value = s
    deleteDialog.value?.showModal()
}
const toast = ref(''), toastTitle = ref('')
let toastTimer: ReturnType<typeof setTimeout>
function notify(message: string, title = '提示') {
    clearTimeout(toastTimer)
    toast.value = message
    toastTitle.value = title
    toastTimer = setTimeout(() => toast.value = '', 5000)
}
const dialog = ref<HTMLDialogElement>(), editing = ref<DemoScore | null>(null)
const inputScore = ref<number | string>(1040000)
const songQuery = ref(''), selectedSong = ref(1)
const editorMode = ref('ADVANCED'), editorDifficulty = ref('MASTER')
const songOptions = demoScores.filter((s, i, all) => all.findIndex(other => other.ja === s.ja) === i)
const filteredSongs = computed(() => songOptions.filter(s => `${s.ja} ${s.en} ${s.artist}`.toLocaleLowerCase().includes(songQuery.value.trim().toLocaleLowerCase())))
const currentSong = computed(() => songOptions.find(s => s.id === selectedSong.value)!)
// Prototype chart catalogue: expose both modes without claiming authoritative chart data.
const chartOptions = computed(() => demoScores.filter(s => s.ja === currentSong.value.ja))
const currentChart = computed(() => editing.value ?? chartOptions.value.find(s => s.difficulty === editorDifficulty.value)!)
const chartBase = computed(() => Number(currentChart.value.level.replace('+', '')) + (currentChart.value.level.includes('+') ? .5 : 0))
const validScore = computed(() => inputScore.value !== '' && Number.isInteger(Number(inputScore.value)) && Number(inputScore.value) >= 0 && Number(inputScore.value) <= 1050000)
const liveRank = computed(() => validScore.value ? getRankByScore(Number(inputScore.value)) : '—')
const liveRating = computed(() => validScore.value ? getChartRating(Number(inputScore.value), chartBase.value).toFixed(2) : '—')
const lowered = computed(() => editing.value && Number(inputScore.value) < editing.value.score)
function openEditor(s?: DemoScore) {
    editing.value = s ?? null
    selectedSong.value = songOptions.find(song => song.ja === s?.ja)?.id ?? songOptions[0]!.id
    songQuery.value = ''
    editorMode.value = s?.mode ?? 'ADVANCED'
    editorDifficulty.value = s?.difficulty ?? 'MASTER'
    inputScore.value = s?.score ?? 1040000
    dialog.value?.showModal()
}
function previewSave() {
    if (!validScore.value) return
    dialog.value?.close()
    notify('表单交互演示完成。当前为视觉原型，成绩数据未写入。')
}
onUnmounted(() => clearTimeout(toastTimer))
</script>

<template>
    <div class="app-shell">
        <aside class="sidebar stack">
            <a href="#home" class="brand row gap-3"
                ><span class="brand-mark"><Activity :size="24" /></span>
                <div>
                    <strong>GROOVE<span>ARCHIVE</span></strong
                    ><small>FUTURE PERFORMERS</small>
                </div></a
            >
            <div class="sidebar-caption">我的音乐旅程</div>
            <nav class="stack gap-2">
                <a
                    v-for="n in navigation"
                    :key="n.id"
                    :href="`#${n.id}`"
                    :class="['nav-item row gap-3', { active: page === n.id }]"
                    :aria-current="page === n.id ? 'page' : undefined"
                    ><component :is="n.icon" :size="19" /><span>{{
                        t(`nav.${n.id}`)
                    }}</span
                    ><span v-if="n.id === 'b30'" class="nav-badge">30</span
                    ><span v-if="page === n.id" class="active-dot"></span
                ></a>
            </nav>
            <div class="sidebar-bottom">
                <div class="local-note">
                    <ShieldCheck :size="20" /><strong
                        >留在本地，专注节奏。</strong
                    >
                    <p>
                        正式版将在浏览器本地处理截图，<br />只保存你的结构化成绩。
                    </p>
                    <span>LOCAL FIRST <span class="tiny-dot"></span></span>
                </div>
                <div class="sidebar-footer row between">
                    <span>FP 成绩管理工具</span><span>v0.1</span>
                </div>
            </div>
        </aside>
        <div class="workspace">
            <header class="topbar between">
                <a href="#home" class="game-identity" aria-label="Groove Coaster Future Performers B30 首页">
                    <img class="game-logo" src="/images/gcfp-logo.png" alt="Groove Coaster Future Performers" width="700" height="296" />
                    <span class="game-edition">B30</span>
                </a>
                <div class="row gap-4">
                    <span class="preview-pill"
                        ><span class="tiny-dot"></span> 界面预览</span
                    ><button
                        class="icon-button"
                        :aria-label="isDark ? '切换亮色主题' : '切换深色主题'"
                        @click="theme = isDark ? 'light' : 'dark'">
                        <Sun v-if="isDark" :size="19" /><Moon
                            v-else
                            :size="19" />
                    </button>
                    <div class="avatar">FP</div>
                </div>
            </header>
            <main>
                <div class="page-heading between">
                    <div>
                        <div class="eyebrow">
                            {{
                                page === 'home'
                                    ? 'EVERY PLAY COUNTS'
                                    : page === 'b30'
                                      ? 'YOUR BEST PERFORMANCES'
                                      : page === 'scores'
                                        ? 'YOUR PERSONAL COLLECTION'
                                        : 'MAKE IT YOURS'
                            }}
                        </div>
                        <h1>
                            {{
                                page === 'home'
                                    ? '让每一份成绩，都有迹可循。'
                                    : t(`nav.${page}`)
                            }}
                        </h1>
                        <p>
                            {{
                                page === 'home'
                                    ? '记录热爱，收集进步。下一次，向更高的 Rating 出发。'
                                    : page === 'b30'
                                      ? '最好的 30 张谱面，记录属于你的节奏。'
                                      : page === 'scores'
                                        ? '回顾每一次发挥，整理你的个人最佳成绩。'
                                        : '调整外观与曲目信息，让这里更像你的空间。'
                            }}
                        </p>
                    </div>
                    <button
                        v-if="page === 'scores'"
                        class="button primary"
                        @click="openEditor()">
                        <Plus :size="17" /> 手动新增
                    </button>
                    <div
                        v-if="page === 'home' || page === 'b30'"
                        class="demo-label">
                        DEMO DATA <span>演示数据</span>
                    </div>
                </div>

                <template v-if="page === 'home' || page === 'b30'">
                    <section class="stats-grid">
                        <article class="rating-card">
                            <div class="row gap-2">
                                <Activity :size="16" /><span>Groove Rating</span
                                ><span class="metric-tag">B30</span>
                            </div>
                            <div class="big-rating">
                                {{ totalRating }}<span>RT</span>
                            </div>
                            <div class="metric-bottom">
                                每一份热爱，都在这里累积 <span>↗</span>
                            </div>
                            <div class="orbit orbit-one"></div>
                            <div class="orbit orbit-two"></div>
                        </article>
                        <article class="stat-card">
                            <div class="between">
                                <span>B30 入选谱面</span
                                ><span class="stat-icon"
                                    ><Trophy :size="18"
                                /></span>
                            </div>
                            <div class="stat-value">
                                {{ b30.length }} <span>/ 30</span>
                            </div>
                            <div class="progress-track">
                                <i
                                    :style="{
                                        width: `${(b30.length / 30) * 100}%`,
                                    }"></i>
                            </div>
                            <small>{{
                                b30.length === 30
                                    ? '你的最佳表现，已全部就位'
                                    : '不足 30 张谱面时，总 RT 仍除以 30'
                            }}</small>
                        </article>
                        <article class="stat-card">
                            <div class="between">
                                <span>B30 Floor</span
                                ><span class="stat-icon amber"
                                    ><ArrowDownToLine :size="18"
                                /></span>
                            </div>
                            <div class="stat-value">
                                {{ b30.at(-1)?.rating.toFixed(2) ?? '—' }}
                                <span>RT</span>
                            </div>
                            <small>B30 最后一张谱面的 Rating</small>
                            <div class="subtle-note">向着下一个突破点前进</div>
                        </article>
                        <article class="stat-card">
                            <div class="between">
                                <span>已收录成绩</span
                                ><span class="stat-icon blue"
                                    ><Disc3 :size="18"
                                /></span>
                            </div>
                            <div class="stat-value">
                                {{ scores.length }} <span>谱面</span>
                            </div>
                            <small>每张谱面，保留一份最佳成绩</small
                            ><a href="#scores" class="text-link"
                                >查看全部成绩 <ArrowRight :size="13"
                            /></a>
                        </article>
                    </section>
                </template>

                <template v-if="page === 'home'">
                    <section class="import-grid">
                        <article class="panel import-panel">
                            <div class="section-title between">
                                <div class="row gap-2">
                                    <Upload :size="18" />
                                    <h2>录入新成绩</h2>
                                </div>
                                <span class="micro-label"
                                    >SCREENSHOT IMPORT</span
                                >
                            </div>
                            <div
                                :class="['drop-zone', { dragging }]"
                                @dragover.prevent="dragging = true"
                                @dragleave.prevent="dragging = false"
                                @drop.prevent="drop">
                                <div class="upload-illustration">
                                    <div class="image-sheet back"></div>
                                    <div class="image-sheet">
                                        <FileImage
                                            :size="33"
                                            :stroke-width="1.3" /><span
                                            class="plus-bubble"
                                            >+</span
                                        >
                                    </div>
                                </div>
                                <h3>把精彩瞬间，拖到这里</h3>
                                <p>拖入成绩截图，或选择文件开始录入</p>
                                <button
                                    class="button primary"
                                    @click="fileInput?.click()">
                                    <Plus :size="16" /> 选择成绩截图</button
                                ><input
                                    ref="fileInput"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    hidden
                                    @change="
                                        selectFiles(
                                            ($event.target as HTMLInputElement)
                                                .files,
                                        )
                                    " /><small
                                    >PNG / JPG / WebP · 支持多张选择</small
                                >
                            </div>
                            <div class="import-foot between">
                                <span class="row gap-2"
                                    ><ShieldCheck :size="14" />
                                    截图仅用于当前预览，不上传、不保存</span
                                ><button class="text-link" @click="simulate(false)">
                                    演示成功 <ArrowRight :size="13" />
                                </button>
                                <button class="text-link" @click="simulate(true)">演示识别错误</button>
                            </div>
                        </article>
                        <article class="guide-panel">
                            <div class="row gap-2">
                                <Sparkles :size="17" />
                                <h2>从截图，到你的成绩库</h2>
                            </div>
                            <p class="guide-intro">少一点整理，多一点游戏。</p>
                            <div
                                v-for="(step, i) in [
                                    {
                                        title: '放入成绩截图',
                                        text: '支持单张或批量添加完整的游戏成绩截图。',
                                    },
                                    {
                                        title: '自动识别与整理',
                                        text: '识别曲目、谱面和分数，成功后直接录入。',
                                    },
                                    {
                                        title: '见证每一次突破',
                                        text: '自动计算 Rating，更新你的个人 B30。',
                                    },
                                ]"
                                :key="step.title"
                                class="guide-step">
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

                <template v-if="page === 'scores'">
                    <section class="panel">
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
                                    <option v-for="item in songCategories" :key="item.id" :value="item.id">{{ item[songLanguage] }}</option>
                                </select><select
                                    v-model="mode"
                                    aria-label="筛选模式">
                                    <option value="ALL">全部模式</option>
                                    <option>BASIC</option>
                                    <option>ADVANCED</option></select
                                ><select
                                    v-model="difficulty"
                                    aria-label="筛选难度">
                                    <option value="ALL">全部难度</option>
                                    <option>MASTER</option>
                                    <option>HARD</option>
                                    <option>NORMAL</option>
                                    <option>EASY</option>
                                </select>
                            </div>
                        </div>
                        <div class="list-meta between">
                            <span
                                >共 {{ filtered.length }} 张谱面
                                <span class="muted">· 当前最高成绩</span></span
                            ><span class="demo-label">演示数据</span>
                        </div>
                        <ScoreTable
                            :items="filtered"
                            editable
                            @edit="openEditor"
                            @remove="openDelete" />
                    </section>
                </template>

                <template v-if="page === 'b30'">
                    <section class="panel">
                        <div class="section-title between">
                            <div class="row gap-2">
                                <Trophy :size="18" />
                                <h2>Best 30</h2>
                                <span class="count-badge"
                                    >{{ b30.length }} 谱面</span
                                >
                            </div>
                            <span class="muted">点击表头排序 · 排名保留 B30 原名次</span>
                        </div>
                        <ScoreTable :items="b30" ranked />
                    </section>
                    <p class="rating-explainer">
                        <CircleHelp :size="15" /> 总 RT 为前 30 张谱面 Rating
                        之和 ÷ 30；不足 30 张时按 0
                        补足。相同曲目的不同谱面可分别入选。
                    </p>
                </template>

                <template v-if="page === 'settings'">
                    <section class="panel settings-panel">
                        <div class="section-title"><h2>外观与显示</h2></div>
                        <div class="setting-row">
                            <div>
                                <h3>界面主题</h3>
                                <p>为你的下一段音乐旅程，挑选合适的底色。</p>
                            </div>
                            <div class="theme-options">
                                <button
                                    v-for="option in [
                                        {
                                            id: 'light',
                                            label: '亮色',
                                            icon: Sun,
                                        },
                                        {
                                            id: 'dark',
                                            label: '深色',
                                            icon: Moon,
                                        },
                                        {
                                            id: 'system',
                                            label: '跟随系统',
                                            icon: Monitor,
                                        },
                                    ] as const"
                                    :key="option.id"
                                    :class="{ selected: theme === option.id }"
                                    @click="theme = option.id">
                                    <component :is="option.icon" :size="21" />
                                    <span>{{ option.label }} </span>
                                    <Check
                                        v-if="theme === option.id"
                                        :size="13" />
                                </button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div>
                                <h3>界面语言</h3>
                                <p>当前版本提供简体中文界面。</p>
                            </div>
                            <span class="setting-value">
                                简体中文
                                <Check :size="15" />
                            </span>
                        </div>
                        <div class="setting-row">
                            <div>
                                <h3>曲目信息语言</h3>
                                <p>切换曲名显示语言，不影响搜索与成绩关联。</p>
                            </div>
                            <div class="segmented">
                                <button
                                    :class="{ selected: songLanguage === 'ja' }"
                                    @click="songLanguage = 'ja'">
                                    日本語
                                </button>
                                <button
                                    :class="{ selected: songLanguage === 'en' }"
                                    @click="songLanguage = 'en'">
                                    English
                                </button>
                            </div>
                        </div>
                    </section>
                    <section class="panel settings-panel">
                        <div class="section-title"><h2>原型预览</h2></div>
                        <div class="setting-row">
                            <div>
                                <h3>空数据状态</h3>
                                <p>
                                    查看尚未录入成绩时的首页、成绩列表和 B30。
                                </p>
                            </div>
                            <button
                                role="switch"
                                :aria-checked="emptyPreview"
                                aria-label="空数据状态"
                                :class="['switch', { on: emptyPreview }]"
                                @click="emptyPreview = !emptyPreview">
                                <span></span>
                            </button>
                        </div>
                        <div class="prototype-note">
                            <Music2 :size="22" />
                            <div>
                                <strong>先确定形式，再让功能发生。</strong>
                                <p>
                                    当前曲目、分数和 Rating
                                    均为视觉演示数据，非正式曲库。截图识别、成绩写入及编辑保存尚未接入；仅外观偏好保存在本机。
                                </p>
                            </div>
                        </div>
                    </section>
                </template>
                <footer class="page-footer between">
                    <span>
                        GROOVE ARCHIVE
                        <span class="footer-dot">·</span>
                        为每一次热爱留个记录
                    </span>
                    <span>
                        前端视觉原型
                        <span class="footer-dot">/</span>
                        示例成绩仅供预览
                    </span>
                </footer>
            </main>
        </div>
        <dialog
            ref="dialog"
            class="editor-dialog"
            @click="$event.target === dialog && dialog?.close()">
            <form @submit.prevent="previewSave">
                <div class="between">
                    <div>
                        <div class="eyebrow">SCORE PREVIEW</div>
                        <h2>{{ editing ? '编辑成绩' : '手动新增成绩' }}</h2>
                    </div>
                    <button
                        type="button"
                        class="icon-button"
                        aria-label="关闭弹窗"
                        @click="dialog?.close()">
                        <X :size="20" />
                    </button>
                </div>
                <p class="muted">
                    {{
                        editing
                            ? '编辑仅修改 Score，曲目与谱面保持不变。'
                            : '选择曲目与谱面，记录你的精彩发挥。'
                    }}
                </p>
                <div class="song-picker">
                    <label v-if="!editing">搜索曲目<input v-model="songQuery" type="search" placeholder="输入日文 / 英文曲名或艺术家" /></label>
                    <div v-if="!editing" class="song-options" aria-label="曲目搜索结果">
                        <button v-for="song in filteredSongs" :key="song.id" type="button" :class="{ selected: selectedSong === song.id }" :aria-pressed="selectedSong === song.id" @click="selectedSong = song.id">
                            <span>{{ song[songLanguage] }}<small>{{ song.artist }}</small></span><Check v-if="selectedSong === song.id" :size="16" />
                        </button>
                        <p v-if="!filteredSongs.length" class="form-note">未找到匹配曲目，试试其他关键词。已选曲目保持不变。</p>
                    </div>
                    <div class="selected-song"><small>{{ editing ? '当前曲目' : '已选曲目' }}</small><strong>{{ currentSong[songLanguage] }}</strong></div>
                </div>
                <fieldset class="chart-picker" :disabled="!!editing"><legend>模式</legend><div class="chart-buttons">
                    <button v-for="item in [{ id: 'BASIC', label: 'BASIC' }, { id: 'ADVANCED', label: 'ADV' }]" :key="item.id" type="button" :aria-pressed="editorMode === item.id" :class="{ selected: editorMode === item.id }" @click="editorMode = item.id">{{ item.label }}</button>
                </div></fieldset>
                <fieldset class="chart-picker" :disabled="!!editing"><legend>难度</legend><div class="chart-buttons">
                    <button v-for="chart in chartOptions" :key="chart.id" type="button" :aria-pressed="editorDifficulty === chart.difficulty" :class="{ selected: editorDifficulty === chart.difficulty }" @click="editorDifficulty = chart.difficulty">{{ chart.difficulty }} {{ chart.level }}</button>
                </div></fieldset>
                <label>Score<input v-model="inputScore" type="number" min="0" max="1050000" step="1" required /></label>
                <div class="live-metrics" aria-live="polite">
                    <div><small>Rank</small><strong>{{ liveRank }}</strong></div>
                    <div><small>歌曲定数 → 单曲 Rating</small><strong>{{ chartBase.toFixed(1) }} <span>→</span> {{ liveRating }}</strong></div>
                </div>
                <p v-if="!validScore" class="error">
                    请输入 0～1,050,000 范围内的整数。
                </p>
                <p v-if="lowered" class="warning">
                    将调低「{{ editing?.[songLanguage] }}」的成绩，正式保存时
                    Rank 与 Rating 会重新计算。
                </p>
                <div class="form-note">
                    Rank 与 Rating 随 Score 实时计算。谱面定数为演示配置；当前仅预览表单，不会保存成绩。
                </div>
                <div class="dialog-actions">
                    <button
                        type="button"
                        class="button secondary"
                        @click="dialog?.close()">
                        取消</button
                    ><button class="button primary" :disabled="!validScore">
                        预览保存
                    </button>
                </div>
            </form>
        </dialog>
        <dialog ref="importDialog" class="editor-dialog import-dialog" aria-labelledby="import-title" @cancel.prevent="clearJobs()">
            <div class="between"><div><div class="eyebrow">SCREENSHOT IMPORT</div><h2 id="import-title">{{ importing ? '正在录入成绩' : failures.length ? '部分图片识别失败' : '录入完成' }}</h2></div><button class="icon-button" aria-label="关闭识别弹窗并取消未完成任务" @click="clearJobs()"><X :size="20" /></button></div>
            <p class="muted">当前为流程演示，不执行真实 OCR，也不会写入成绩。</p>
            <div class="between import-counter" aria-live="polite"><span>{{ completed }} / {{ jobs.length }} 已处理</span><strong>识别错误数 / 总数：{{ failures.length }} / {{ jobs.length }}</strong></div>
            <AnimatedProgress :value="completed" :max="jobs.length" />
            <div class="import-results">
                <article v-for="job in jobs" :key="job.index" class="import-result" :class="job.status">
                    <div class="between"><strong>#{{ job.index }} · {{ job.name }}</strong><span class="row gap-2"><LoaderCircle v-if="job.status === 'running'" class="spin" :size="15" />{{ job.status === 'queued' ? '排队中' : job.status === 'running' ? '识别中' : job.status === 'failed' ? '识别错误' : '演示成功' }}</span></div>
                    <p v-if="job.status === 'failed'">{{ job.error }}</p>
                </article>
            </div>
            <p class="form-note">{{ importing ? '关闭弹窗将取消未完成任务。' : `成功 ${jobs.length - failures.length} 张，失败 ${failures.length} 张。失败图片不会生成成绩，可以重新选择图片或手动新增。` }}</p>
            <div class="dialog-actions"><button class="button secondary" @click="clearJobs()">{{ importing ? '取消识别' : '关闭' }}</button><button v-if="!importing && failures.length" class="button primary" @click="clearJobs(); openEditor()">手动新增</button></div>
        </dialog>
        <dialog ref="deleteDialog" class="editor-dialog">
            <h2>删除这份成绩？</h2>
            <p class="muted">
                {{ deleting?.[songLanguage] }} · {{ deleting?.difficulty }}
                {{ deleting?.level }}
            </p>
            <div class="form-note">
                正式版删除后，该谱面将从成绩库移除，B30 与总 RT
                会重新计算。当前仅预览确认流程，不会删除演示数据。
            </div>
            <div class="dialog-actions">
                <button class="button secondary" @click="deleteDialog?.close()">
                    保留成绩
                </button>
                <button
                    class="button primary"
                    @click="
                        (deleteDialog?.close(),
                        notify('删除确认流程演示完成，示例成绩保持不变。'))
                    ">
                    预览删除
                </button>
            </div>
        </dialog>
        <CardTransition variant="notice" v-slot="{ motionStyle }">
        <div v-if="toast" role="status" class="toast row gap-3" :style="motionStyle">
            <CheckCircle2 :size="19" /><div class="notification-copy"><strong>{{ toastTitle }}</strong><span>{{ toast }}</span></div>
            <button
                class="icon-button"
                aria-label="关闭提示"
                @click="toast = ''">
                <X :size="16" />
            </button>
        </div>
        </CardTransition>
    </div>
</template>
