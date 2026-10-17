<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RecognitionTask from '../recognition/RecognitionTask.vue'
import { cancelManualImport, startManualImport, MAX_IMPORT_FILES } from '../../core/ocr/importer'
import { useRecognitionStore } from '../../stores/recognition'
const props = defineProps<{ active: boolean; canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const { t } = useI18n()
const task = ref<InstanceType<typeof RecognitionTask>>()
const recognition = useRecognitionStore()
async function start(files: File[]) {
    if (!props.active || !files.length) return
    if (!props.canWrite) return emit('notify', t('common.databaseNotReady'))
    if (files.length > MAX_IMPORT_FILES) return emit('notify', t('ocr.tooMany', { count: MAX_IMPORT_FILES }))
    if (recognition.tasks.manual.busy) {
        emit('notify', t('ocr.busy'))
        return task.value?.open()
    }
    const work = startManualImport(files)
    await task.value?.open()
    await work
}
watch(() => props.active, active => { if (!active) task.value?.close() })
defineExpose({ start, view: () => task.value?.open() })
</script>

<template>
    <RecognitionTask ref="task" source="manual" @cancel="cancelManualImport" @notify="(message, title) => emit('notify', message, title)" @manual-add="emit('manualAdd')" />
</template>
