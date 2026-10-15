<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ImportProgress from './ImportProgress.vue'
import { motionTiming } from '../common/motion'
import { releasePreviews } from '../../core/ocr/preview'
import { loadRecognition } from '../../db/recognitionRepository'
import { useOcrImport, MAX_IMPORT_FILES, type ImportJob } from '../../composables/useOcrImport'
const props = defineProps<{ active: boolean; canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t, locale } = useI18n()
const importDialog = ref<HTMLDialogElement>()
const importPhase = ref<'processing' | 'success'>('processing')
const { jobs, failures, skipped, importing, edgeSecurityHint,
    dismissEdgeSecurityHint, start: runImport, cancel } = useOcrImport()
// 查看最近一次结果时展示本地保存的记录
const stored = ref<{ finishedAt: number; jobs: ImportJob[] }>()
const shownJobs = computed(() => stored.value?.jobs ?? jobs.value)
const shownFailures = computed(() => stored.value ? stored.value.jobs.filter((job) => job.status === 'failed').length : failures.value.length)
const shownSkipped = computed(() => stored.value ? stored.value.jobs.filter((job) => job.status === 'skipped').length : skipped.value.length)
const importHasErrors = computed(() => !importing.value && shownFailures.value > 0)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
function resetPresentation() {
    generation++
    clearTimeout(timer)
    importPhase.value = 'processing'
    if (stored.value) releasePreviews(stored.value.jobs)
    stored.value = undefined
}
function close() {
    resetPresentation()
    cancel()
    importDialog.value?.close()
}
async function start(files: File[]) {
    if (!props.active || !files.length) return
    if (!props.canWrite) {
        emit('notify', t('common.databaseNotReady'))
        return
    }
    if (files.length > MAX_IMPORT_FILES) {
        emit('notify', t('ocr.tooMany', { count: MAX_IMPORT_FILES }))
        return
    }
    resetPresentation()
    const current = generation
    if (!importDialog.value?.open) importDialog.value?.showModal()
    await runImport(files)
    if (current !== generation || !jobs.value.length) return
    if (!failures.value.length && !skipped.value.length && !edgeSecurityHint.value) {
        timer = setTimeout(() => {
            importPhase.value = 'success'
            timer = setTimeout(() => {
                const count = jobs.value.length
                close()
                emit('notify', t('ocr.doneMessage', { count }, count), t('ocr.done'))
            }, motionTiming.successHold + motionTiming.successCircle + motionTiming.successCheck)
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress)
    }
}
async function view() {
    if (!props.active || importing.value) return
    resetPresentation()
    const current = generation
    const run = await loadRecognition('manual')
    if (current !== generation || !run) {
        if (run) releasePreviews(run.jobs)
        return
    }
    cancel()
    stored.value = run
    if (!importDialog.value?.open) importDialog.value?.showModal()
}
watch(() => props.active, active => { if (!active) close() })
onUnmounted(() => { resetPresentation() })
defineExpose({ start, view })
</script>

<template>
    <dialog
        ref="importDialog"
        class="editor-dialog import-dialog"
        aria-labelledby="import-title"
        @cancel.prevent="close()"
    >
        <ImportProgress
            :jobs="shownJobs"
            :importing="importing"
            :success="importPhase !== 'processing'"
            eyebrow="SCREENSHOT IMPORT"
            :note="
                stored
                    ? t('ocr.lastRun', { time: new Date(stored.finishedAt).toLocaleString(locale) })
                    : t('ocr.localNote')
            "
            :footnote="
                !importing
                    ? t('ocr.summary', { skipped: shownSkipped, failed: shownFailures })
                    : t('ocr.closeCancels')
            "
            title-id="import-title"
            :slow-hint="!stored && edgeSecurityHint"
            @dismiss-hint="dismissEdgeSecurityHint"
        >
            <template #actions>
                <button class="button secondary" @click="close()">
                    {{ importing ? t('ocr.cancel') : t('common.close') }}</button
                ><button
                    v-if="importHasErrors"
                    class="button primary"
                    @click="(close(), emit('manualAdd'))"
                >
                    {{ t('common.manualAdd') }}
                </button>
            </template>
        </ImportProgress>
    </dialog>
</template>
