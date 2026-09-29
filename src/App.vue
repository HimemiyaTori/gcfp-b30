<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { navigation, type Page } from './navigation'
import { useScoreList } from './composables/useScoreList'
import { getModeB30, ratingModes, type RatingMode } from './core/rating/calculator'
import { createScoreFilters } from './core/score/filter'
import AppNavigation from './components/app/AppNavigation.vue'
import AppHeader from './components/app/AppHeader.vue'
import AppNotification from './components/app/AppNotification.vue'
import HomePage from './pages/HomePage.vue'
import ScoresPage from './pages/ScoresPage.vue'
import B30Page from './pages/B30Page.vue'
import SettingsPage from './pages/SettingsPage.vue'
import ScoreEditorDialog from './components/dialogs/ScoreEditorDialog.vue'
import OcrImportDialog from './components/dialogs/OcrImportDialog.vue'
import ScoreDeleteDialog from './components/dialogs/ScoreDeleteDialog.vue'
import ClearScoresDialog from './components/dialogs/ClearScoresDialog.vue'
import ExcelTransferDialog from './components/dialogs/ExcelTransferDialog.vue'
const { t } = useI18n()
const page = ref<Page>('home')
const sidebarCollapsed = ref(false)
const {
    scores,
    error: databaseError,
    loading: databaseLoading,
    reload: reloadDatabase,
} = useScoreList()
const canWrite = computed(() => !databaseLoading.value && !databaseError.value)
const b30Mode = ref<RatingMode>('BASIC')
const modeRatings = computed(() => ratingModes.map(mode => getModeB30(scores.value, mode)))
const selectedRating = computed(
    () => modeRatings.value.find(summary => summary.mode === b30Mode.value)!,
)
const scoreFilters = ref(createScoreFilters())
const b30Filters = ref(createScoreFilters())
const editor = ref<InstanceType<typeof ScoreEditorDialog>>()
const ocr = ref<InstanceType<typeof OcrImportDialog>>()
const deletion = ref<InstanceType<typeof ScoreDeleteDialog>>()
const clearDialog = ref<InstanceType<typeof ClearScoresDialog>>()
const excel = ref<InstanceType<typeof ExcelTransferDialog>>()
const notification = ref<InstanceType<typeof AppNotification>>()
function notify(message: string, title?: string) {
    notification.value?.show(message, title)
}
function readHash() {
    const id = location.hash.slice(1)
    page.value = navigation.some(item => item.id === id) ? id as Page : 'home'
}
onMounted(() => {
    readHash()
    window.addEventListener('hashchange', readHash)
})
onUnmounted(() => window.removeEventListener('hashchange', readHash))
watch(page, () => window.scrollTo({ top: 0, behavior: 'smooth' }))
</script>

<template>
    <div :class="['app-shell', { 'sidebar-collapsed': sidebarCollapsed }]">
        <AppNavigation v-model:collapsed="sidebarCollapsed" :page="page" :count="scores.length" />
        <div class="workspace">
            <AppHeader />
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
                                      ? 'BASIC 与 ADVANCED 各自记录最好的 30 张谱面，独立计算 Groove Rating。'
                                      : page === 'scores'
                                        ? '回顾每一次发挥，整理你的个人最佳成绩。'
                                        : '调整外观与曲目信息，让这里更像你的空间。'
                            }}
                        </p>
                    </div>
                    <button
                        v-if="page === 'scores'"
                        class="button primary"
                        @click="editor?.open()"
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
                <HomePage
                    v-if="page === 'home'"
                    :scores="scores"
                    :selected-rating="selectedRating"
                    v-model:mode="b30Mode"
                    @upload="ocr?.start($event)"
                />
                <ScoresPage
                    v-if="page === 'scores'"
                    :scores="scores"
                    v-model:filters="scoreFilters"
                    @edit="editor?.open($event)"
                    @remove="deletion?.open($event)"
                />
                <B30Page
                    v-if="page === 'b30'"
                    :mode-ratings="modeRatings"
                    :selected-rating="selectedRating"
                    v-model:mode="b30Mode"
                    v-model:filters="b30Filters"
                />
                <SettingsPage
                    v-if="page === 'settings'"
                    :count="scores.length"
                    :can-write="canWrite"
                    :excel-busy="excel?.pending ?? false"
                    @clear="clearDialog?.open()"
                    @import="excel?.start()"
                    @export="excel?.download(false)"
                    @template="excel?.download(true)"
                />
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
        <ScoreEditorDialog ref="editor" :can-write="canWrite" @notify="notify" />
        <OcrImportDialog
            ref="ocr"
            :active="page === 'home'"
            :can-write="canWrite"
            @notify="notify"
            @manual-add="editor?.open()"
        />
        <ScoreDeleteDialog ref="deletion" :can-write="canWrite" @notify="notify" />
        <ClearScoresDialog ref="clearDialog" :can-write="canWrite" :count="scores.length" @notify="notify" />
        <AppNotification ref="notification" />
        <ExcelTransferDialog ref="excel" :can-write="canWrite" @notify="notify" />
    </div>
</template>
