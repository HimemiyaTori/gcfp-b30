<script setup lang="ts">
import { ImageDown } from 'lucide-vue-next'
import { ref } from 'vue'
import type { getModeB30 } from '../core/rating/calculator'
import { songLanguage } from '../composables/useSettings'

const props = defineProps<{ summary: ReturnType<typeof getModeB30>; ready: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const pending = ref(false)
async function download() {
    if (pending.value || !props.ready || !props.summary.items.length) return
    pending.value = true
    // 点击时固定模式、语言和成绩，生成期间切换页面或模式不会混入其他榜单
    const snapshot = { ...props.summary, items: props.summary.items.map(item => ({ ...item })) }
    const language = songLanguage.value
    try {
        const { exportB30 } = await import('../core/b30/export')
        const { missing } = await exportB30(snapshot, language)
        emit('notify', `${snapshot.label} B30 图片已生成。${missing ? ` ${missing} 张曲绘未加载，已使用占位。` : ''}`, '下载图片')
    } catch (cause) {
        emit('notify', cause instanceof Error ? cause.message : '图片生成失败，请重试。', '生成失败')
    } finally { pending.value = false }
}
</script>

<template>
    <button class="button primary" :disabled="pending || !ready || !summary.items.length" :aria-busy="pending" @click="download">
        <ImageDown :size="17" />{{ pending ? '正在生成图片…' : `生成 ${summary.mode === 'BASIC' ? 'BASIC' : 'ADV'} 图片` }}
    </button>
</template>
