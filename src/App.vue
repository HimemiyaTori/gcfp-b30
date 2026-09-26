<script setup lang="ts">
import {
    Activity,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronsLeft,
    ChevronDown,
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
    Settings2,
    ShieldCheck,
    Sparkles,
    Sun,
    Trophy,
    Upload,
    X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from './components/common/AnimatedProgress.vue'
import AnimatedSuccess from './components/common/AnimatedSuccess.vue'
import CardTransition from './components/common/CardTransition.vue'
import { motionTiming } from './components/common/motion'
import ScoreFilters from './components/ScoreFilters.vue'
import ScoreTable from './components/ScoreTable.vue'
import SongCover from './components/SongCover.vue'
import { isDark, songLanguage, theme } from './composables/useSettings'
import { getChartRating } from './core/rating/calculator'
import { getRankByScore } from './core/rating/rank'
import { createScoreComparator } from './core/scoreSort'
import type { SongCategory } from './data/categories'
import type { ScoreRow } from './db/models'
import { useOcrImport } from './composables/useOcrImport'
import { useScoreList } from './composables/useScoreList'
import { scoreRepository } from './db/scoreRepository'
import {
    songService,
    getSongTitle,
    getSongArtist,
    formatLevel,
} from './core/song/songService'
import { searchSongs } from './core/search/songSearch'
const { t } = useI18n()
const navigation = [
    { id: 'home', icon: LayoutGrid },
    { id: 'scores', icon: ListMusic },
    { id: 'b30', icon: Trophy },
    { id: 'settings', icon: Settings2 },
] as const
type Page = (typeof navigation)[number]['id']
const page = ref<Page>('home')
const uiLanguages = [
    { id: 'zh-CN', label: '简体中文' },
    { id: 'zh-TW', label: '繁體中文' },
    { id: 'ja', label: '日本語' },
    { id: 'en', label: 'English' },
] as const
const uiLanguage = ref<(typeof uiLanguages)[number]['id']>('zh-CN')
const narrowSidebar = window.matchMedia('(max-width: 960px)')
const sidebarCollapsed = ref(narrowSidebar.matches)
function setSidebarCollapsed(collapsed: boolean) {
    // CSS 过渡会从当前位置折返，快速反复切换时也能接上
    sidebarCollapsed.value = collapsed
}
function syncSidebarToViewport(event: MediaQueryListEvent) {
    setSidebarCollapsed(event.matches)
}
function toggleSongLanguage() {
    songLanguage.value = songLanguage.value === 'ja' ? 'en' : 'ja'
}
function readHash() {
    const id = location.hash.slice(1)
    page.value = navigation.some((n) => n.id === id) ? (id as Page) : 'home'
}
onMounted(() => {
    readHash()
    window.addEventListener('hashchange', readHash)
    narrowSidebar.addEventListener('change', syncSidebarToViewport)
})
onUnmounted(() => {
    window.removeEventListener('hashchange', readHash)
    narrowSidebar.removeEventListener('change', syncSidebarToViewport)
    clearTimeout(timer)
})
const category = ref<SongCategory | 'ALL'>('ALL')
const query = ref(''),
    difficulty = ref('ALL'),
    mode = ref('ALL')
const b30Query = ref(''),
    b30Difficulty = ref('ALL'),
    b30Mode = ref('ALL'),
    b30Category = ref<SongCategory | 'ALL'>('ALL')
const {
    scores,
    error: databaseError,
    loading: databaseLoading,
    reload: reloadDatabase,
} = useScoreList()
const b30 = computed(() => {
    const compare = createScoreComparator('rating', 'ja')
    return [...scores.value].sort((a, b) => compare(b, a)).slice(0, 30)
})
const totalRating = computed(() =>
    (
        Math.floor(
            b30.value.reduce((sum, s) => sum + Math.round(s.rating * 100), 0) /
                30,
        ) / 100
    ).toFixed(2),
)
function filterScores(
    items: ScoreRow[],
    search: string,
    selectedCategory: SongCategory | 'ALL',
    selectedMode: string,
    selectedDifficulty: string,
) {
    const matches = new Set(searchSongs(search).map((song) => song.id))
    return items.filter(
        (s) =>
            matches.has(s.songId) &&
            (selectedDifficulty === 'ALL' ||
                s.difficulty === selectedDifficulty) &&
            (selectedMode === 'ALL' || s.mode === selectedMode) &&
            (selectedCategory === 'ALL' || s.category === selectedCategory),
    )
}
const filtered = computed(() =>
    filterScores(
        scores.value,
        query.value,
        category.value,
        mode.value,
        difficulty.value,
    ),
)
const filteredB30 = computed(() =>
    filterScores(
        b30.value,
        b30Query.value,
        b30Category.value,
        b30Mode.value,
        b30Difficulty.value,
    ),
)
const fileInput = ref<HTMLInputElement>(),
    dragging = ref(false)
const importDialog = ref<HTMLDialogElement>()
const importPhase = ref<'processing' | 'success' | 'leaving'>('processing')
const {
    jobs,
    completed,
    failures,
    skipped,
    importing,
    edgeSecurityHint,
    dismissEdgeSecurityHint,
    start: runImport,
    cancel: cancelOcr,
} = useOcrImport()
const importHasErrors = computed(
    () => !importing.value && failures.value.length > 0,
)
let timer: ReturnType<typeof setTimeout>
let importGeneration = 0
function clearJobs() {
    importGeneration++
    clearTimeout(timer)
    cancelOcr()
    importDialog.value?.close()
    importPhase.value = 'processing'
}
function cancelImport() {
    clearJobs()
}
async function selectFiles(files: FileList | null) {
    if (!files?.length) return
    if (databaseLoading.value || databaseError.value) {
        notify('本地数据库尚未就绪，请先重试。')
        return
    }
    const selected = Array.from(files)
    files = null
    if (fileInput.value) fileInput.value.value = ''
    if (selected.length > 30) {
        notify('每批最多选择 30 张截图。')
        return
    }
    clearJobs()
    const generation = importGeneration
    importDialog.value?.showModal()
    await runImport(selected)
    if (generation !== importGeneration || !jobs.value.length) return
    if (
        !failures.value.length &&
        !skipped.value.length &&
        !edgeSecurityHint.value
    ) {
        timer = setTimeout(
            () => {
                importPhase.value = 'success'
                timer = setTimeout(
                    () => {
                        const count = jobs.value.length
                        clearJobs()
                        notify(
                            `已处理 ${count} 张截图，同一谱面仅保留最高分。`,
                            '录入完成',
                        )
                    },
                    motionTiming.successHold +
                        motionTiming.successCircle +
                        motionTiming.successCheck,
                )
            },
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 0
                : motionTiming.progress,
        )
    }
}
function drop(e: DragEvent) {
    dragging.value = false
    selectFiles(e.dataTransfer?.files ?? null)
}
watch(page, () => {
    clearJobs()
    dragging.value = false
    window.scrollTo({ top: 0, behavior: 'smooth' })
})
const deleteDialog = ref<HTMLDialogElement>(),
    deleting = ref<ScoreRow | null>(null)
function openDelete(s: ScoreRow) {
    deleting.value = s
    deleteDialog.value?.showModal()
}
const toast = ref(''),
    toastTitle = ref('')
let toastTimer: ReturnType<typeof setTimeout>
function notify(message: string, title = '提示') {
    clearTimeout(toastTimer)
    toast.value = message
    toastTitle.value = title
    toastTimer = setTimeout(() => (toast.value = ''), 5000)
}
const dialog = ref<HTMLDialogElement>(),
    editing = ref<ScoreRow | null>(null)
const inputScore = ref<number | string>(1040000)
const inputAchievement = ref('unknown')
const inputMaxChain = ref<number | string>('')
const songPickerExpanded = ref(false)
const songSearchInput = ref<HTMLInputElement>(),
    songPickerButton = ref<HTMLButtonElement>()
async function toggleSongPicker() {
    songPickerExpanded.value = !songPickerExpanded.value
    if (songPickerExpanded.value) {
        await nextTick()
        songSearchInput.value?.focus()
    }
}
function selectSong(id: string) {
    selectedSong.value = id
    songPickerExpanded.value = false
    songPickerButton.value?.focus()
}
const songQuery = ref(''),
    selectedSong = ref(songService.songs[0]!.id)
const editorMode = ref('ADVANCED'),
    editorDifficulty = ref('MASTER')
const filteredSongs = computed(() =>
    searchSongs(songQuery.value).map((song) => ({
        id: song.id,
        coverSourceUrl: song.coverSourceUrl,
        ja: getSongTitle(song, 'ja'),
        en: getSongTitle(song, 'en'),
        artist: getSongArtist(song, songLanguage.value),
    })),
)
const currentSong = computed(() => {
    const song = songService.getSong(selectedSong.value)!
    return {
        ja: getSongTitle(song, 'ja'),
        en: getSongTitle(song, 'en'),
        coverSourceUrl: song.coverSourceUrl,
        artist: getSongArtist(song, songLanguage.value),
    }
})
const chartOptions = computed(() =>
    songService
        .getSong(selectedSong.value)!
        .charts.filter((chart) => chart.mode.toUpperCase() === editorMode.value)
        .map((chart) => ({
            ...chart,
            difficulty: chart.difficulty.toUpperCase(),
            levelLabel: formatLevel(chart.level),
        })),
)
const currentChart = computed(() =>
    chartOptions.value.find(
        (chart) => chart.difficulty === editorDifficulty.value,
    ),
)
watch(chartOptions, (options) => {
    if (!options.some((chart) => chart.difficulty === editorDifficulty.value))
        editorDifficulty.value = options[options.length - 1]?.difficulty ?? ''
})
const chartBase = computed(() => currentChart.value?.level ?? 0)
const saving = ref(false),
    saveError = ref(''),
    lowerConfirmed = ref(false)
watch([inputScore, selectedSong, editorMode, editorDifficulty], () => {
    lowerConfirmed.value = false
    saveError.value = ''
})
const validScore = computed(
    () =>
        inputScore.value !== '' &&
        Number.isInteger(Number(inputScore.value)) &&
        Number(inputScore.value) >= 0 &&
        Number(inputScore.value) <= 1050000,
)
const liveRank = computed(() =>
    validScore.value ? getRankByScore(Number(inputScore.value)) : '—',
)
const liveRating = computed(() =>
    validScore.value && currentChart.value
        ? getChartRating(Number(inputScore.value), chartBase.value).toFixed(2)
        : '—',
)
const lowered = computed(
    () => editing.value && Number(inputScore.value) < editing.value.score,
)
function openEditor(s?: ScoreRow) {
    songPickerExpanded.value = false
    editing.value = s ?? null
    selectedSong.value = s?.songId ?? songService.songs[0]!.id
    saveError.value = ''
    lowerConfirmed.value = false
    songQuery.value = ''
    editorMode.value = s?.mode ?? 'ADVANCED'
    editorDifficulty.value = s?.difficulty ?? 'MASTER'
    inputScore.value = s?.score ?? 1040000
    inputAchievement.value = s?.ap
        ? 'ap'
        : s?.fc
          ? 'fc'
          : s?.fc === false
            ? 'clear'
            : 'unknown'
    inputMaxChain.value = s?.maxChain ?? ''
    dialog.value?.showModal()
}
async function saveScore() {
    if (
        !validScore.value ||
        !currentChart.value ||
        saving.value ||
        databaseLoading.value ||
        databaseError.value
    )
        return
    if (lowered.value && !lowerConfirmed.value) {
        saveError.value = '请勾选确认调低该曲目的成绩。'
        return
    }
    saving.value = true
    saveError.value = ''
    try {
        const achievements = {
            fc:
                inputAchievement.value === 'unknown'
                    ? undefined
                    : inputAchievement.value !== 'clear',
            ap:
                inputAchievement.value === 'unknown'
                    ? undefined
                    : inputAchievement.value === 'ap',
            maxChain:
                inputMaxChain.value === ''
                    ? undefined
                    : Number(inputMaxChain.value),
        }
        if (editing.value)
            await scoreRepository.edit(
                editing.value.id,
                Number(inputScore.value),
                lowerConfirmed.value,
                achievements,
            )
        else
            await scoreRepository.add(
                selectedSong.value,
                currentChart.value.id,
                Number(inputScore.value),
                'manual',
                achievements,
            )
        dialog.value?.close()
        notify('成绩已保存到本机。')
    } catch (error) {
        saveError.value =
            error instanceof Error ? error.message : '保存失败，请重试。'
    } finally {
        saving.value = false
    }
}
async function deleteScore() {
    if (
        !deleting.value ||
        saving.value ||
        databaseError.value ||
        databaseLoading.value
    )
        return
    saving.value = true
    try {
        await scoreRepository.remove(deleting.value.id)
        deleteDialog.value?.close()
        notify('成绩已删除。')
    } catch {
        notify('删除失败，请检查浏览器存储权限后重试。', '删除失败')
    } finally {
        saving.value = false
    }
}
const clearDialog = ref<HTMLDialogElement>(),
    clearError = ref('')
function openClearDialog() {
    clearError.value = ''
    clearDialog.value?.showModal()
}
async function clearScores() {
    if (saving.value || databaseLoading.value || databaseError.value) return
    saving.value = true
    clearError.value = ''
    try {
        await scoreRepository.clear()
        clearDialog.value?.close()
        notify('本地成绩已全部清空。')
    } catch {
        clearError.value = '清空失败，请检查浏览器存储权限后重试。'
    } finally {
        saving.value = false
    }
}
onUnmounted(() => clearTimeout(toastTimer))
</script>

<template>
    <div :class="['app-shell', { 'sidebar-collapsed': sidebarCollapsed }]">
        <aside class="sidebar stack">
            <a
                href="#home"
                class="brand row gap-3"
                aria-label="Groove Archive 首页"
                ><span class="brand-mark"><Activity :size="24" /></span>
                <div class="sidebar-copy">
                    <strong>GROOVE<span>ARCHIVE</span></strong
                    ><small>FUTURE PERFORMERS</small>
                </div></a
            >
            <div class="sidebar-caption sidebar-copy">我的音乐旅程</div>
            <nav class="stack gap-2">
                <a
                    v-for="n in navigation"
                    :key="n.id"
                    :href="`#${n.id}`"
                    :class="['nav-item row gap-3', { active: page === n.id }]"
                    :aria-label="t(`nav.${n.id}`)"
                    :title="sidebarCollapsed ? t(`nav.${n.id}`) : undefined"
                    :aria-current="page === n.id ? 'page' : undefined"
                    ><component :is="n.icon" :size="19" /><span
                        class="sidebar-copy"
                        >{{ t(`nav.${n.id}`) }}</span
                    ><span
                        v-if="n.id === 'scores' && scores.length > 0"
                        class="nav-badge"
                        >{{ scores.length }}</span
                    ><span v-if="page === n.id" class="active-dot"></span
                ></a>
            </nav>
            <div class="sidebar-controls stack gap-2">
                <div class="ui-language-control sidebar-copy">
                    <span class="ui-language-icon" aria-hidden="true"></span>
                    <div
                        class="ui-language-options"
                        role="group"
                        aria-label="界面语言（预览选择）"
                    >
                        <button
                            v-for="option in uiLanguages"
                            :key="option.id"
                            type="button"
                            :class="{ selected: uiLanguage === option.id }"
                            :aria-pressed="uiLanguage === option.id"
                            @click="uiLanguage = option.id"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
                <div class="sidebar-control-row">
                    <button
                        class="song-language-compact"
                        type="button"
                        :aria-label="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}。点击切换为${songLanguage === 'ja' ? 'English' : '日本語'}`"
                        :title="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}`"
                        @click="toggleSongLanguage"
                    >
                        {{ songLanguage === 'ja' ? '日' : 'EN' }}
                    </button>
                    <button
                        class="sidebar-theme-control"
                        type="button"
                        :aria-label="
                            isDark ? '切换到浅色主题' : '切换到深色主题'
                        "
                        :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
                        @click="theme = isDark ? 'light' : 'dark'"
                    >
                        <Sun v-if="isDark" :size="19" />
                        <Moon v-else :size="19" />
                    </button>
                    <button
                        class="sidebar-collapse-control"
                        type="button"
                        :aria-label="
                            sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'
                        "
                        :aria-expanded="!sidebarCollapsed"
                        :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
                        @click="setSidebarCollapsed(!sidebarCollapsed)"
                    >
                        <ChevronsLeft :size="23" />
                    </button>
                </div>
            </div>
        </aside>
        <div class="workspace">
            <header class="topbar between">
                <a
                    href="#home"
                    class="game-identity"
                    aria-label="Groove Coaster Future Performers B30 首页"
                >
                    <img
                        class="game-logo"
                        src="/images/gcfp-logo.png"
                        alt="Groove Coaster Future Performers"
                        width="700"
                        height="296"
                    />
                    <span class="game-edition">B30</span>
                </a>
                <div class="row gap-4">
                    <span class="preview-pill"
                        ><span class="tiny-dot"></span> 界面预览</span
                    >
                    <div class="topbar-mobile-controls">
                        <button
                            class="song-language-compact"
                            type="button"
                            :aria-label="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}。点击切换为${songLanguage === 'ja' ? 'English' : '日本語'}`"
                            :title="`曲目信息语言：${songLanguage === 'ja' ? '日本語' : 'English'}`"
                            @click="toggleSongLanguage"
                        >
                            {{ songLanguage === 'ja' ? '日' : 'EN' }}
                        </button>
                        <button
                            class="sidebar-theme-control"
                            type="button"
                            :aria-label="
                                isDark ? '切换到浅色主题' : '切换到深色主题'
                            "
                            :title="
                                isDark ? '切换到浅色主题' : '切换到深色主题'
                            "
                            @click="theme = isDark ? 'light' : 'dark'"
                        >
                            <Sun v-if="isDark" :size="19" />
                            <Moon v-else :size="19" />
                        </button>
                    </div>
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
                        @click="openEditor()"
                    >
                        <Plus :size="17" /> 手动新增
                    </button>
                    <div
                        v-if="page === 'home' || page === 'b30'"
                        class="demo-label"
                    >
                        LOCAL DATA <span>本机成绩</span>
                    </div>
                </div>

                <template v-if="page === 'home' || page === 'b30'">
                    <section v-if="scores.length" class="stats-grid">
                        <article class="rating-card">
                            <div class="row gap-2">
                                <Activity :size="16" /><span>Groove Rating</span
                                ><span class="metric-tag"
                                    >B{{ Math.min(scores.length, 30) }}</span
                                >
                            </div>
                            <div class="rating-values">
                                <div class="big-rating">
                                    {{ totalRating }}<span>RT</span>
                                </div>
                                <div class="rating-floor">
                                    <span>Floor</span>
                                    <strong>{{
                                        b30.at(-1)?.rating.toFixed(2) ?? '—'
                                    }}</strong>
                                    <span>RT</span>
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
                                <h3>拖入或选择成绩截图</h3>
                                <input
                                    ref="fileInput"
                                    class="drop-zone-input"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    aria-label="选择成绩截图"
                                    @change="
                                        selectFiles(
                                            ($event.target as HTMLInputElement)
                                                .files,
                                        )
                                    "
                                /><small>PNG / JPG / WebP · 支持多张选择</small>
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

                <template v-if="page === 'scores'">
                    <section class="panel">
                        <div class="section-title between">
                            <div class="row gap-2">
                                <ListMusic :size="18" />
                                <h2>成绩一览</h2>
                            </div>
                            <span class="count-badge"
                                >共 {{ scores.length }} 张谱面</span
                            >
                        </div>
                        <ScoreFilters
                            v-model:query="query"
                            v-model:category="category"
                            v-model:mode="mode"
                            v-model:difficulty="difficulty"
                        />
                        <ScoreTable
                            :items="filtered"
                            editable
                            @edit="openEditor"
                            @remove="openDelete"
                        />
                    </section>
                </template>

                <template v-if="page === 'b30'">
                    <section class="panel">
                        <div class="section-title between">
                            <div class="row gap-2">
                                <Trophy :size="18" />
                                <h2>Best 30</h2>
                            </div>
                            <span class="count-badge"
                                >共 {{ b30.length }} 张谱面</span
                            >
                        </div>
                        <ScoreFilters
                            v-model:query="b30Query"
                            v-model:category="b30Category"
                            v-model:mode="b30Mode"
                            v-model:difficulty="b30Difficulty"
                        />
                        <ScoreTable
                            :items="filteredB30"
                            :position-items="b30"
                            ranked
                        />
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
                                            label: '浅色',
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
                                    @click="theme = option.id"
                                >
                                    <component :is="option.icon" :size="21" />
                                    <span>{{ option.label }} </span>
                                    <Check
                                        v-if="theme === option.id"
                                        :size="13"
                                    />
                                </button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div>
                                <h3>界面语言</h3>
                                <p>当前仅预览选择状态，界面仍为简体中文。</p>
                            </div>
                            <div
                                class="segmented ui-settings-options"
                                role="group"
                                aria-label="界面语言（预览选择）"
                            >
                                <button
                                    v-for="option in uiLanguages"
                                    :key="option.id"
                                    type="button"
                                    :class="{
                                        selected: uiLanguage === option.id,
                                    }"
                                    :aria-pressed="uiLanguage === option.id"
                                    @click="uiLanguage = option.id"
                                >
                                    {{ option.label }}
                                </button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div>
                                <h3>曲目信息语言</h3>
                                <p>切换曲名显示语言，不影响搜索与成绩关联。</p>
                            </div>
                            <div class="segmented">
                                <button
                                    :class="{ selected: songLanguage === 'ja' }"
                                    @click="songLanguage = 'ja'"
                                >
                                    日本語
                                </button>
                                <button
                                    :class="{ selected: songLanguage === 'en' }"
                                    @click="songLanguage = 'en'"
                                >
                                    English
                                </button>
                            </div>
                        </div>
                    </section>
                    <section class="panel settings-panel">
                        <div class="section-title"><h2>本地数据</h2></div>
                        <div class="setting-row">
                            <div>
                                <h3>清空成绩数据</h3>
                                <p>删除本机存储的全部成绩。</p>
                            </div>
                            <button
                                class="button secondary danger-button"
                                :disabled="
                                    !scores.length ||
                                    saving ||
                                    databaseLoading ||
                                    !!databaseError
                                "
                                @click="openClearDialog"
                            >
                                清空数据
                            </button>
                        </div>
                    </section>
                </template>
                <p v-if="databaseLoading" role="status">正在加载本地成绩…</p>
                <div v-if="databaseError" class="panel error" role="alert">
                    {{ databaseError }}
                    <button class="button secondary" @click="reloadDatabase">
                        重试
                    </button>
                </div>
                <footer class="page-footer between">
                    <span>
                        GROOVE ARCHIVE
                        <span class="footer-dot">·</span>
                        为每一次热爱留个记录
                    </span>
                    <span>
                        本地成绩管理
                        <span class="footer-dot">/</span>
                        截图 OCR 本地识别
                    </span>
                </footer>
            </main>
        </div>
        <dialog
            ref="dialog"
            class="editor-dialog"
            @click="$event.target === dialog && dialog?.close()"
        >
            <form @submit.prevent="saveScore">
                <div class="between">
                    <div>
                        <div class="eyebrow">SCORE PREVIEW</div>
                        <h2>{{ editing ? '编辑成绩' : '手动新增成绩' }}</h2>
                    </div>
                    <button
                        type="button"
                        class="icon-button"
                        aria-label="关闭弹窗"
                        @click="dialog?.close()"
                    >
                        <X :size="20" />
                    </button>
                </div>
                <p class="muted">
                    {{
                        editing
                            ? '可修改 Score、完成状态与 Max Chain，曲目与谱面保持不变。'
                            : '选择曲目与谱面，记录你的精彩发挥。'
                    }}
                </p>
                <div class="song-picker">
                    <button
                        v-if="!editing"
                        ref="songPickerButton"
                        type="button"
                        class="selected-song song-picker-toggle"
                        :aria-expanded="songPickerExpanded"
                        aria-controls="song-search-panel"
                        @click="toggleSongPicker"
                    >
                        <SongCover :src="currentSong.coverSourceUrl" />
                        <span class="song-picker-copy"
                            ><small>已选曲目</small
                            ><strong>{{ currentSong[songLanguage] }}</strong
                            ><small>{{ currentSong.artist }}</small></span
                        >
                        <ChevronDown
                            :size="18"
                            :class="{
                                'picker-chevron-open': songPickerExpanded,
                            }"
                        />
                    </button>
                    <div v-else class="selected-song song-picker-toggle">
                        <SongCover :src="currentSong.coverSourceUrl" />
                        <span class="song-picker-copy"
                            ><small>当前曲目</small
                            ><strong>{{ currentSong[songLanguage] }}</strong
                            ><small>{{ currentSong.artist }}</small></span
                        >
                    </div>
                    <div
                        v-if="!editing && songPickerExpanded"
                        id="song-search-panel"
                        class="song-search-panel"
                    >
                        <label
                            >搜索曲目<input
                                ref="songSearchInput"
                                v-model="songQuery"
                                type="search"
                                placeholder="输入日文 / 英文曲名或艺术家"
                        /></label>
                        <div class="song-options" aria-label="曲目搜索结果">
                            <button
                                v-for="song in filteredSongs"
                                :key="song.id"
                                type="button"
                                :class="{ selected: selectedSong === song.id }"
                                :aria-pressed="selectedSong === song.id"
                                @click="selectSong(song.id)"
                            >
                                <SongCover :src="song.coverSourceUrl" />
                                <span class="song-picker-copy"
                                    >{{ song[songLanguage]
                                    }}<small>{{ song.artist }}</small></span
                                >
                                <Check
                                    v-if="selectedSong === song.id"
                                    :size="16"
                                />
                            </button>
                            <p v-if="!filteredSongs.length" class="form-note">
                                未找到匹配曲目，试试其他关键词。已选曲目保持不变。
                            </p>
                        </div>
                    </div>
                </div>
                <div class="editor-control-row">
                    <fieldset class="chart-picker" :disabled="!!editing">
                        <legend>模式</legend>
                        <div class="chart-buttons">
                            <button
                                v-for="item in [
                                    { id: 'BASIC', label: 'BASIC' },
                                    { id: 'ADVANCED', label: 'ADV' },
                                ]"
                                :key="item.id"
                                type="button"
                                :aria-pressed="editorMode === item.id"
                                :class="{ selected: editorMode === item.id }"
                                @click="editorMode = item.id"
                            >
                                {{ item.label }}
                            </button>
                        </div>
                    </fieldset>
                    <fieldset class="chart-picker">
                        <legend>完成状态</legend>
                        <div class="chart-buttons">
                            <button
                                v-for="item in [
                                    { id: 'fc', label: 'FC' },
                                    { id: 'ap', label: 'AP' },
                                ]"
                                :key="item.id"
                                type="button"
                                :aria-pressed="inputAchievement === item.id"
                                :class="{
                                    selected: inputAchievement === item.id,
                                }"
                                @click="
                                    inputAchievement =
                                        inputAchievement === item.id
                                            ? 'unknown'
                                            : item.id
                                "
                            >
                                {{ item.label }}
                            </button>
                        </div>
                    </fieldset>
                </div>
                <fieldset class="chart-picker" :disabled="!!editing">
                    <legend>难度</legend>
                    <div class="chart-buttons">
                        <button
                            v-for="chart in chartOptions"
                            :key="chart.id"
                            type="button"
                            :aria-pressed="
                                editorDifficulty === chart.difficulty
                            "
                            :class="{
                                selected: editorDifficulty === chart.difficulty,
                            }"
                            @click="editorDifficulty = chart.difficulty"
                        >
                            {{ chart.difficulty }} {{ chart.levelLabel }}
                        </button>
                    </div>
                </fieldset>
                <div class="editor-control-row">
                    <label
                        >Score<input
                            v-model="inputScore"
                            type="number"
                            min="0"
                            max="1050000"
                            step="1"
                            required
                    /></label>
                    <label
                        >Max Chain（可选）<input
                            v-model="inputMaxChain"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="未记录"
                    /></label>
                </div>
                <div class="live-metrics" aria-live="polite">
                    <div>
                        <small>Rank</small><strong>{{ liveRank }}</strong>
                    </div>
                    <div>
                        <small>歌曲定数 → 单曲 Rating</small
                        ><strong
                            >{{ chartBase.toFixed(1) }} <span>→</span>
                            {{ liveRating }}</strong
                        >
                    </div>
                </div>
                <p v-if="!validScore" class="error">
                    请输入 0～1,050,000 范围内的整数。
                </p>
                <p v-if="lowered" class="warning">
                    将调低「{{ editing?.[songLanguage] }}」的成绩，保存后 Rank
                    与 Rating 会重新计算。
                </p>
                <div class="form-note">
                    Rank 与 Rating 随 Score
                    实时计算，保存后刷新页面仍可查看成绩。
                </div>
                <label v-if="lowered"
                    ><input
                        v-model="lowerConfirmed"
                        type="checkbox"
                    />确认调低「{{ editing?.[songLanguage] }}」的成绩</label
                >
                <p v-if="saveError" class="error" role="alert">
                    {{ saveError }}
                </p>
                <p v-if="!currentChart" class="error">该模式没有可选谱面。</p>
                <div class="dialog-actions">
                    <button
                        type="button"
                        class="button secondary"
                        @click="dialog?.close()"
                    >
                        取消</button
                    ><button
                        class="button primary"
                        :disabled="
                            !validScore ||
                            !currentChart ||
                            saving ||
                            databaseLoading ||
                            !!databaseError ||
                            (!!lowered && !lowerConfirmed)
                        "
                    >
                        {{ saving ? '保存中…' : '保存成绩' }}
                    </button>
                </div>
            </form>
        </dialog>
        <dialog
            ref="importDialog"
            class="editor-dialog import-dialog"
            :class="{ 'import-dialog-leaving': importPhase === 'leaving' }"
            :style="{ '--success-fade': `${motionTiming.successFade}ms` }"
            aria-labelledby="import-title"
            @cancel.prevent="cancelImport()"
        >
            <div
                v-if="importPhase !== 'processing'"
                class="import-success"
                role="status"
            >
                <AnimatedSuccess />
                <h2 id="import-title">录入完成</h2>
                <p>已处理全部 {{ jobs.length }} 张截图</p>
                <small>同一谱面仅保留最高分</small>
            </div>
            <template v-else>
                <div class="between">
                    <div>
                        <div class="eyebrow">SCREENSHOT IMPORT</div>
                        <h2 id="import-title">
                            {{
                                importHasErrors
                                    ? '部分图片识别失败'
                                    : importing
                                      ? '正在录入成绩'
                                      : '处理完成'
                            }}
                        </h2>
                    </div>
                </div>
                <p class="muted">
                    截图仅在本机处理；首次识别需要下载模型，关闭弹窗或切页可取消。
                </p>
                <div class="between import-counter" aria-live="polite">
                    <strong v-if="importHasErrors" class="error">
                        识别错误：{{ failures.length }} / {{ jobs.length }}
                    </strong>
                    <span v-else
                        >{{ completed }} / {{ jobs.length }} 已处理</span
                    >
                </div>
                <AnimatedProgress :value="completed" :max="jobs.length" />
                <aside
                    v-if="edgeSecurityHint"
                    class="ocr-performance-hint"
                    role="status"
                >
                    <div class="between">
                        <strong class="row gap-2"
                            ><CircleHelp :size="16" />Edge 识别速度提示</strong
                        >
                        <button
                            class="icon-button"
                            aria-label="关闭识别速度提示"
                            @click="dismissEdgeSecurityHint"
                        >
                            <X :size="16" />
                        </button>
                    </div>
                    <p>
                        当前图片识别耗时较长，可能与 Edge 的“增强安全”设置有关。
                    </p>
                    <details>
                        <summary>查看处理方法</summary>
                        <p>
                            点击地址栏左侧的站点信息图标，检查当前站点是否启用了增强安全。
                            对于你信任的站点，可以将当前站点设为例外，刷新页面后重新选择图片；也可以换用其他浏览器。
                        </p>
                        <a
                            href="https://learn.microsoft.com/zh-cn/deployedge/microsoft-edge-security-browse-safer"
                            target="_blank"
                            rel="noopener noreferrer"
                            >查看 Microsoft 设置说明</a
                        >
                    </details>
                </aside>
                <div class="import-results">
                    <article
                        v-for="job in jobs"
                        :key="job.index"
                        class="import-result"
                        :class="job.status"
                    >
                        <div class="between">
                            <strong>#{{ job.index }} · {{ job.name }}</strong
                            ><span class="row gap-2"
                                ><LoaderCircle
                                    v-if="job.status === 'running'"
                                    class="spin"
                                    :size="15"
                                />{{
                                    job.status === 'queued'
                                        ? '排队中'
                                        : job.status === 'running'
                                          ? '识别中'
                                          : job.status === 'failed'
                                            ? '识别错误'
                                            : job.status === 'skipped'
                                              ? '已跳过'
                                              : '已处理'
                                }}</span
                            >
                        </div>
                        <p v-if="job.error">{{ job.error }}</p>
                    </article>
                </div>
                <p class="form-note">
                    {{
                        !importing
                            ? `跳过 ${skipped.length} 张，失败 ${failures.length} 张。失败图片不会生成成绩，可以重新选择图片或手动新增。`
                            : '关闭弹窗将取消未完成任务。'
                    }}
                </p>
                <div class="dialog-actions">
                    <button class="button secondary" @click="cancelImport()">
                        {{ importing ? '取消识别' : '关闭' }}</button
                    ><button
                        v-if="importHasErrors"
                        class="button primary"
                        @click="(clearJobs(), openEditor())"
                    >
                        手动新增
                    </button>
                </div>
            </template>
        </dialog>
        <dialog ref="deleteDialog" class="editor-dialog">
            <h2>删除这份成绩？</h2>
            <p class="muted">
                {{ deleting?.[songLanguage] }} · {{ deleting?.difficulty }}
                {{ deleting?.level }}
            </p>
            <div class="form-note">
                删除后，该谱面将从成绩库移除，B30 与总 RT 会重新计算。
            </div>
            <div class="dialog-actions">
                <button class="button secondary" @click="deleteDialog?.close()">
                    保留成绩
                </button>
                <button
                    class="button primary"
                    @click="deleteScore"
                    :disabled="saving || databaseLoading || !!databaseError"
                >
                    确认删除
                </button>
            </div>
        </dialog>
        <dialog
            ref="clearDialog"
            class="editor-dialog"
            aria-labelledby="clear-data-title"
            @cancel="saving && $event.preventDefault()"
        >
            <h2 id="clear-data-title">清空全部成绩？</h2>
            <p class="muted">
                将永久删除此浏览器中的
                {{ scores.length }} 条成绩，无法撤销。B30 和总 RT
                会随之清空，曲库与外观偏好将保留。
            </p>
            <p v-if="clearError" class="error" role="alert">{{ clearError }}</p>
            <div class="dialog-actions">
                <button
                    class="button secondary"
                    :disabled="saving"
                    @click="clearDialog?.close()"
                >
                    取消
                </button>
                <button
                    class="button primary danger-button"
                    :disabled="saving || databaseLoading || !!databaseError"
                    @click="clearScores"
                >
                    {{ saving ? '清空中…' : '确认清空全部成绩' }}
                </button>
            </div>
        </dialog>
        <CardTransition variant="notice" v-slot="{ motionStyle }">
            <div
                v-if="toast"
                role="status"
                class="toast row gap-3"
                :style="motionStyle"
            >
                <CheckCircle2 :size="19" />
                <div class="notification-copy">
                    <strong>{{ toastTitle }}</strong
                    ><span>{{ toast }}</span>
                </div>
                <button
                    class="icon-button"
                    aria-label="关闭提示"
                    @click="toast = ''"
                >
                    <X :size="16" />
                </button>
            </div>
        </CardTransition>
    </div>
</template>
