<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ src?: string; fallback: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>

<template>
    <span class="profile-avatar" aria-hidden="true">
        <img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" @error="failed = true" />
        <template v-else>{{ fallback }}</template>
    </span>
</template>

<style scoped>
.profile-avatar {
    overflow: hidden;
}
.profile-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
