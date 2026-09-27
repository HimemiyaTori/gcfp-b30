<script setup lang="ts">
import { CheckCircle2, X } from 'lucide-vue-next'
import { onUnmounted, ref } from 'vue'
import CardTransition from '../common/CardTransition.vue'
const toast = ref(''),
    toastTitle = ref('')
let toastTimer: ReturnType<typeof setTimeout>
function show(message: string, title = '提示') {
    clearTimeout(toastTimer)
    toast.value = message
    toastTitle.value = title
    toastTimer = setTimeout(() => (toast.value = ''), 5000)
}

onUnmounted(() => clearTimeout(toastTimer))
defineExpose({ show })
</script>

<template>
    <CardTransition variant="notice" v-slot="{ motionStyle }">
        <div
            v-if="toast"
            role="status"
            class="toast row gap-3"
            :style="motionStyle"
        >
            <CheckCircle2 :size="19" />
            <div class="notification-copy">
                <strong>{{ toastTitle }}</strong
                ><span>{{ toast }}</span>
            </div>
            <button
                class="icon-button"
                aria-label="关闭提示"
                @click="toast = ''"
            >
                <X :size="16" />
            </button>
        </div>
    </CardTransition>
</template>
