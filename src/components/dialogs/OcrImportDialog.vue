<script setup lang="ts">
import { CircleHelp, LoaderCircle, X } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import AnimatedSuccess from '../common/AnimatedSuccess.vue'
import { motionTiming } from '../common/motion'
import { useOcrImport, MAX_IMPORT_FILES } from '../../composables/useOcrImport'
const props = defineProps<{ active: boolean; canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t } = useI18n()
const importDialog = ref<HTMLDialogElement>()
const importPhase = ref<'processing' | 'success'>('processing')
const { jobs, completed, failures, skipped, importing, edgeSecurityHint,
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
        <div
            v-if="importPhase !== 'processing'"
            class="import-success"
            role="status"
        >
            <AnimatedSuccess />
            <h2 id="import-title">{{ t('ocr.done') }}</h2>
            <p>{{ t('ocr.doneAll', { count: jobs.length }, jobs.length) }}</p>
            <small>{{ t('ocr.doneNote') }}</small>
        </div>
        <template v-else>
            <div class="between">
                <div>
                    <div class="eyebrow">SCREENSHOT IMPORT</div>
                    <h2 id="import-title">
                        {{
                            importHasErrors
                                ? t('ocr.partialFailed')
                                : importing
                                  ? t('ocr.importing')
                                  : t('ocr.finished')
                        }}
                    </h2>
                </div>
            </div>
            <p class="muted">
                {{ t('ocr.localNote') }}
            </p>
            <div class="between import-counter" aria-live="polite">
                <strong v-if="importHasErrors" class="error">
                    {{ t('ocr.failedCount', { failed: failures.length, total: jobs.length }) }}
                </strong>
                <span v-else
                    >{{ t('ocr.progress', { done: completed, total: jobs.length }) }}</span
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
                        ><CircleHelp :size="16" />{{ t('ocr.edgeTitle') }}</strong
                    >
                    <button
                        class="icon-button"
                        :aria-label="t('ocr.edgeClose')"
                        @click="dismissEdgeSecurityHint"
                    >
                        <X :size="16" />
                    </button>
                </div>
                <p>
                    {{ t('ocr.edgeSlow') }}
                </p>
                <details>
                    <summary>{{ t('ocr.edgeHow') }}</summary>
                    <p>
                        {{ t('ocr.edgeSteps') }}
                    </p>
                    <a
                        :href="t('ocr.edgeLink')"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ t('ocr.edgeDocs') }}
                    </a>
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
                            />{{ t(`ocr.status.${job.status}`) }}</span
                        >
                    </div>
                    <p v-if="job.error">{{ job.error }}</p>
                </article>
            </div>
            <p class="form-note">
                {{
                    !importing
                        ? t('ocr.summary', { skipped: skipped.length, failed: failures.length })
                        : t('ocr.closeCancels')
                }}
            </p>
            <div class="dialog-actions">
                <button class="button secondary" @click="close()">
                    {{ importing ? t('ocr.cancel') : t('common.close') }}</button
                ><button
                    v-if="importHasErrors"
                    class="button primary"
                    @click="(close(), emit('manualAdd'))"
                >
                    {{ t('common.manualAdd') }}
                </button>
            </div>
        </template>
    </dialog>
</template>
