<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AlbumProgress from './AlbumProgress.vue'
import ImportProgress from '../dialogs/ImportProgress.vue'
import { motionTiming } from '../common/motion'
import { releasePreviews } from '../../core/ocr/preview'
import { album, cancel, type AlbumRun } from '../../core/album/controller'
import { loadRecognition } from '../../db/recognitionRepository'
import type { ImportJob } from '../../composables/useOcrImport'
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t, locale } = useI18n()
const dialog = ref<HTMLDialogElement>()
const opened = ref(false)
const success = ref(false)
const hintDismissed = ref(false)
const toastDismissed = ref(false)
const summaryText = ref('')
// 打开时没有进行中的更新则展示本地保存的最近一次结果
const stored = ref<{ finishedAt: number; jobs: ImportJob[] }>()
const jobs = computed(() => stored.value?.jobs ?? album.jobs)
const running = computed(() => !stored.value && album.busy)
const failures = computed(() => jobs.value.filter((job) => job.status === 'failed').length)
const skipped = computed(() => jobs.value.filter((job) => job.status === 'skipped').length)
let timer: ReturnType<typeof setTimeout> | undefined
let summaryTimer: ReturnType<typeof setTimeout> | undefined
let loading = 0
const summary = (run: AlbumRun) => t(run.failed || run.skipped ? 'sync.doneIssues' : 'sync.done', { ...run })
function showSummary(run: AlbumRun) {
    clearTimeout(summaryTimer)
    summaryText.value = summary(run)
    summaryTimer = setTimeout(() => (summaryText.value = ''), 5000)
}
function release() {
    if (stored.value) releasePreviews(stored.value.jobs)
    else if (!album.busy) releasePreviews(album.jobs)
    stored.value = undefined
    album.viewing = false
}
function close() {
    loading++
    clearTimeout(timer)
    success.value = false
    opened.value = false
    release()
    dialog.value?.close()
}
function stop() {
    cancel()
    close()
}
async function open() {
    if (opened.value) return
    clearTimeout(timer)
    clearTimeout(summaryTimer)
    summaryText.value = ''
    success.value = false
    if (!album.busy) {
        const current = ++loading
        const run = await loadRecognition('album')
        if (current !== loading || album.busy || !run) {
            if (run) releasePreviews(run.jobs)
            if (current !== loading || !album.busy) return
        } else stored.value = run
    }
    album.viewing = !stored.value
    opened.value = true
    dialog.value?.showModal()
}
watch(
    () => album.busy,
    (busy) => {
        if (!busy) return
        hintDismissed.value = false
        toastDismissed.value = false
        clearTimeout(summaryTimer)
        summaryText.value = ''
    },
)
watch(
    () => album.run,
    (run) => {
        if (!run) return
        const watching = opened.value && !stored.value
        if (run.canceled) return emit('notify', t('sync.canceled'), t('sync.canceledTitle'))
        if (run.error) {
            if (!watching) emit('notify', run.error, t('sync.failedTitle'))
            return
        }
        if (!run.found) {
            if (run.checked) emit('notify', t('sync.noNew'), t('sync.upToDate'))
            return
        }
        if (!watching) return showSummary(run)
        if (run.failed || run.skipped || (album.slow && !hintDismissed.value)) return
        timer = setTimeout(
            () => {
                success.value = true
                timer = setTimeout(
                    () => {
                        close()
                        showSummary(run)
                    },
                    motionTiming.successHold + motionTiming.successCircle + motionTiming.successCheck,
                )
            },
            window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress,
        )
    },
)
onUnmounted(() => {
    clearTimeout(timer)
    clearTimeout(summaryTimer)
    release()
})
defineExpose({ open })
</script>

<template>
    <Teleport defer to="#toast-stack">
        <AlbumProgress
            :hidden="opened || (album.busy && toastDismissed)"
            :summary="summaryText"
            @open="open"
            @dismiss="album.busy ? (toastDismissed = true) : (summaryText = '')"
        />
    </Teleport>
    <dialog
        ref="dialog"
        class="editor-dialog import-dialog"
        aria-labelledby="album-sync-title"
        @cancel.prevent="close()"
    >
        <ImportProgress
            :jobs="jobs"
            :importing="running"
            :success="success"
            eyebrow="NINTENDO ALBUM"
            :note="
                stored
                    ? t('ocr.lastRun', { time: new Date(stored.finishedAt).toLocaleString(locale) })
                    : t('sync.note')
            "
            :footnote="running ? t('sync.running') : t('sync.summary', { skipped, failed: failures })"
            title-id="album-sync-title"
            :slow-hint="running && album.slow && !hintDismissed"
            @dismiss-hint="hintDismissed = true"
        >
            <p v-if="!stored && album.error" class="error" role="alert">{{ album.error }}</p>
            <template #actions>
                <template v-if="running">
                    <button class="button secondary" @click="stop">{{ t('sync.cancel') }}</button>
                    <button class="button primary" @click="close">{{ t('sync.background') }}</button>
                </template>
                <template v-else>
                    <button class="button secondary" @click="close">{{ t('common.close') }}</button>
                    <button v-if="failures" class="button primary" @click="(close(), emit('manualAdd'))">
                        {{ t('common.manualAdd') }}
                    </button>
                </template>
            </template>
        </ImportProgress>
    </dialog>
</template>
