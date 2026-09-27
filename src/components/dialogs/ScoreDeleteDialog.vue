<script setup lang="ts">
import { ref } from 'vue'
import type { ScoreRow } from '../../db/models'
import { songLanguage } from '../../composables/useSettings'
import { scoreRepository } from '../../db/scoreRepository'
const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const pending = ref(false)
const deleteDialog = ref<HTMLDialogElement>(),
    deleting = ref<ScoreRow | null>(null)
function open(s: ScoreRow) {
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
        await scoreRepository.remove(deleting.value.id)
        deleteDialog.value?.close()
        emit('notify', '成绩已删除。')
    } catch {
        emit('notify', '删除失败，请检查浏览器存储权限后重试。', '删除失败')
    } finally {
        pending.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog ref="deleteDialog" class="editor-dialog">
        <h2>删除这份成绩？</h2>
        <p class="muted">
            {{ deleting?.[songLanguage] }} · {{ deleting?.difficulty }}
            {{ deleting?.level }}
        </p>
        <div class="form-note">
            删除后，该谱面将从成绩库移除，B30 与总 RT 会重新计算。
        </div>
        <div class="dialog-actions">
            <button class="button secondary" @click="deleteDialog?.close()">
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
    </dialog>
</template>
