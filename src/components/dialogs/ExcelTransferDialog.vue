<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { scoreRepository } from '../../db/scoreRepository'
import { songLanguage, uiLanguage } from '../../composables/useSettings'
import type { ExcelPreview } from '../../core/excel/workbook'

const props = defineProps<{ canWrite: boolean }>()
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t } = useI18n()
const picker = ref<HTMLInputElement>()
const dialog = ref<HTMLDialogElement>()
const pending = ref(false)
const error = ref('')
const filename = ref('')
const preview = ref<ExcelPreview>()
const summary = ref<{ recorded: number; added: number; updated: number; skipped: number; ignored: number }>()
const ready = computed(
    () =>
        props.canWrite &&
        !pending.value &&
        !!preview.value?.rows.length &&
        !preview.value.issues.length &&
        !!summary.value,
)
const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : t('excel.failed')
function start() {
    if (!pending.value && props.canWrite) picker.value?.click()
}
async function selectFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) await importFile(file)
}
async function importFile(file: File) {
    if (pending.value || !props.canWrite) return
    preview.value = undefined
    summary.value = undefined
    error.value = ''
    filename.value = file.name
    pending.value = true
    dialog.value?.showModal()
    try {
        if (!/\.xlsx$/i.test(file.name))
            throw new Error(t('excel.notXlsx'))
        if (file.size > 5 * 1024 * 1024) throw new Error(t('excel.tooLarge'))
        const { parseScoreWorkbook } = await import('../../core/excel/workbook')
        preview.value = parseScoreWorkbook(await file.arrayBuffer())
        if (!preview.value.rows.length && !preview.value.issues.length)
            error.value = t('excel.nothing')
        if (!preview.value.issues.length)
            summary.value = await scoreRepository.previewImport(
                preview.value.rows,
            )
    } catch (cause) {
        error.value = message(cause)
    } finally {
        pending.value = false
    }
}
async function confirm() {
    if (!ready.value || !preview.value) return
    pending.value = true
    error.value = ''
    try {
        const result = await scoreRepository.importScores(preview.value.rows)
        dialog.value?.close()
        preview.value = undefined
        emit('notify', t('excel.imported', result), t('excel.importedTitle'))
    } catch (cause) {
        error.value = t('excel.importFailed', { reason: message(cause) })
    } finally {
        pending.value = false
    }
}
async function download(template: boolean) {
    if (pending.value || (!template && !props.canWrite)) return
    const language = songLanguage.value
    const headerLanguage = uiLanguage.value
    pending.value = true
    try {
        const { createScoreWorkbook, downloadWorkbook } =
            await import('../../core/excel/workbook')
        const records = template ? [] : await scoreRepository.list()
        const name = template
            ? `${t('excel.templateFile')}.xlsx`
            : `${t('excel.exportFile')}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
        const book = createScoreWorkbook(records, language, template, headerLanguage)
        const { addWorkbookCovers } = await import('../../core/excel/covers')
        const covers = await addWorkbookCovers(book)
        await downloadWorkbook(book, name)
        const coverMessage = covers.missing
            ? ` ${t('excel.missingCovers', { count: covers.missing }, covers.missing)}`
            : ''
        emit(
            'notify',
            (template
                ? t('excel.templateReady')
                : t('excel.exportReady', { count: records.length }, records.length)) +
                coverMessage,
            t('excel.downloadTitle'),
        )
    } catch (cause) {
        emit('notify', message(cause), t('excel.downloadFailed'))
    } finally {
        pending.value = false
    }
}
function close() {
    preview.value = undefined
    summary.value = undefined
}
defineExpose({ start, importFile, download, pending })
</script>

<template>
    <input
        ref="picker"
        type="file"
        accept=".xlsx"
        hidden
        :aria-label="t('excel.picker')"
        @change="selectFile"
    />
    <dialog
        ref="dialog"
        class="editor-dialog excel-dialog"
        aria-labelledby="excel-import-title"
        @cancel="pending && $event.preventDefault()"
        @close="close"
    >
        <h2 id="excel-import-title">{{ t('excel.title') }}</h2>
        <p class="excel-filename">{{ filename }}</p>
        <p class="muted">{{ t('excel.rules') }}</p>
        <p v-if="pending" role="status">{{ t('excel.processing') }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template v-if="preview">
            <p>
                {{ t('excel.rows', { valid: preview.rows.length, invalid: preview.issues.length, empty: preview.empty }) }}
            </p>
            <div v-if="preview.issues.length" role="alert">
                <p class="error">{{ t('excel.blocked') }}</p>
                <ul class="excel-errors">
                    <li
                        v-for="issue in preview.issues"
                        :key="`${issue.sheet}-${issue.row}`"
                    >
                        {{ t('excel.issue', { sheet: issue.sheet, row: issue.row, message: issue.message }) }}
                    </li>
                </ul>
            </div>
            <p v-else-if="summary" class="excel-summary">
                {{ t('excel.summary', summary) }}
            </p>
            <p v-if="summary && !preview.issues.length" class="muted">
                {{ t('excel.recheck') }}
            </p>
        </template>
        <div class="dialog-actions">
            <button
                class="button secondary"
                :disabled="pending"
                @click="dialog?.close()"
            >
                {{ t('common.cancel') }}
            </button>
            <button class="button primary" :disabled="!ready" @click="confirm">
                {{ t('excel.confirm') }}
            </button>
        </div>
    </dialog>
</template>

<style scoped>
.excel-dialog {
    width: min(620px, calc(100vw - 32px));
}
.excel-filename {
    overflow-wrap: anywhere;
    font-weight: 600;
}
.excel-errors {
    max-height: 230px;
    overflow: auto;
    padding-left: 24px;
    font-size: 13px;
    line-height: 1.8;
}
.excel-summary {
    padding: 14px;
    background: var(--field);
    border-radius: 10px;
    font-weight: 600;
}
</style>
