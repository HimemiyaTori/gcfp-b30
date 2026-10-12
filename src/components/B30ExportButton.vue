<script setup lang="ts">
import { ImageDown } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { getModeB30 } from '../core/rating/calculator'
import { songLanguage } from '../composables/useSettings'

const props = defineProps<{ summary: ReturnType<typeof getModeB30>; ready: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t } = useI18n()
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
        emit('notify', t('b30Export.done', { mode: snapshot.label }) + (missing ? ` ${t('b30Export.missingCovers', { count: missing }, missing)}` : ''), t('b30Export.doneTitle'))
    } catch (cause) {
        emit('notify', cause instanceof Error ? cause.message : t('b30Export.failed'), t('b30Export.failedTitle'))
    } finally { pending.value = false }
}
</script>

<template>
    <button class="button primary" :disabled="pending || !ready || !summary.items.length" :aria-busy="pending" @click="download">
        <ImageDown :size="17" />{{ pending ? t('b30Export.pending') : t('b30Export.button', { mode: summary.mode === 'BASIC' ? 'BASIC' : 'ADV' }) }}
    </button>
</template>
