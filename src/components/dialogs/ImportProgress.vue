<script setup lang="ts">
import { CircleHelp, LoaderCircle, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import AnimatedSuccess from '../common/AnimatedSuccess.vue'
import type { ImportJob } from '../../core/ocr/models'
const props = defineProps<{
    jobs: ImportJob[]
    importing: boolean
    checking?: boolean
    success: boolean
    eyebrow: string
    note: string
    footnote: string
    titleId: string
    slowHint: boolean
}>()
const emit = defineEmits<{ dismissHint: [] }>()
const { t } = useI18n()
const completed = computed(() => props.jobs.filter((job) => !['queued', 'running'].includes(job.status)).length)
const failures = computed(() => props.jobs.filter((job) => job.status === 'failed').length)
const hasErrors = computed(() => !props.importing && failures.value > 0)
const picked = ref<number>()
watch(() => props.jobs, () => { picked.value = undefined })
const shown = computed(() => props.jobs.find((job) => job.index === picked.value && job.preview))
function togglePreview(index: number) {
    picked.value = picked.value === index ? undefined : index
}
</script>

<template>
    <div v-if="success" class="import-success" role="status">
        <AnimatedSuccess />
        <h2 :id="titleId">{{ t('ocr.done') }}</h2>
        <p>{{ t('ocr.doneAll', { count: jobs.length }, jobs.length) }}</p>
        <small>{{ t('ocr.doneNote') }}</small>
    </div>
    <template v-else>
        <div class="between">
            <div>
                <div class="eyebrow">{{ eyebrow }}</div>
                <h2 :id="titleId">
                    {{
                        checking
                            ? t('sync.banner.checking')
                            : hasErrors
                            ? t('ocr.partialFailed')
                            : importing
                              ? t('ocr.importing')
                              : t('ocr.finished')
                    }}
                </h2>
            </div>
        </div>
        <p class="muted">{{ note }}</p>
        <div v-if="!checking" class="between import-counter" aria-live="polite">
            <strong v-if="hasErrors" class="error">
                {{ t('ocr.failedCount', { failed: failures, total: jobs.length }) }}
            </strong>
            <span v-else>{{ t('ocr.progress', { done: completed, total: jobs.length }) }}</span>
        </div>
        <AnimatedProgress v-if="!checking" :value="completed" :max="jobs.length" />
        <figure v-if="shown?.preview" class="import-preview">
            <img :src="shown.preview" :alt="t('ocr.previewAlt', { name: shown.name })" draggable="false" />
            <figcaption>
                <span>#{{ shown.index }} · {{ shown.name }}</span>
                <span :class="shown.status">{{ t(`ocr.status.${shown.status}`) }}</span>
            </figcaption>
        </figure>
        <aside v-if="slowHint" class="ocr-performance-hint" role="status">
            <div class="between">
                <strong class="row gap-2"><CircleHelp :size="16" />{{ t('ocr.edgeTitle') }}</strong>
                <button class="icon-button" :aria-label="t('ocr.edgeClose')" @click="emit('dismissHint')">
                    <X :size="16" />
                </button>
            </div>
            <p>{{ t('ocr.edgeSlow') }}</p>
            <details>
                <summary>{{ t('ocr.edgeHow') }}</summary>
                <p>{{ t('ocr.edgeSteps') }}</p>
                <a :href="t('ocr.edgeLink')" target="_blank" rel="noopener noreferrer">{{ t('ocr.edgeDocs') }} </a>
            </details>
        </aside>
        <div class="import-results">
            <article
                v-for="job in jobs"
                :key="job.index"
                class="import-result"
                :class="[job.status, { current: shown?.index === job.index, previewable: !!job.preview }]"
                @click="job.preview && togglePreview(job.index)"
            >
                <button
                    v-if="job.preview"
                    type="button"
                    class="import-thumb"
                    :aria-pressed="shown?.index === job.index"
                    :aria-label="t(shown?.index === job.index ? 'ocr.previewHide' : 'ocr.previewShow', { name: job.name })"
                    @click.stop="togglePreview(job.index)"
                >
                    <img :src="job.preview" alt="" draggable="false" />
                </button>
                <div class="import-result-body">
                    <div class="between">
                        <strong>#{{ job.index }} · {{ job.name }}</strong>
                        <span class="row gap-2">
                            <LoaderCircle v-if="job.status === 'running'" class="spin" :size="15" />{{ t(`ocr.status.${job.status}`) }}
                        </span>
                    </div>
                    <p v-if="job.error">{{ job.error }}</p>
                </div>
            </article>
        </div>
        <slot />
        <p class="form-note">{{ footnote }}</p>
        <div class="dialog-actions"><slot name="actions" /></div>
    </template>
</template>
