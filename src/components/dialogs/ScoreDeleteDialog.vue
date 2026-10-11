<script setup lang="ts">
import { ref } from 'vue'
import type { ScoreRow } from '../../db/models'
import { songLanguage } from '../../composables/useSettings'
import { scoreRepository } from '../../db/scoreRepository'
const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
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
        emit('notify', '历史成绩已删除，最佳成绩和趋势已重新计算。')
    } catch {
        error.value = '删除失败，请检查浏览器存储权限后重试。'
    } finally {
        pending.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog ref="deleteDialog" class="editor-dialog" @cancel="pending && $event.preventDefault()">
        <h2>删除这条历史成绩？</h2>
        <p class="muted">
            {{ deleting?.[songLanguage] }} · {{ deleting?.difficulty }}
            {{ deleting?.level }} · {{ deleting?.score.toLocaleString() }} · {{ deleting?.importedAt ? new Date(deleting.importedAt).toLocaleString() : "--" }}
        </p>
        <div class="form-note">
            删除后将根据剩余历史重新计算最佳成绩、B30 和历史 Rating 曲线。
        </div>
        <div class="dialog-actions">
            <button class="button secondary" :disabled="pending" @click="deleteDialog?.close()">
                保留成绩
            </button>
            <button
                class="button primary"
                @click="deleteScore"
                :disabled="pending || !canWrite"
            >
                确认删除
            </button>
        </div>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
    </dialog>
</template>
