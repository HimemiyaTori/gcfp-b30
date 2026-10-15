<script setup lang="ts">
import { CheckCircle2, LoaderCircle, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import CardTransition from '../common/CardTransition.vue'
import { album } from '../../core/album/controller'
const props = defineProps<{ hidden: boolean; summary?: string }>()
const emit = defineEmits<{ open: []; dismiss: [] }>()
const { t } = useI18n()
const done = computed(() => album.jobs.filter((job) => !['queued', 'running'].includes(job.status)).length)
const importing = computed(() => album.busy && album.phase === 'importing')
// 检查阶段还没有截图列表，不提供查看入口
const openable = computed(() => importing.value || (!album.busy && !!props.summary))
</script>

<template>
    <CardTransition variant="notice" v-slot="{ motionStyle }">
        <div v-if="!hidden && (album.busy || summary)" class="toast album-toast row gap-3" role="status" :style="motionStyle">
            <LoaderCircle v-if="album.busy" class="spin" :size="19" />
            <CheckCircle2 v-else :size="19" />
            <component
                :is="openable ? 'button' : 'div'"
                :type="openable ? 'button' : undefined"
                class="notification-copy album-toast-open"
                @click="openable && emit('open')"
            >
                <template v-if="album.busy">
                    <strong>
                        {{ importing ? t('sync.banner.importing') : t('sync.banner.checking') }}
                        <small v-if="importing">{{ t('ocr.progress', { done, total: album.jobs.length }) }}</small>
                    </strong>
                    <AnimatedProgress v-if="importing" :value="done" :max="album.jobs.length" />
                </template>
                <template v-else>
                    <strong>{{ t('sync.doneTitle') }}</strong>
                    <span>{{ summary }}</span>
                </template>
                <span v-if="openable" class="album-toast-link">{{ t('sync.banner.view') }}</span>
            </component>
            <button
                v-if="!album.busy || album.phase !== 'checking'"
                class="icon-button"
                :aria-label="t('common.closeNotice')"
                @click="emit('dismiss')"
            >
                <X :size="16" />
            </button>
        </div>
    </CardTransition>
</template>
