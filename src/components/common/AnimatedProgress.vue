<script setup lang="ts">
import { computed } from 'vue'
import { motionTiming } from './motion'
const props = defineProps<{ value: number; max: number }>()
const ratio = computed(() => Math.min(1, Math.max(0, props.value / Math.max(1, props.max))))
</script>

<template>
    <div class="animated-progress" role="progressbar" aria-label="图片识别进度"
        :aria-valuemin="0" :aria-valuemax="Math.max(1, max)" :aria-valuenow="value"
        :aria-valuetext="`${value} / ${max} 张已处理`">
        <div class="animated-progress-fill" :style="{ transform: `scaleX(${ratio})`, '--motion-progress': `${motionTiming.progress}ms` }"></div>
    </div>
</template>
