<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScoreRow } from '../../db/models'
import { songLanguage } from '../../composables/useSettings'
import { scoreRepository } from '../../db/scoreRepository'
import { formatDisplayDateTime } from '../../core/dateTime'
const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t, locale } = useI18n()
const pending = ref(false)
const error = ref('')
const deleteDialog = ref<HTMLDialogElement>(),
    deleting = ref<ScoreRow | null>(null)
function open(s: ScoreRow) {
    error.value = ''
    deleting.value = s
    deleteDialog.value?.showModal()
}
async function deleteScore() {
    if (
        !deleting.value ||
        pending.value ||
        !props.canWrite
    )
        return
    pending.value = true
    try {
        await scoreRepository.removeHistory(deleting.value.id)
        deleteDialog.value?.close()
        emit('notify', t('deleteHistory.done'))
    } catch {
        error.value = t('deleteHistory.failed')
    } finally {
        pending.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog ref="deleteDialog" class="editor-dialog" @cancel="pending && $event.preventDefault()">
        <h2>{{ t('deleteHistory.title') }}</h2>
        <p class="muted">
            {{ deleting?.[songLanguage] }} · {{ deleting?.difficulty }}
            {{ deleting?.level }} · {{ deleting?.score.toLocaleString(locale) }} · {{ deleting?.importedAt ? formatDisplayDateTime(deleting.importedAt, locale) : "--" }}
        </p>
        <div class="form-note">
            {{ t('deleteHistory.description') }}
        </div>
        <div class="dialog-actions">
            <button class="button secondary" :disabled="pending" @click="deleteDialog?.close()">
                {{ t('deleteHistory.keep') }}
            </button>
            <button
                class="button primary"
                @click="deleteScore"
                :disabled="pending || !canWrite"
            >
                {{ t('deleteHistory.confirm') }}
            </button>
        </div>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
    </dialog>
</template>
