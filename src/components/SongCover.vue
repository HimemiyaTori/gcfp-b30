<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ src: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>
<template>
    <span class="song-cover">
        <img v-if="src && !failed" :src="src" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failed = true" />
        <span v-else aria-hidden="true">♪</span>
    </span>
</template>
<style scoped>
.song-cover { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; overflow: hidden; border-radius: 5px; background: var(--field); color: var(--muted); font-size: 24px; }
img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
