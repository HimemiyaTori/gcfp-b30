<script setup lang="ts">
import { ref } from 'vue'
import RecognitionTask from '../recognition/RecognitionTask.vue'
import { cancel } from '../../core/album/controller'
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const task = ref<InstanceType<typeof RecognitionTask>>()
defineExpose({ open: () => task.value?.open() })
</script>

<template>
    <RecognitionTask ref="task" source="album" @cancel="cancel" @notify="(message, title) => emit('notify', message, title)" @manual-add="emit('manualAdd')" />
</template>
