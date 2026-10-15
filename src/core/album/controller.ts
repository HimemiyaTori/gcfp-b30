import { reactive } from 'vue'
import { liveQuery } from 'dexie'
import { database } from '../../db/database'
import { initialAlbumState, type AlbumItem, type AlbumState } from '../../db/albumModels'
import { scoreRepository } from '../../db/scoreRepository'
import { createPreviewUrl, releasePreviews } from '../ocr/preview'
import { createSharedRecognizer } from '../ocr/shared'
import { AlbumError, credentialLock, download, request, type AlbumMedia, type Binding, type MediaResponse } from './api'
import { currentLanguage, t } from '../../i18n'
import type { ImportJob } from '../../composables/useOcrImport'
const MARKER = 'groove-nintendo-bound'
// 打开网页时距上次更新不足 3 分钟不自动更新，任意两次更新至少间隔 10 秒
export const AUTO_UPDATE_INTERVAL = 3 * 60000
export const UPDATE_COOLDOWN = 10000
const finished = new Set(['imported', 'skipped', 'rejected', 'expired', 'failed'])
export const retryable = new Set(['failed', 'retry_wait', 'canceled'])
export interface AlbumJob extends ImportJob { mediaId: string }
export interface AlbumRun { id: number; manual: boolean; checked: boolean; found: number; recorded: number; updated: number; failed: number; skipped: number; canceled: boolean; error?: string }
export const album = reactive({
    configured: undefined as boolean | undefined,
    state: initialAlbumState(),
    items: [] as AlbumItem[],
    importedCount: 0,
    busy: false,
    manual: false,
    phase: 'idle' as 'idle' | 'checking' | 'importing',
    jobs: [] as AlbumJob[],
    slow: false,
    previewing: false,
    error: '',
    run: undefined as AlbumRun | undefined,
})
// 自动更新时可预期的跳过原因，仅手动更新时提示
class ScanSkipped extends Error {}
let aborter: AbortController | undefined
let active: AlbumState | undefined
let canceled = false
let started = false
let runs = 0
function marker(value: boolean) { try { if (value) localStorage.setItem(MARKER, '1'); else localStorage.removeItem(MARKER) } catch {} }
async function localBinding(binding: Omit<Binding, 'configured'> & { configured?: boolean }) {
    await database.transaction('rw', database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        const changed = state.accountId !== binding.accountId || state.bindingId !== binding.bindingId
        // 换绑或解绑后清除旧账号的更新记录，新绑定可立即更新
        await database.albumState.put(changed
            ? { ...state, accountId: binding.accountId, bindingId: binding.bindingId, nickname: binding.nickname, avatarUrl: binding.avatarUrl, bindingGeneration: state.bindingGeneration + 1, nextAllowedAt: 0, lastCheckedAt: undefined, lastImportedAt: undefined, mediaCount: undefined }
            : { ...state, nickname: binding.nickname, avatarUrl: binding.avatarUrl })
    })
    if (binding.configured !== undefined) album.configured = binding.configured
    marker(binding.status === 'active')
}
export async function refreshBinding() {
    return credentialLock(async () => {
        const binding = await request<Binding>('nintendo/binding')
        await localBinding(binding)
        return binding
    })
}
export async function beginBinding() {
    return credentialLock(() => request<{ url: string }>('nintendo/auth/start', 'POST', { consent: true }))
}
export async function finishBinding(callback: string) {
    aborter?.abort()
    const binding = await credentialLock(async () => {
        const binding = await request<Binding>('nintendo/auth/complete', 'POST', { callback })
        await localBinding(binding)
        return binding
    })
    album.error = ''
    return binding
}
export async function unbind() {
    aborter?.abort()
    await credentialLock(async () => {
        await request('nintendo/binding', 'DELETE')
        await localBinding({ status: 'unbound' })
    })
    album.error = ''
}
function valid(item: AlbumItem, state: AlbumState) { return item.accountId === state.accountId && item.datasetEpoch === state.datasetEpoch && item.bindingGeneration === state.bindingGeneration }
async function save(item: AlbumItem) {
    await database.transaction('rw', database.albumItems, database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        if (!valid(item, state)) throw new Error(t('album.stale'))
        // 持久化纯数据，避免把 Vue 候选代理对象交给 IndexedDB
        await database.albumItems.put(JSON.parse(JSON.stringify(item)) as AlbumItem)
    })
}
async function recordError(error: unknown) {
    album.error = error instanceof Error ? error.message : t('album.failed')
    if (error instanceof AlbumError && error.code === 'reauth_required') {
        aborter?.abort()
        // 登录失效后清除 Cookie 与本地绑定，由用户重新绑定
        await credentialLock(async () => {
            await request('nintendo/binding', 'DELETE').catch(() => {})
            await localBinding({ status: 'unbound' })
        }).catch(() => {})
        return
    }
    if (error instanceof AlbumError && error.retryAt > Date.now()) await database.transaction('rw', database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        await database.albumState.put({ ...state, nextAllowedAt: Math.max(state.nextAllowedAt, error.retryAt) })
    })
}
function label(time: number | null) {
    return time && Number.isFinite(new Date(time).getTime()) ? new Date(time).toLocaleString(currentLanguage()) : t('album.unknownTime')
}
async function digest(blob: Blob) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
}
async function fetchMedia(manual: boolean, signal: AbortSignal) {
    const state = await database.transaction('rw', database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        const now = Date.now()
        if (!state.accountId) throw new ScanSkipped(t('album.bindFirst'))
        if (!manual && now - (state.lastCheckedAt ?? 0) < AUTO_UPDATE_INTERVAL) throw new ScanSkipped('')
        if (state.nextAllowedAt > now) throw new ScanSkipped(t('album.cooldown', { seconds: Math.ceil((state.nextAllowedAt - now) / 1000) }))
        const next = { ...state, nextAllowedAt: now + UPDATE_COOLDOWN }
        await database.albumState.put(next)
        return next
    })
    signal.throwIfAborted()
    const result = await request<MediaResponse>('album/media', 'POST', {})
    if (result.accountId !== state.accountId || result.bindingId !== state.bindingId) throw new Error(t('album.stale'))
    await database.transaction('rw', database.albumState, async () => {
        const latest = await database.albumState.get('album')
        if (!latest || latest.datasetEpoch !== state.datasetEpoch || latest.bindingGeneration !== state.bindingGeneration) throw new Error(t('album.stale'))
        await database.albumState.put({ ...latest, avatarUrl: result.avatarUrl ?? latest.avatarUrl, lastCheckedAt: Date.now(), mediaCount: result.media.length })
    })
    return { result, state }
}
async function collect(result: MediaResponse, state: AlbumState) {
    const now = Date.now()
    const visible = new Set(result.media.map(media => media.mediaId))
    const known = new Map((await database.albumItems.where('accountId').equals(state.accountId!).toArray()).map(item => [item.mediaId, item]))
    const queue: AlbumItem[] = []
    // 清空成绩前的截图不再录入；重新绑定后接着处理旧绑定未完成的截图
    const pick = (item: AlbumItem) => {
        if (item.datasetEpoch !== state.datasetEpoch || finished.has(item.stage)) return
        if (item.bindingGeneration !== state.bindingGeneration) queue.push({ ...item, bindingGeneration: state.bindingGeneration, stage: item.candidate ? 'pending_commit' : 'discovered', attempts: 0, retryAt: 0 })
        else if (!visible.has(item.mediaId) || (item.retryAt ?? 0) <= now) queue.push(item)
    }
    for (const media of [...result.media].sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))) {
        const item = known.get(media.mediaId)
        if (item) pick(item)
        else queue.push({ accountId: state.accountId!, mediaId: media.mediaId, applicationId: media.applicationId, capturedAt: media.capturedAt, datasetEpoch: state.datasetEpoch, bindingGeneration: state.bindingGeneration, stage: 'discovered', attempts: 0, recognitionVersion: '3a-1' })
    }
    // 已识别的截图即使从云端消失也继续入库，其余未完成的记录标记原图过期
    for (const item of known.values()) {
        if (visible.has(item.mediaId) || item.datasetEpoch !== state.datasetEpoch || finished.has(item.stage)) continue
        if (item.candidate) pick(item)
        else await save({ ...item, bindingGeneration: state.bindingGeneration, stage: 'expired', reason: t('album.imageUnavailable') })
    }
    return queue
}
async function importQueue(queue: AlbumItem[], visible: AlbumMedia[], state: AlbumState, controller: AbortController, tally: { recorded: number; updated: number }) {
    let media = new Map(visible.map(row => [row.mediaId, row]))
    const timeout = () => AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])
    let recognizer = createSharedRecognizer(undefined, { onSlowInference: () => { album.slow = true } })
    for (let index = 0; index < queue.length; index++) {
        if (controller.signal.aborted) break
        const job = album.jobs[index]!
        let item = queue[index]!
        job.status = 'running'
        try {
            if (item.candidate) {
                item = { ...item, stage: 'pending_commit' }
                await save(item)
            } else {
                item = { ...item, stage: 'downloading' }
                await save(item)
                let source = media.get(item.mediaId)
                let blob: Blob | undefined
                try {
                    if (source) blob = await download(source, timeout())
                } catch (error) {
                    if (!(error instanceof AlbumError) || !['ticket_expired', 'media_expired'].includes(error.code)) throw error
                    // 下载地址失效时刷新列表，后续截图沿用新的下载地址
                    const refreshed = await credentialLock(() => request<MediaResponse>('album/media', 'POST', {}))
                    if (refreshed.accountId !== state.accountId || refreshed.bindingId !== state.bindingId) throw new Error(t('album.stale'))
                    media = new Map(refreshed.media.map(row => [row.mediaId, row]))
                    source = media.get(item.mediaId)
                    if (source) blob = await download(source, timeout())
                }
                if (!blob) {
                    await save({ ...item, stage: 'expired', reason: t('album.imageUnavailable') })
                    Object.assign(job, { status: 'skipped', error: t('album.imageUnavailable') })
                    continue
                }
                if (album.previewing) {
                    try {
                        const preview = await createPreviewUrl(blob)
                        if (controller.signal.aborted || !album.previewing) URL.revokeObjectURL(preview)
                        else job.preview = preview
                    } catch {
                        // 预览失败不阻断识别
                    }
                }
                item = { ...item, contentHash: await digest(blob) }
                const duplicates = await database.albumItems.where('[accountId+contentHash]').equals([item.accountId, item.contentHash!]).toArray()
                if (duplicates.some(other => other.mediaId !== item.mediaId && ['imported', 'skipped'].includes(other.stage))) {
                    await save({ ...item, stage: 'skipped', reason: t('album.duplicate') })
                    Object.assign(job, { status: 'skipped', error: t('album.duplicate') })
                    continue
                }
                item = { ...item, stage: 'recognizing' }
                await save(item)
                if (recognizer.disposed) recognizer = createSharedRecognizer(undefined, { onSlowInference: () => { album.slow = true } })
                const result = await recognizer.recognize(blob, controller.signal)
                controller.signal.throwIfAborted()
                if (result.kind === 'skipped') {
                    await save({ ...item, stage: 'skipped', reason: result.reason })
                    Object.assign(job, { status: 'skipped', error: result.reason })
                    continue
                }
                const time = item.capturedAt
                const timeValid = Number.isSafeInteger(time) && time! >= Date.UTC(2017, 0, 1) && time! <= Date.now() + 86400000
                // 拍摄时间缺失或异常时与首页录入一致，按录入时间记录
                item = { ...item, stage: 'pending_commit', reason: undefined, candidate: { songId: result.songId, chartId: result.chartId, score: result.score, ...result.achievements, updatedAt: timeValid ? time! : Date.now() } }
                await save(item)
            }
            const saved = await scoreRepository.commitAlbum(item.accountId, item.mediaId, item.candidate!)
            tally.recorded += Number(saved.recorded)
            tally.updated += Number(saved.updated)
            Object.assign(job, saved.recorded ? { status: 'success', error: '' } : { status: 'skipped', error: t('ocr.errors.recentDuplicate') })
        } catch (error) {
            if (controller.signal.aborted) {
                if (canceled) await save({ ...item, stage: 'canceled' }).catch(() => {})
                break
            }
            if (error instanceof AlbumError && error.code === 'rate_limited') await save({ ...item, stage: 'retry_wait', retryAt: Math.max(Date.now() + 60000, error.retryAt) }).catch(() => {})
            if ((error instanceof AlbumError && ['rate_limited', 'reauth_required'].includes(error.code)) || (error instanceof Error && error.message === t('album.stale'))) throw error
            const attempts = item.attempts + 1
            const temporary = error instanceof AlbumError ? ['download_failed', 'upstream_unavailable', 'network_error'].includes(error.code) : error instanceof Error && error.message === t('ocr.errors.timeout')
            const reason = error instanceof Error ? error.message : t('album.failed')
            await save({ ...item, attempts, reason, stage: temporary && attempts <= 2 ? 'retry_wait' : 'failed', retryAt: Date.now() + (attempts === 1 ? 60000 : 300000) }).catch(() => {})
            Object.assign(job, { status: 'failed', error: reason })
        }
    }
}
export async function scan(manual = false) {
    if (album.busy) return
    album.busy = true
    album.manual = manual
    album.phase = 'checking'
    releasePreviews(album.jobs)
    album.jobs = []
    album.slow = false
    album.error = ''
    canceled = false
    const controller = new AbortController()
    aborter = controller
    const tally = { recorded: 0, updated: 0 }
    let checked = false
    let failure: string | undefined
    try {
        if (!navigator.locks) throw new Error(t('album.locksRequired'))
        await navigator.locks.request('groove-nintendo-scan', { ifAvailable: true }, async lock => {
            if (!lock) throw new ScanSkipped(t('album.otherTab'))
            const { result, state } = await credentialLock(() => fetchMedia(manual, controller.signal))
            active = state
            const queue = await collect(result, state)
            checked = true
            album.jobs = queue.map((item, index): AlbumJob => ({ mediaId: item.mediaId, name: label(item.capturedAt), index: index + 1, status: 'queued', error: '' }))
            if (!queue.length) return
            album.phase = 'importing'
            await importQueue(queue, result.media, state, controller, tally)
        })
    } catch (error) {
        if (!controller.signal.aborted && !(error instanceof ScanSkipped && !manual)) {
            await recordError(error)
            failure = album.error
        }
    } finally {
        if (aborter === controller) aborter = undefined
        active = undefined
        for (const job of album.jobs) if (job.status === 'queued' || job.status === 'running') Object.assign(job, { status: 'skipped', error: t('album.deferred') })
        const count = (status: ImportJob['status']) => album.jobs.filter(job => job.status === status).length
        album.run = { id: ++runs, manual, checked, found: album.jobs.length, ...tally, failed: count('failed'), skipped: count('skipped'), canceled: canceled && controller.signal.aborted, error: failure }
        album.busy = false
        album.phase = 'idle'
    }
}
export function cancel() { canceled = true; aborter?.abort() }
export async function retryFailed() {
    await database.transaction('rw', database.albumItems, database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        if (!state.accountId) return
        for (const item of await database.albumItems.where('accountId').equals(state.accountId).toArray())
            if (item.datasetEpoch === state.datasetEpoch && retryable.has(item.stage))
                await database.albumItems.put({ ...item, bindingGeneration: state.bindingGeneration, attempts: 0, retryAt: 0, reason: undefined, stage: item.candidate ? 'pending_commit' : 'discovered' })
    })
    await scan(true)
}
function whenVisible(work: () => void) {
    if (document.visibilityState === 'visible') return work()
    const listener = () => {
        if (document.visibilityState !== 'visible') return
        document.removeEventListener('visibilitychange', listener)
        work()
    }
    document.addEventListener('visibilitychange', listener)
}
export function initializeAlbum() {
    if (started) return
    started = true
    liveQuery(async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        return {
            state,
            items: state.accountId ? await database.albumItems.where('accountId').equals(state.accountId).toArray() : [],
            imported: await database.scoreHistory.filter(row => row.source === 'nso_ocr').count(),
        }
    }).subscribe({
        next: ({ state, items, imported }) => {
            // 其他标签页清空成绩或换绑后停止当前批次
            if (active && (state.datasetEpoch !== active.datasetEpoch || state.bindingGeneration !== active.bindingGeneration)) aborter?.abort()
            album.state = state
            album.items = items
            album.importedCount = imported
        },
        error: () => { album.error = t('album.failed') },
    })
    let bound = false
    try { bound = localStorage.getItem(MARKER) === '1' } catch {}
    if (bound) void refreshBinding().then(() => whenVisible(() => void scan())).catch(recordError)
}
