<script setup lang="ts">
import { ref } from 'vue'
import { scoreRepository } from '../../db/scoreRepository'
const props = defineProps<{ canWrite: boolean; count: number }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
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
        emit('notify', '本地成绩已全部清空。')
    } catch {
        clearError.value = '清空失败，请检查浏览器存储权限后重试。'
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
        <h2 id="clear-data-title">清空全部成绩？</h2>
        <p class="muted">
            将永久删除此浏览器中的
            {{ count }} 条成绩，无法撤销。B30 和总 RT
            会随之清空，曲库与外观偏好将保留。
        </p>
        <p v-if="clearError" class="error" role="alert">{{ clearError }}</p>
        <div class="dialog-actions">
            <button
                class="button secondary"
                :disabled="pending"
                @click="clearDialog?.close()"
            >
                取消
            </button>
            <button
                class="button primary danger-button"
                :disabled="pending || !canWrite"
                @click="clearScores"
            >
                {{ pending ? '清空中…' : '确认清空全部成绩' }}
            </button>
        </div>
    </dialog>
</template>
