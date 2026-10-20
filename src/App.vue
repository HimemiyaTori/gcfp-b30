<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from './components/app/AppHeader.vue'
import AppNavigation from './components/app/AppNavigation.vue'
import AppNotification from './components/app/AppNotification.vue'
import B30ExportButton from './components/B30ExportButton.vue'
import ClearScoresDialog from './components/dialogs/ClearScoresDialog.vue'
import ExcelTransferDialog from './components/dialogs/ExcelTransferDialog.vue'
import OcrImportDialog from './components/dialogs/OcrImportDialog.vue'
import ScoreEditorDialog from './components/dialogs/ScoreEditorDialog.vue'
import SongDetailsDialog from './components/dialogs/SongDetailsDialog.vue'
import type { RatingGrain } from './components/RatingTrend.vue'
import { useScoreList } from './composables/useScoreList'
import {
    getModeB30,
    ratingModes,
    type RatingMode,
} from './core/rating/calculator'
import { createScoreFilters } from './core/score/filter'
import { navigation, type Page } from './navigation'
import B30Page from './pages/B30Page.vue'
import HomePage from './pages/HomePage.vue'
import ScoresPage from './pages/ScoresPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import type { AccountProfile } from './db/accountContext'
import type { RecognitionSource } from './db/models'
import { useRecognitionStore } from './stores/recognition'
const recognition = useRecognitionStore()
const account = shallowRef<{ user?: AccountProfile }>()
const SiteAccount = import.meta.env.VITE_SERVER === '1' ? defineAsyncComponent(() => import('./components/account/SiteAccount.vue')) : undefined
const AlbumSync = import.meta.env.VITE_SERVER === '1' ? defineAsyncComponent(() => import('./components/album/AlbumSync.vue')) : undefined
if (import.meta.env.VITE_SERVER === '1') void import('./core/account/controller').then(async module => {
    account.value = module.siteAccount
    await module.initializeAccount()
    const album = await import('./core/album/controller')
    album.initializeAlbum()
})
const { t } = useI18n()
const page = ref<Page>('home')
const pageInfo = computed(() => navigation.find((item) => item.id === page.value)!)
const sidebarCollapsed = ref(false)
const {
    scores,
    historyCount,
    error: databaseError,
    loading: databaseLoading,
    reload: reloadDatabase,
} = useScoreList()
const canWrite = computed(() => !databaseLoading.value && !databaseError.value)
const b30Mode = ref<RatingMode>('BASIC')
const ratingGrain = ref<RatingGrain>('day')
const modeRatings = computed(() =>
    ratingModes.map((mode) => getModeB30(scores.value, mode)),
)
const selectedRating = computed(
    () => modeRatings.value.find((summary) => summary.mode === b30Mode.value)!,
)
const scoreFilters = ref(createScoreFilters())
const b30Filters = ref(createScoreFilters())
const editor = ref<InstanceType<typeof ScoreEditorDialog>>()
const ocr = ref<InstanceType<typeof OcrImportDialog>>()
const songDetails = ref<InstanceType<typeof SongDetailsDialog>>()
const clearDialog = ref<InstanceType<typeof ClearScoresDialog>>()
const excel = ref<InstanceType<typeof ExcelTransferDialog>>()
const notification = ref<InstanceType<typeof AppNotification>>()
const albumSync = ref<{ open(): Promise<void> }>()
function notify(message: string, title?: string) {
    notification.value?.show(message, title)
}
function viewRecognition(source: RecognitionSource) {
    if (source === 'album') void albumSync.value?.open()
    else void ocr.value?.view()
}
function uploadFiles(files: File[]) {
    if (recognition.activeSource) {
        viewRecognition(recognition.activeSource)
        return
    }
    if (!canWrite.value) {
        notify(t('common.databaseNotReady'))
        return
    }
    const workbooks = files.filter((file) => /\.xlsx$/i.test(file.name))
    if (workbooks.length) {
        if (files.length !== 1) {
            notify(t('app.excelOneFile'), t('app.chooseFileTitle'))
            return
        }
        if (excel.value?.pending) {
            notify(t('app.excelBusy'), t('app.waitTitle'))
            return
        }
        void excel.value?.importFile(workbooks[0]!)
    } else ocr.value?.start(files)
}
function readHash() {
    const id = location.hash.slice(1)
    page.value = navigation.some((item) => item.id === id)
        ? (id as Page)
        : 'home'
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
        <AppNavigation
            v-model:collapsed="sidebarCollapsed"
            :page="page"
            :count="scores.length"
        />
        <div class="workspace">
            <AppHeader :account="account?.user" />
            <main>
                <div class="page-heading between">
                    <div>
                        <div class="eyebrow">
                            {{
                                page === 'home'
                                    ? 'EVERY PLAY COUNTS'
                                    : page === 'b30'
                                      ? 'MY BEST PERFORMANCES'
                                      : page === 'scores'
                                        ? 'MY PERSONAL COLLECTION'
                                        : 'MAKE IT YOURS'
                            }}
                        </div>
                        <h1>
                            {{
                                page === 'home'
                                    ? t('app.homeTitle')
                                    : t(pageInfo.label)
                            }}
                        </h1>
                        <p>{{ t(pageInfo.intro) }}</p>
                    </div>
                    <button
                        v-if="page === 'scores'"
                        class="button primary"
                        @click="editor?.open()"
                    >
                        <Plus :size="17" /> {{ t('common.manualAdd') }}
                    </button>
                    <B30ExportButton
                        v-show="page === 'b30'"
                        :summary="selectedRating"
                        :ready="canWrite"
                        @notify="notify"
                    />
                    <div v-if="page === 'home'" class="demo-label">
                        LOCAL DATA <span>{{ t('app.localData') }}</span>
                    </div>
                </div>
                <HomePage
                    v-if="page === 'home'"
                    :scores="scores"
                    :selected-rating="selectedRating"
                    v-model:mode="b30Mode"
                    @upload="uploadFiles"
                    :history-count="historyCount"
                    v-model:grain="ratingGrain"
                    @song="songDetails?.open($event)"
                    @view-last="ocr?.view()"
                    @view-task="viewRecognition"
                />
                <ScoresPage
                    v-if="page === 'scores'"
                    :scores="scores"
                    v-model:filters="scoreFilters"
                    @edit="editor?.open($event)"
                    @add="editor?.openChart($event)"
                    @song="songDetails?.open($event)"
                />
                <B30Page
                    v-if="page === 'b30'"
                    :mode-ratings="modeRatings"
                    :selected-rating="selectedRating"
                    v-model:mode="b30Mode"
                    v-model:filters="b30Filters"
                    @song="songDetails?.open($event)"
                />
                <SettingsPage
                    v-if="page === 'settings'"
                    :count="scores.length"
                    :history-count="historyCount"
                    :can-write="canWrite"
                    :excel-busy="excel?.pending ?? false"
                    @clear="clearDialog?.open()"
                    @import="excel?.start()"
                    @export="excel?.download(false)"
                    @template="excel?.download(true)"
                >
                    <template v-if="SiteAccount" #account>
                        <component :is="SiteAccount" @notify="notify" @view="albumSync?.open()" />
                    </template>
                </SettingsPage>
                <p v-if="databaseLoading" role="status">
                    {{ t('app.loading') }}
                </p>
                <div v-if="databaseError" class="panel error" role="alert">
                    {{ databaseError }}
                    <button class="button secondary" @click="reloadDatabase">
                        {{ t('common.retry') }}
                    </button>
                </div>
                <footer class="page-footer">
                    <span>
                        GROOVE ARCHIVE
                        <span class="footer-dot">·</span>
                        {{ t('app.footerTagline') }}
                    </span>
                </footer>
            </main>
        </div>
        <ScoreEditorDialog
            ref="editor"
            :can-write="canWrite"
            @notify="notify"
        />
        <OcrImportDialog
            ref="ocr"
            :active="page === 'home'"
            :can-write="canWrite"
            @notify="notify"
            @manual-add="editor?.open()"
        />
        <SongDetailsDialog
            ref="songDetails"
            :scores="scores"
            :can-write="canWrite"
            @notify="notify"
        />
        <ClearScoresDialog
            ref="clearDialog"
            :can-write="canWrite"
            :count="scores.length"
            :history-count="historyCount"
            @notify="notify"
        />
        <div id="toast-stack" class="toast-stack">
            <AppNotification ref="notification" />
        </div>
        <ExcelTransferDialog
            ref="excel"
            :can-write="canWrite"
            @notify="notify"
        />
        <component
            :is="AlbumSync"
            v-if="AlbumSync"
            ref="albumSync"
            @notify="notify"
            @manual-add="editor?.open()"
        />
    </div>
</template>
