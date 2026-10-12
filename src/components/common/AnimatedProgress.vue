<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { motionTiming } from './motion'
const props = defineProps<{ value: number; max: number }>()
const { t } = useI18n()
const ratio = computed(() => Math.min(1, Math.max(0, props.value / Math.max(1, props.max))))
</script>

<template>
    <div class="animated-progress" role="progressbar" :aria-label="t('ocr.progressLabel')"
        :aria-valuemin="0" :aria-valuemax="Math.max(1, max)" :aria-valuenow="value"
        :aria-valuetext="t('ocr.progressValue', { done: value, total: max })">
        <div class="animated-progress-fill" :style="{ transform: `scaleX(${ratio})`, '--motion-progress': `${motionTiming.progress}ms` }"></div>
    </div>
</template>
