<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ImportProgress from '../dialogs/ImportProgress.vue'
import { motionTiming } from '../common/motion'
import { album, cancel, type AlbumRun } from '../../core/album/controller'
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const success = ref(false)
const hintDismissed = ref(false)
const failures = computed(() => album.jobs.filter((job) => job.status === 'failed').length)
const skipped = computed(() => album.jobs.filter((job) => job.status === 'skipped').length)
let timer: ReturnType<typeof setTimeout> | undefined
const summary = (run: AlbumRun) => t(run.failed || run.skipped ? 'sync.doneIssues' : 'sync.done', { ...run })
function close() {
    clearTimeout(timer)
    dialog.value?.close()
}
function stop() {
    cancel()
    close()
}
// 手动更新发现新截图时打开进度弹窗，自动更新只显示进度条
watch(
    () => album.manual && album.phase === 'importing',
    (importing) => {
        if (!importing) return
        clearTimeout(timer)
        success.value = false
        hintDismissed.value = false
        if (!dialog.value?.open) dialog.value?.showModal()
    },
)
watch(
    () => album.run,
    (run) => {
        if (!run) return
        const open = !!dialog.value?.open
        if (run.canceled) return emit('notify', t('sync.canceled'), t('sync.canceledTitle'))
        if (run.error) {
            if (!open) emit('notify', run.error, t('sync.failedTitle'))
            return
        }
        if (!run.found) {
            if (run.manual) emit('notify', t('sync.noNew'), t('sync.upToDate'))
            return
        }
        if (!open) return emit('notify', summary(run), t('sync.doneTitle'))
        if (run.failed || run.skipped || (album.slow && !hintDismissed.value)) return
        timer = setTimeout(
            () => {
                success.value = true
                timer = setTimeout(
                    () => {
                        close()
                        emit('notify', summary(run), t('sync.doneTitle'))
                    },
                    motionTiming.successHold + motionTiming.successCircle + motionTiming.successCheck,
                )
            },
            window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress,
        )
    },
)
onUnmounted(() => clearTimeout(timer))
</script>

<template>
    <dialog
        ref="dialog"
        class="editor-dialog import-dialog"
        aria-labelledby="album-sync-title"
        @cancel.prevent="close()"
    >
        <ImportProgress
            :jobs="album.jobs"
            :importing="album.busy"
            :success="success"
            eyebrow="NINTENDO ALBUM"
            :note="t('sync.note')"
            :footnote="album.busy ? t('sync.running') : t('sync.summary', { skipped, failed: failures })"
            title-id="album-sync-title"
            :slow-hint="album.slow && !hintDismissed"
            @dismiss-hint="hintDismissed = true"
        >
            <p v-if="album.error" class="error" role="alert">{{ album.error }}</p>
            <template #actions>
                <template v-if="album.busy">
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
