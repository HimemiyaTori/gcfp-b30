<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { coverThumbUrl } from '../core/song/cover'
const props = withDefaults(defineProps<{ src: string; size?: number }>(), { size: 38 })
// 优先同源缩略图，缺失时回退来源原图，再失败显示占位
const attempt = ref(0)
watch(() => props.src, () => { attempt.value = 0 })
const current = computed(() => (props.src ? [coverThumbUrl(props.src), props.src][attempt.value] : undefined))
</script>
<template>
    <span
        class="song-cover"
        :style="{
            width: `${props.size}px`,
            height: `${props.size}px`,
            flex: `0 0 ${props.size}px`,
            borderRadius: `${Math.max(5, Math.round(props.size * 0.13))}px`,
            fontSize: `${Math.round((props.size * 24) / 38)}px`,
        }"
    >
        <img v-if="current" :src="current" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="attempt++" />
        <span v-else aria-hidden="true">♪</span>
    </span>
</template>
<style scoped>
.song-cover { display: grid; place-items: center; overflow: hidden; background: var(--field); color: var(--muted); }
img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
