<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { coverThumbUrl } from '../core/song/cover'
const props = defineProps<{ src: string }>()
// 优先同源缩略图，缺失时回退来源原图，再失败显示占位
const attempt = ref(0)
watch(() => props.src, () => { attempt.value = 0 })
const current = computed(() => (props.src ? [coverThumbUrl(props.src), props.src][attempt.value] : undefined))
</script>
<template>
    <span class="song-cover">
        <img v-if="current" :src="current" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="attempt++" />
        <span v-else aria-hidden="true">♪</span>
    </span>
</template>
<style scoped>
.song-cover { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; overflow: hidden; border-radius: 5px; background: var(--field); color: var(--muted); font-size: 24px; }
img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
