<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ImportProgress from '../dialogs/ImportProgress.vue'
import RecognitionProgress from './RecognitionProgress.vue'
import { motionTiming } from '../common/motion'
import { releasePreviews } from '../../core/ocr/preview'
import { loadRecognition } from '../../db/recognitionRepository'
import { useRecognitionStore, type RecognitionRun } from '../../stores/recognition'
import type { RecognitionSource } from '../../db/models'
import type { ImportJob } from '../../core/ocr/models'
const props = defineProps<{ source: RecognitionSource }>()
const emit = defineEmits<{ cancel: []; notify: [message: string, title?: string]; manualAdd: [] }>()
const { t, locale } = useI18n()
const store = useRecognitionStore()
const task = computed(() => store.tasks[props.source])
const dialog = ref<HTMLDialogElement>()
const opened = ref(false)
const success = ref(false)
const hintDismissed = ref(false)
const summaryText = ref('')
const stored = ref<{ finishedAt: number; jobs: ImportJob[] }>()
const jobs = computed(() => stored.value?.jobs ?? task.value.jobs)
const running = computed(() => !stored.value && task.value.busy)
const failures = computed(() => jobs.value.filter(job => job.status === 'failed').length)
const skipped = computed(() => jobs.value.filter(job => job.status === 'skipped').length)
const album = computed(() => props.source === 'album')
const titleId = computed(() => album.value ? 'album-sync-title' : 'import-title')
let timer: ReturnType<typeof setTimeout> | undefined
let summaryTimer: ReturnType<typeof setTimeout> | undefined
let loading = 0
function showSummary(run: RecognitionRun) {
    clearTimeout(summaryTimer)
    summaryText.value = album.value
        ? t(run.failed || run.skipped ? 'sync.doneIssues' : 'sync.done', { ...run })
        : run.failed || run.skipped
          ? t('ocr.doneIssues', { count: run.found, skipped: run.skipped, failed: run.failed })
          : t('ocr.doneMessage', { count: run.found }, run.found)
    summaryTimer = setTimeout(() => (summaryText.value = ''), 5000)
}
function release() {
    if (stored.value) releasePreviews(stored.value.jobs)
    else if (!task.value.busy) releasePreviews(task.value.jobs)
    stored.value = undefined
    task.value.viewing = false
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
    emit('cancel')
    close()
}
async function open() {
    if (opened.value) return
    const current = ++loading
    clearTimeout(timer)
    clearTimeout(summaryTimer)
    summaryText.value = ''
    success.value = false
    if (!task.value.busy) {
        const run = await loadRecognition(props.source)
        if (current !== loading || task.value.busy || !run) {
            if (run) releasePreviews(run.jobs)
            if (current !== loading || !task.value.busy) return
        } else stored.value = run
    }
    if (current !== loading) return
    task.value.viewing = !stored.value
    opened.value = true
    dialog.value?.showModal()
}
watch(() => task.value.id, () => {
    loading++
    clearTimeout(timer)
    clearTimeout(summaryTimer)
    summaryText.value = ''
    success.value = false
    hintDismissed.value = false
    if (stored.value) releasePreviews(stored.value.jobs)
    stored.value = undefined
    task.value.viewing = opened.value
})
watch(() => task.value.run, run => {
    if (!run) return
    const watching = opened.value && !stored.value
    if (run.canceled) return emit('notify', t(album.value ? 'sync.canceled' : 'ocr.canceledMessage'), t(album.value ? 'sync.canceledTitle' : 'ocr.canceledTitle'))
    if (run.error) {
        if (!watching) emit('notify', run.error, t(album.value ? 'sync.failedTitle' : 'ocr.partialFailed'))
        return
    }
    if (!run.found) {
        if (album.value && run.checked) emit('notify', t('sync.noNew'), t('sync.upToDate'))
        return
    }
    if (!watching) return showSummary(run)
    if (run.failed || run.skipped || (task.value.slow && !hintDismissed.value)) return
    timer = setTimeout(() => {
        success.value = true
        timer = setTimeout(() => {
            close()
            showSummary(run)
        }, motionTiming.successHold + motionTiming.successCircle + motionTiming.successCheck)
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress)
})
onUnmounted(() => {
    loading++
    clearTimeout(timer)
    clearTimeout(summaryTimer)
    release()
})
defineExpose({ open, close })
</script>

<template>
    <Teleport defer to="#toast-stack">
        <RecognitionProgress :source="source" :task="task" :hidden="opened" :summary="summaryText" @open="open" @dismiss="summaryText = ''" />
    </Teleport>
    <dialog ref="dialog" class="editor-dialog import-dialog" :data-source="source" :aria-labelledby="titleId" @cancel.prevent="close()">
        <ImportProgress
            :jobs="jobs"
            :importing="running"
            :checking="running && task.phase === 'checking'"
            :success="success"
            :eyebrow="album ? 'NINTENDO ALBUM' : 'SCREENSHOT IMPORT'"
            :note="stored ? t('ocr.lastRun', { time: new Date(stored.finishedAt).toLocaleString(locale) }) : t(album ? 'sync.note' : 'ocr.localNote')"
            :footnote="running ? t(album ? 'sync.running' : 'ocr.running') : t(album ? 'sync.summary' : 'ocr.summary', { skipped, failed: failures })"
            :title-id="titleId"
            :slow-hint="!stored && task.slow && !hintDismissed"
            @dismiss-hint="hintDismissed = true"
        >
            <p v-if="!stored && task.error" class="error" role="alert">{{ task.error }}</p>
            <template #actions>
                <template v-if="running">
                    <button class="button secondary" @click="stop">{{ t(album ? 'sync.cancel' : 'ocr.cancel') }}</button>
                    <button class="button primary" @click="close">{{ t(album ? 'sync.background' : 'ocr.background') }}</button>
                </template>
                <template v-else>
                    <button class="button secondary" @click="close">{{ t('common.close') }}</button>
                    <button v-if="failures" class="button primary" @click="(close(), emit('manualAdd'))">{{ t('common.manualAdd') }}</button>
                </template>
            </template>
        </ImportProgress>
    </dialog>
</template>
