<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ImportProgress from './ImportProgress.vue'
import { motionTiming } from '../common/motion'
import { useOcrImport, MAX_IMPORT_FILES } from '../../composables/useOcrImport'
const props = defineProps<{ active: boolean; canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t } = useI18n()
const importDialog = ref<HTMLDialogElement>()
const importPhase = ref<'processing' | 'success'>('processing')
const { jobs, failures, skipped, importing, edgeSecurityHint,
    dismissEdgeSecurityHint, start: runImport, cancel } = useOcrImport()
const importHasErrors = computed(() => !importing.value && failures.value.length > 0)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
function resetPresentation() {
    generation++
    clearTimeout(timer)
    importPhase.value = 'processing'
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
    importDialog.value?.showModal()
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
watch(() => props.active, active => { if (!active) close() })
onUnmounted(() => { generation++; clearTimeout(timer) })
defineExpose({ start })
</script>

<template>
    <dialog
        ref="importDialog"
        class="editor-dialog import-dialog"
        aria-labelledby="import-title"
        @cancel.prevent="close()"
    >
        <ImportProgress
            :jobs="jobs"
            :importing="importing"
            :success="importPhase !== 'processing'"
            eyebrow="SCREENSHOT IMPORT"
            :note="t('ocr.localNote')"
            :footnote="
                !importing
                    ? t('ocr.summary', { skipped: skipped.length, failed: failures.length })
                    : t('ocr.closeCancels')
            "
            title-id="import-title"
            :slow-hint="edgeSecurityHint"
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
