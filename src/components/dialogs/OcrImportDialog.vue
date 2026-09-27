<script setup lang="ts">
import { CircleHelp, LoaderCircle, X } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import AnimatedSuccess from '../common/AnimatedSuccess.vue'
import { motionTiming } from '../common/motion'
import { useOcrImport, MAX_IMPORT_FILES } from '../../composables/useOcrImport'
const props = defineProps<{ active: boolean; canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string]; manualAdd: [] }>()
const importDialog = ref<HTMLDialogElement>()
const importPhase = ref<'processing' | 'success'>('processing')
const { jobs, completed, failures, skipped, importing, edgeSecurityHint,
    dismissEdgeSecurityHint, start: runImport, cancel } = useOcrImport()
const importHasErrors = computed(() => !importing.value && failures.value.length > 0)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
function resetPresentation() {
    generation++
    clearTimeout(timer)
    importPhase.value = 'processing'
}
function close() {
    resetPresentation()
    cancel()
    importDialog.value?.close()
}
async function start(files: File[]) {
    if (!props.active || !files.length) return
    if (!props.canWrite) {
        emit('notify', '本地数据库尚未就绪，请先重试。')
        return
    }
    if (files.length > MAX_IMPORT_FILES) {
        emit('notify', `每批最多选择 ${MAX_IMPORT_FILES} 张截图。`)
        return
    }
    resetPresentation()
    const current = generation
    importDialog.value?.showModal()
    await runImport(files)
    if (current !== generation || !jobs.value.length) return
    if (!failures.value.length && !skipped.value.length && !edgeSecurityHint.value) {
        timer = setTimeout(() => {
            importPhase.value = 'success'
            timer = setTimeout(() => {
                const count = jobs.value.length
                close()
                emit('notify', `已处理 ${count} 张截图，同一谱面仅保留最高分。`, '录入完成')
            }, motionTiming.successHold + motionTiming.successCircle + motionTiming.successCheck)
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : motionTiming.progress)
    }
}
watch(() => props.active, active => { if (!active) close() })
onUnmounted(() => { generation++; clearTimeout(timer) })
defineExpose({ start })
</script>

<template>
    <dialog
        ref="importDialog"
        class="editor-dialog import-dialog"
        aria-labelledby="import-title"
        @cancel.prevent="close()"
    >
        <div
            v-if="importPhase !== 'processing'"
            class="import-success"
            role="status"
        >
            <AnimatedSuccess />
            <h2 id="import-title">录入完成</h2>
            <p>已处理全部 {{ jobs.length }} 张截图</p>
            <small>同一谱面仅保留最高分</small>
        </div>
        <template v-else>
            <div class="between">
                <div>
                    <div class="eyebrow">SCREENSHOT IMPORT</div>
                    <h2 id="import-title">
                        {{
                            importHasErrors
                                ? '部分图片识别失败'
                                : importing
                                  ? '正在录入成绩'
                                  : '处理完成'
                        }}
                    </h2>
                </div>
            </div>
            <p class="muted">
                截图仅在本机处理；首次识别需要下载模型，关闭弹窗或切页可取消。
            </p>
            <div class="between import-counter" aria-live="polite">
                <strong v-if="importHasErrors" class="error">
                    识别错误：{{ failures.length }} / {{ jobs.length }}
                </strong>
                <span v-else
                    >{{ completed }} / {{ jobs.length }} 已处理</span
                >
            </div>
            <AnimatedProgress :value="completed" :max="jobs.length" />
            <aside
                v-if="edgeSecurityHint"
                class="ocr-performance-hint"
                role="status"
            >
                <div class="between">
                    <strong class="row gap-2"
                        ><CircleHelp :size="16" />浏览器设置提示</strong
                    >
                    <button
                        class="icon-button"
                        aria-label="关闭识别速度提示"
                        @click="dismissEdgeSecurityHint"
                    >
                        <X :size="16" />
                    </button>
                </div>
                <p>
                    当前图片识别耗时较长，可能与 Edge 的“增强安全”设置有关。
                </p>
                <details>
                    <summary>查看处理方法</summary>
                    <p>
                        点击地址栏左侧的站点信息图标，检查当前站点是否启用了增强安全。
                        您可以将当前站点设为例外，刷新页面后重新录入成绩；也可以尝试换用其他浏览器。
                    </p>
                    <a
                        href="https://learn.microsoft.com/zh-cn/deployedge/microsoft-edge-security-browse-safer"
                        target="_blank"
                        rel="noopener noreferrer"
                        >查看 Microsoft 设置说明
                    </a>
                </details>
            </aside>
            <div class="import-results">
                <article
                    v-for="job in jobs"
                    :key="job.index"
                    class="import-result"
                    :class="job.status"
                >
                    <div class="between">
                        <strong>#{{ job.index }} · {{ job.name }}</strong
                        ><span class="row gap-2"
                            ><LoaderCircle
                                v-if="job.status === 'running'"
                                class="spin"
                                :size="15"
                            />{{
                                job.status === 'queued'
                                    ? '排队中'
                                    : job.status === 'running'
                                      ? '识别中'
                                      : job.status === 'failed'
                                        ? '识别错误'
                                        : job.status === 'skipped'
                                          ? '已跳过'
                                          : '已处理'
                            }}</span
                        >
                    </div>
                    <p v-if="job.error">{{ job.error }}</p>
                </article>
            </div>
            <p class="form-note">
                {{
                    !importing
                        ? `跳过 ${skipped.length} 张，失败 ${failures.length} 张。失败图片不会生成成绩，可以重新选择图片或手动新增。`
                        : '关闭弹窗将取消未完成任务。'
                }}
            </p>
            <div class="dialog-actions">
                <button class="button secondary" @click="close()">
                    {{ importing ? '取消识别' : '关闭' }}</button
                ><button
                    v-if="importHasErrors"
                    class="button primary"
                    @click="(close(), emit('manualAdd'))"
                >
                    手动新增
                </button>
            </div>
        </template>
    </dialog>
</template>
