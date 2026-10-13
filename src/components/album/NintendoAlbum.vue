<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { album, beginBinding, cancel, confirm, finishBinding, preview, refreshBinding, reject, retry, scan, unbind } from '../../core/album/controller'
import { database } from '../../db/database'
import type { AlbumItem } from '../../db/albumModels'
import { songService } from '../../core/song/songService'
import { songLanguage } from '../../composables/useSettings'
const props = defineProps<{ canWrite: boolean }>()
const { t } = useI18n()
const opened = ref(false), consent = ref(false), actionBusy = ref(false)
const callback = ref(''), authUrl = ref(''), error = ref('')
const selected = ref<AlbumItem>(), image = ref(''), imageError = ref('')
const chartId = ref(''), score = ref(0), fc = ref(false), ap = ref(false), chain = ref(''), playedAt = ref('')
const protection = ref(0)
let imageController: AbortController | undefined
const charts = songService.songs.flatMap(song => song.charts.map(chart => ({ songId: song.id, chartId: chart.id, title: song.title, song, chart })))
const pending = computed(() => album.items.filter(item => !['imported', 'skipped'].includes(item.stage)))
const date = (value?: number | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—'
async function run(work: () => Promise<unknown>) {
    actionBusy.value = true; error.value = ''
    try { await work() } catch (failure) { error.value = failure instanceof Error ? failure.message : t('album.failed') }
    finally { actionBusy.value = false }
}
function cleanup() { imageController?.abort(); if (image.value) URL.revokeObjectURL(image.value); image.value = ''; imageError.value = '' }
onUnmounted(cleanup)
async function inspect(item: AlbumItem) {
    cleanup(); selected.value = item
    chartId.value = item.candidate?.chartId || charts[0]?.chartId || ''
    score.value = item.candidate?.score ?? 0
    fc.value = item.candidate?.fc ?? false; ap.value = item.candidate?.ap ?? false
    chain.value = item.candidate?.maxChain?.toString() ?? ''
    const time = item.candidate?.updatedAt ?? item.capturedAt
    playedAt.value = time && Number.isFinite(new Date(time).getTime()) ? new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 19) : ''
    await updateProtection()
    const current = new AbortController(); imageController = current
    try {
        const blob = await preview(item, AbortSignal.any([current.signal, AbortSignal.timeout(45000)]))
        if (!current.signal.aborted) image.value = URL.createObjectURL(blob)
    } catch (failure) { if (!current.signal.aborted) imageError.value = failure instanceof Error ? failure.message : t('album.imageUnavailable') }
}
async function updateProtection() { protection.value = (await database.chartProtections.get(chartId.value))?.updatedAt ?? 0 }
async function commit() {
    if (!selected.value || !props.canWrite) return
    const chart = charts.find(row => row.chartId === chartId.value)
    if (!chart) throw new Error(t('album.invalidChart'))
    await confirm(selected.value, { songId: chart.songId, chartId: chart.chartId, score: Number(score.value), fc: fc.value || ap.value, ap: ap.value, maxChain: chain.value === '' ? undefined : Number(chain.value), updatedAt: new Date(playedAt.value).getTime() }, protection.value)
    selected.value = undefined; cleanup()
}
</script>
<template>
    <section class="panel settings-panel album-panel">
        <div class="section-title between"><h2>{{ t('album.title') }}</h2><button class="button secondary" :disabled="actionBusy" @click="opened = !opened; if (opened) run(refreshBinding)">{{ opened ? t('album.collapse') : t('album.open') }}</button></div>
        <template v-if="opened">
            <p>{{ t('album.description') }}</p>
            <p v-if="!album.configured" role="status">{{ t('album.notConfigured') }}</p>
            <p v-if="album.state.accountId">{{ t('album.bound', { name: album.binding?.nickname || album.state.accountId }) }}</p>
            <div class="album-actions">
                <button v-if="album.state.accountId" class="button primary" :disabled="album.busy || actionBusy || !canWrite || !album.configured" @click="scan()">{{ t('album.read') }}</button>
                <button v-if="album.busy" class="button secondary" @click="cancel">{{ t('common.cancel') }}</button>
                <button v-if="album.state.accountId" class="button secondary" :disabled="actionBusy" @click="run(async () => { await unbind(); selected = undefined; cleanup() })">{{ t('album.unbind') }}</button>
            </div>
            <details v-if="album.configured" class="album-binding">
                <summary>{{ t('album.bind') }}</summary>
                <p>{{ t('album.disclosure') }}</p>
                <label><input v-model="consent" type="checkbox" /> {{ t('album.consent') }}</label>
                <button class="button secondary" :disabled="!consent || actionBusy || album.busy" @click="run(async () => { authUrl = (await beginBinding()).url })">{{ t('album.authorize') }}</button>
                <template v-if="authUrl">
                    <a :href="authUrl" target="_blank" rel="noopener noreferrer">{{ t('album.authorizeLink') }}</a>
                    <p>{{ t('album.callbackHelp') }}</p>
                    <label>{{ t('album.callback') }}<textarea v-model="callback" autocomplete="off" spellcheck="false" /></label>
                    <button class="button primary" :disabled="!callback || !consent || actionBusy" @click="run(async () => { const value = callback; callback = ''; await finishBinding(value); authUrl = '' })">{{ t('album.finishBind') }}</button>
                </template>
            </details>
            <p class="muted">{{ t('album.lastCheck') }} {{ date(album.state.lastCheckedAt) }} · {{ t('album.lastImport') }} {{ date(album.state.lastImportedAt) }}</p>
            <p v-if="album.busy" role="status">{{ t('album.working') }} {{ album.current }}</p>
            <p v-if="album.message" role="status">{{ album.message }}</p>
            <p v-if="error || album.error" role="alert" class="error">{{ error || album.error }}</p>
            <h3>{{ t('album.pending', { count: pending.length }) }}</h3>
            <ul class="album-items">
                <li v-for="item in pending" :key="item.mediaId">
                    <span>{{ date(item.capturedAt) }} · {{ t(`album.stages.${item.stage}`) }}</span>
                    <small v-if="item.reason">{{ item.reason }}</small>
                    <div class="album-actions">
                        <button v-if="item.stage === 'needs_review'" class="button secondary" :disabled="actionBusy || album.busy" @click="run(() => inspect(item))">{{ t('album.review') }}</button>
                        <button v-if="['failed', 'retry_wait', 'canceled', 'rejected'].includes(item.stage)" class="button secondary" :disabled="actionBusy || album.busy" @click="run(() => retry(item))">{{ t('album.retry') }}</button>
                        <button v-if="item.stage === 'needs_review'" class="button secondary" :disabled="actionBusy || album.busy" @click="run(() => reject(item))">{{ t('album.reject') }}</button>
                    </div>
                </li>
            </ul>
            <form v-if="selected" class="album-review" @submit.prevent="run(commit)">
                <h3>{{ t('album.review') }}</h3>
                <img v-if="image" :src="image" :alt="t('album.original')" />
                <p v-if="imageError" role="status">{{ imageError }}</p>
                <label>{{ t('album.chart') }}<select v-model="chartId" @change="updateProtection"><option v-for="row in charts" :key="row.chartId" :value="row.chartId">{{ row.title[songLanguage] || row.title.ja }} · {{ row.chart.mode }} {{ row.chart.difficulty }} {{ row.chart.level }}</option></select></label>
                <label>Score<input v-model.number="score" type="number" min="0" max="1050000" required step="1" /></label>
                <label>{{ t('album.captureTime') }}<input v-model="playedAt" type="datetime-local" step="1" required /></label>
                <div class="album-actions"><label><input v-model="fc" type="checkbox" :disabled="ap" /> FC</label><label><input v-model="ap" type="checkbox" /> AP</label></div>
                <label>Max Chain<input v-model="chain" type="number" min="0" step="1" /></label>
                <p v-if="protection" class="error">{{ t('album.protectionNotice') }}</p>
                <details v-if="selected.evidence?.length"><summary>{{ t('album.evidence') }}</summary><pre>{{ selected.evidence.join('\n') }}</pre></details>
                <div class="album-actions"><button type="submit" class="button primary" :disabled="actionBusy || !canWrite">{{ t('album.confirm') }}</button><button type="button" class="button secondary" @click="selected = undefined; cleanup()">{{ t('common.cancel') }}</button></div>
            </form>
            <p class="muted">{{ t('album.phase') }} <a href="https://github.com/himemiyatori/gcfp-b30" target="_blank" rel="noopener noreferrer">{{ t('album.source') }}</a></p>
        </template>
    </section>
</template>
<style scoped>
.album-panel { margin-top: 20px; padding: 24px; }
.album-panel p { line-height: 1.7; overflow-wrap: anywhere; }
.album-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
.album-binding { margin: 18px 0; }
.album-binding label, .album-review > label { display: grid; gap: 8px; margin: 12px 0; }
.album-binding > label { display: flex; }
textarea, select, input[type=number], input[type=datetime-local] { width: 100%; min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: inherit; font: inherit; }
.album-items { padding: 0; list-style: none; max-height: 440px; overflow: auto; }
.album-items li { padding: 12px 0; border-bottom: 1px solid var(--border); }
.album-items small { display: block; overflow-wrap: anywhere; }
.album-review { max-width: 760px; margin: 20px auto; }
.album-review img { width: 100%; border-radius: 8px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
summary { cursor: pointer; }
</style>
