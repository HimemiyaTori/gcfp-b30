<script setup lang="ts">
import { computed, ref } from 'vue'
import { scoreRepository } from '../../db/scoreRepository'
import { songLanguage } from '../../composables/useSettings'
import type { ExcelPreview } from '../../core/excel/workbook'

const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const picker = ref<HTMLInputElement>()
const dialog = ref<HTMLDialogElement>()
const pending = ref(false)
const error = ref('')
const filename = ref('')
const preview = ref<ExcelPreview>()
const summary = ref<{ added: number; updated: number; skipped: number }>()
const ready = computed(() => props.canWrite && !pending.value && !!preview.value?.rows.length && !preview.value.issues.length && !!summary.value)
const message = (cause: unknown) => cause instanceof Error ? cause.message : '操作失败，请重试。'
function start() {
    if (!pending.value && props.canWrite) picker.value?.click()
}
async function selectFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || pending.value || !props.canWrite) return
    preview.value = undefined
    summary.value = undefined
    error.value = ''
    filename.value = file.name
    pending.value = true
    dialog.value?.showModal()
    try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('请选择 .xlsx 文件，可先下载本站模板。')
        if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MiB。')
        const { parseScoreWorkbook } = await import('../../core/excel/workbook')
        preview.value = parseScoreWorkbook(await file.arrayBuffer())
        if (!preview.value.rows.length && !preview.value.issues.length) error.value = '没有可导入的成绩，请在 BASIC / ADVANCED 表中填写 Score。'
        if (!preview.value.issues.length) summary.value = await scoreRepository.previewImport(preview.value.rows)
    } catch (cause) { error.value = message(cause) }
    finally { pending.value = false }
}
async function confirm() {
    if (!ready.value || !preview.value) return
    pending.value = true
    error.value = ''
    try {
        const result = await scoreRepository.importScores(preview.value.rows)
        dialog.value?.close()
        preview.value = undefined
        emit('notify', `新增 ${result.added} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条。`, 'Excel 导入完成')
    } catch (cause) { error.value = `导入失败，整批未写入。${message(cause)}` }
    finally { pending.value = false }
}
async function download(template: boolean) {
    if (pending.value || (!template && !props.canWrite)) return
    pending.value = true
    try {
        const { createScoreWorkbook, downloadWorkbook } = await import('../../core/excel/workbook')
        const records = template ? [] : await scoreRepository.list()
        const name = template ? 'FP_B30_导入模板.xlsx' : `FP_B30_成绩_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
        const book = createScoreWorkbook(records, songLanguage.value, template)
        const { addWorkbookCovers } = await import('../../core/excel/covers')
        const covers = await addWorkbookCovers(book)
        await downloadWorkbook(book, name)
        const coverMessage = covers.missing ? ` ${covers.missing} 张曲绘未加载，已显示占位。` : ''
        emit('notify', (template ? '模板已生成，请在 BASIC / ADVANCED 表中填写成绩。' : `已生成包含全部 ${records.length} 条成绩的 Excel 文件。`) + coverMessage, '下载文件')
    } catch (cause) { emit('notify', message(cause), '下载失败') }
    finally { pending.value = false }
}
function close() {
    preview.value = undefined
    summary.value = undefined
}
defineExpose({ start, download, pending })
</script>

<template>
    <input ref="picker" type="file" accept=".xlsx" hidden aria-label="选择 Excel 成绩文件" @change="selectFile" />
    <dialog ref="dialog" class="editor-dialog excel-dialog" aria-labelledby="excel-import-title" @cancel="pending && $event.preventDefault()" @close="close">
        <h2 id="excel-import-title">导入 Excel 成绩</h2>
        <p class="excel-filename">{{ filename }}</p>
        <p class="muted">新谱面新增，高分更新，低分跳过；同分仅补充未知信息。不会调低已有分数。</p>
        <p v-if="pending" role="status">正在处理，请稍候…</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template v-if="preview">
            <p>有效 {{ preview.rows.length }} 行 · 错误 {{ preview.issues.length }} 行 · 未填写 {{ preview.empty }} 行</p>
            <div v-if="preview.issues.length" role="alert">
                <p class="error">尚未写入任何成绩。请修正以下错误后重新选择文件。</p>
                <ul class="excel-errors">
                    <li v-for="issue in preview.issues" :key="`${issue.sheet}-${issue.row}`">{{ issue.sheet }} 第 {{ issue.row }} 行：{{ issue.message }}</li>
                </ul>
            </div>
            <p v-else-if="summary" class="excel-summary">预计新增 {{ summary.added }} 条 · 更新 {{ summary.updated }} 条 · 跳过 {{ summary.skipped }} 条</p>
            <p v-if="summary && !preview.issues.length" class="muted">确认时会按最新本地成绩重新比较，最终数量以完成提示为准。</p>
        </template>
        <div class="dialog-actions">
            <button class="button secondary" :disabled="pending" @click="dialog?.close()">取消</button>
            <button class="button primary" :disabled="!ready" @click="confirm">确认导入</button>
        </div>
    </dialog>
</template>

<style scoped>
.excel-dialog { width: min(620px, calc(100vw - 32px)); }
.excel-filename { overflow-wrap: anywhere; font-weight: 600; }
.excel-errors { max-height: 230px; overflow: auto; padding-left: 24px; font-size: 13px; line-height: 1.8; }
.excel-summary { padding: 14px; background: var(--field); border-radius: 10px; font-weight: 600; }
</style>
