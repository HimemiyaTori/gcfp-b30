<script setup lang="ts">
import { CheckCircle2, LoaderCircle, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import CardTransition from '../common/CardTransition.vue'
import type { RecognitionSource } from '../../db/models'
import type { RecognitionTask } from '../../stores/recognition'
const props = defineProps<{ source: RecognitionSource; task: RecognitionTask; hidden: boolean; summary: string }>()
const emit = defineEmits<{ open: []; dismiss: [] }>()
const { t } = useI18n()
const done = computed(() => props.task.jobs.filter(job => !['queued', 'running'].includes(job.status)).length)
const importing = computed(() => props.task.busy && props.task.phase === 'importing')
</script>

<template>
    <CardTransition variant="notice" v-slot="{ motionStyle }">
        <div
            v-if="!hidden && (task.busy || summary)"
            class="toast recognition-toast row gap-3"
            :class="source === 'album' ? 'album-toast' : 'ocr-toast'"
            :data-source="source"
            role="status"
            :style="motionStyle"
        >
            <LoaderCircle v-if="task.busy" class="spin" :size="19" />
            <CheckCircle2 v-else :size="19" />
            <button type="button" class="notification-copy recognition-toast-open" @click="emit('open')">
                <template v-if="task.busy">
                    <strong>
                        {{ source === 'album' ? t(importing ? 'sync.banner.importing' : 'sync.banner.checking') : t('ocr.importing') }}
                        <small v-if="importing">{{ t('ocr.progress', { done, total: task.jobs.length }) }}</small>
                    </strong>
                    <AnimatedProgress v-if="importing" :value="done" :max="task.jobs.length" />
                </template>
                <template v-else>
                    <strong>{{ t(source === 'album' ? 'sync.doneTitle' : 'ocr.done') }}</strong>
                    <span>{{ summary }}</span>
                </template>
                <span class="recognition-toast-link">{{ t('sync.banner.view') }}</span>
            </button>
            <button v-if="!task.busy" class="icon-button" :aria-label="t('common.closeNotice')" @click="emit('dismiss')">
                <X :size="16" />
            </button>
        </div>
    </CardTransition>
</template>
