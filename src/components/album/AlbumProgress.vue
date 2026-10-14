<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import CardTransition from '../common/CardTransition.vue'
import { album } from '../../core/album/controller'
const { t } = useI18n()
const done = computed(() => album.jobs.filter((job) => !['queued', 'running'].includes(job.status)).length)
</script>

<template>
    <CardTransition v-slot="{ motionStyle }">
        <div v-if="album.busy" class="album-progress panel" role="status" :style="motionStyle">
            <div class="between album-progress-head">
                <span class="row gap-2">
                    <LoaderCircle class="spin" :size="16" />
                    <strong>{{ album.phase === 'importing' ? t('sync.banner.importing') : t('sync.banner.checking') }}</strong>
                </span>
                <span class="row gap-3">
                    <span v-if="album.phase === 'importing'" class="muted">
                        {{ t('ocr.progress', { done, total: album.jobs.length }) }}
                    </span>
                    <a href="#settings" class="text-link">{{ t('sync.banner.view') }}</a>
                </span>
            </div>
            <AnimatedProgress v-if="album.phase === 'importing'" :value="done" :max="album.jobs.length" />
        </div>
    </CardTransition>
</template>

<style scoped>
.album-progress {
    display: grid;
    gap: 12px;
    margin-bottom: 22px;
    padding: 14px 18px;
    font-size: 13px;
}
.album-progress-head {
    gap: 12px;
    flex-wrap: wrap;
}
.album-progress svg {
    color: var(--accent);
}
</style>
