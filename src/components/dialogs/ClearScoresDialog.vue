<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { scoreRepository } from '../../db/scoreRepository'
const props = defineProps<{ canWrite: boolean; count: number; historyCount: number }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t } = useI18n()
const pending = ref(false)
const clearDialog = ref<HTMLDialogElement>(),
    clearError = ref('')
function open() {
    clearError.value = ''
    clearDialog.value?.showModal()
}
async function clearScores() {
    if (pending.value || !props.canWrite) return
    pending.value = true
    clearError.value = ''
    try {
        await scoreRepository.clear()
        clearDialog.value?.close()
        emit('notify', t('clear.done'))
    } catch {
        clearError.value = t('clear.failed')
    } finally {
        pending.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog
        ref="clearDialog"
        class="editor-dialog"
        aria-labelledby="clear-data-title"
        @cancel="pending && $event.preventDefault()"
    >
        <h2 id="clear-data-title">{{ t('clear.title') }}</h2>
        <p class="muted">
            {{ t('clear.description', { count, history: historyCount }) }}
        </p>
        <p v-if="clearError" class="error" role="alert">{{ clearError }}</p>
        <div class="dialog-actions">
            <button
                class="button secondary"
                :disabled="pending"
                @click="clearDialog?.close()"
            >
                {{ t('common.cancel') }}
            </button>
            <button
                class="button primary danger-button"
                :disabled="pending || !canWrite"
                @click="clearScores"
            >
                {{ pending ? t('clear.pending') : t('clear.confirm') }}
            </button>
        </div>
    </dialog>
</template>
