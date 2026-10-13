import { reactive } from 'vue'
import { liveQuery } from 'dexie'
import { database } from '../../db/database'
import { initialAlbumState, type AlbumItem, type AlbumState } from '../../db/albumModels'
import { scoreRepository } from '../../db/scoreRepository'
import { createSharedRecognizer } from '../ocr/shared'
import { AlbumError, credentialLock, download, request, type Binding, type MediaResponse } from './api'
import { t } from '../../i18n'
import type { ImportedScore } from '../score/import'
const MARKER = 'groove-nintendo-bound'
const terminal = new Set(['imported', 'skipped', 'rejected', 'expired', 'canceled', 'failed', 'needs_review'])
export const album = reactive({ binding: undefined as Binding | undefined, items: [] as AlbumItem[], state: initialAlbumState(), busy: false, message: '', error: '', current: '', configured: false })
let aborter: AbortController | undefined
let started = false
function marker(value: boolean) { try { if (value) localStorage.setItem(MARKER, '1'); else localStorage.removeItem(MARKER) } catch {} }
async function localBinding(binding: Binding) {
    await database.transaction('rw', database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        const changed = state.accountId !== binding.accountId || state.bindingId !== binding.bindingId
        await database.albumState.put({ ...state, accountId: binding.accountId, bindingId: binding.bindingId, bindingGeneration: state.bindingGeneration + Number(changed), nextAllowedAt: changed ? 0 : state.nextAllowedAt })
    })
    album.binding = binding
    album.configured = binding.configured
    marker(binding.status === 'active')
}
export async function refreshBinding() {
    await credentialLock(async () => { await localBinding(await request<Binding>('nintendo/binding')) })
}
export async function beginBinding() {
    return credentialLock(() => request<{ url: string }>('nintendo/auth/start', 'POST', { consent: true }))
}
export async function finishBinding(callback: string) {
    aborter?.abort()
    await credentialLock(async () => { await localBinding(await request<Binding>('nintendo/auth/complete', 'POST', { callback })) })
}
export async function unbind() {
    aborter?.abort()
    await credentialLock(async () => {
        await request('nintendo/binding', 'DELETE')
        await localBinding({ status: 'unbound', configured: album.configured })
    })
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
    if (error instanceof AlbumError && error.code === 'reauth_required') { marker(false); album.binding = undefined; aborter?.abort() }
    if (error instanceof AlbumError && error.retryAt > Date.now()) await database.transaction('rw', database.albumState, async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        await database.albumState.put({ ...state, nextAllowedAt: Math.max(state.nextAllowedAt, error.retryAt) })
    })
}
export async function scan(resume = false) {
    if (album.busy) return
    album.busy = true; album.error = ''; album.message = ''
    const controller = new AbortController()
    aborter = controller
    let explicitCancel = false
    controller.signal.addEventListener('abort', () => { explicitCancel = document.visibilityState === 'visible' })
    try {
        if (!navigator.locks) throw new Error(t('album.locksRequired'))
        await navigator.locks.request('groove-nintendo-scan', { ifAvailable: true }, async lock => {
            if (!lock) throw new Error(t('album.otherTab'))
            const batch = await credentialLock(async () => {
                const state = await database.albumState.get('album') ?? initialAlbumState()
                if (!state.accountId) throw new Error(t('album.bindFirst'))
                if (state.nextAllowedAt > Date.now()) throw new Error(t('album.cooldown', { seconds: Math.ceil((state.nextAllowedAt - Date.now()) / 1000) }))
                controller.signal.throwIfAborted()
                const result = await request<MediaResponse>('album/media', 'POST', {})
                if (result.accountId !== state.accountId || result.bindingId !== state.bindingId) throw new Error(t('album.stale'))
                await database.transaction('rw', database.albumState, async () => {
                    const latest = await database.albumState.get('album')
                    if (!latest || latest.datasetEpoch !== state.datasetEpoch || latest.bindingGeneration !== state.bindingGeneration) throw new Error(t('album.stale'))
                    await database.albumState.put({ ...latest, lastCheckedAt: Date.now(), nextAllowedAt: Date.now() + 60000 })
                })
                return { result, state }
            })
            const known = await database.albumItems.where('accountId').equals(batch.state.accountId!).toArray()
            const present = new Set(batch.result.media.map(media => media.mediaId))
            for (const item of known) if (!present.has(item.mediaId) && !terminal.has(item.stage) && valid(item, batch.state)) await save({ ...item, stage: item.candidate ? 'needs_review' : 'expired' })
            if (!resume) {
                for (const media of batch.result.media) {
                    if (known.some(item => item.mediaId === media.mediaId)) continue
                    await save({ accountId: batch.state.accountId!, mediaId: media.mediaId, applicationId: media.applicationId, capturedAt: media.capturedAt, datasetEpoch: batch.state.datasetEpoch, bindingGeneration: batch.state.bindingGeneration, stage: 'discovered', attempts: 0, recognitionVersion: '3a-1' })
                }
            }
            let recognizer = createSharedRecognizer((_area, text) => evidence.push(text))
            let evidence: string[] = []
            let found = 0
            for (const media of batch.result.media.sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))) {
                if (controller.signal.aborted || document.visibilityState !== 'visible') break
                let item = await database.albumItems.get([batch.state.accountId!, media.mediaId])
                if (item && (terminal.has(item.stage) || !valid(item, batch.state) || (item.retryAt ?? 0) > Date.now())) continue
                if (!item && resume) continue
                item ??= { accountId: batch.state.accountId!, mediaId: media.mediaId, applicationId: media.applicationId, capturedAt: media.capturedAt, datasetEpoch: batch.state.datasetEpoch, bindingGeneration: batch.state.bindingGeneration, stage: 'discovered', attempts: 0, recognitionVersion: '3a-1' }
                if (item.candidate) { await save({ ...item, stage: 'needs_review' }); continue }
                found++
                album.current = media.mediaId
                try {
                    item.stage = 'downloading'; await save(item)
                    let blob: Blob
                    try { blob = await download(media, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])) }
                    catch (error) {
                        if (!(error instanceof AlbumError) || !['ticket_expired', 'media_expired'].includes(error.code)) throw error
                        // 下载地址失效时仅刷新一次列表，仍不可见则停止重试
                        const refreshed = await credentialLock(() => request<MediaResponse>('album/media', 'POST', {}))
                        if (refreshed.accountId !== item.accountId || refreshed.bindingId !== batch.state.bindingId) throw new Error(t('album.stale'))
                        const freshMedia = refreshed.media.find(row => row.mediaId === item!.mediaId)
                        if (!freshMedia) { await save({ ...item, stage: 'expired', reason: t('album.imageUnavailable') }); continue }
                        blob = await download(freshMedia, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]))
                    }
                    item.contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
                    const duplicates = await database.albumItems.where('[accountId+contentHash]').equals([item.accountId, item.contentHash]).toArray()
                    if (duplicates.some(other => other.mediaId !== item!.mediaId && ['imported', 'skipped'].includes(other.stage))) { await save({ ...item, stage: 'skipped', reason: t('album.duplicate') }); continue }
                    item.stage = 'recognizing'; await save(item)
                    evidence = []
                    if (recognizer.disposed) recognizer = createSharedRecognizer((_area, text) => evidence.push(text))
                    const result = await recognizer.recognize(blob, controller.signal)
                    controller.signal.throwIfAborted()
                    if (result.kind === 'skipped') await save({ ...item, stage: 'skipped', reason: result.reason })
                    else {
                        const timeValid = Number.isSafeInteger(item.capturedAt) && item.capturedAt! >= Date.UTC(2017, 0, 1) && item.capturedAt! <= Date.now() + 86400000
                        await save({ ...item, stage: 'needs_review', evidence, candidate: { songId: result.songId, chartId: result.chartId, score: result.score, ...result.achievements, updatedAt: timeValid ? item.capturedAt! : undefined }, reason: timeValid ? undefined : t('album.invalidTime') })
                    }
                } catch (error) {
                    if (controller.signal.aborted) {
                        if (explicitCancel) await save({ ...item, stage: 'canceled' }).catch(() => {})
                        break
                    }
                    const attempts = item.attempts + 1
                    const temporary = error instanceof AlbumError ? ['download_failed', 'upstream_unavailable', 'rate_limited'].includes(error.code) : error instanceof Error && error.message === t('ocr.errors.timeout')
                    await save({ ...item, evidence, attempts, stage: temporary ? (attempts <= 2 ? 'retry_wait' : 'failed') : item.stage === 'recognizing' ? 'needs_review' : 'failed', retryAt: Math.max(Date.now() + (attempts === 1 ? 60000 : 300000), error instanceof AlbumError ? error.retryAt : 0), reason: error instanceof Error ? error.message : t('album.failed') })
                    if (error instanceof AlbumError && ['rate_limited', 'reauth_required'].includes(error.code)) { await recordError(error); break }
                }
            }
            if (controller.signal.aborted && explicitCancel) {
                const unfinished = await database.albumItems.where('accountId').equals(batch.state.accountId!).toArray()
                for (const item of unfinished) if (present.has(item.mediaId) && !terminal.has(item.stage) && valid(item, batch.state)) await save({ ...item, stage: 'canceled' }).catch(() => {})
            }
            album.message = t('album.scanned', { count: found })
        })
    } catch (error) { if (!controller.signal.aborted) await recordError(error) }
    finally { if (aborter === controller) aborter = undefined; album.busy = false; album.current = '' }
}
export function cancel() { aborter?.abort() }
export async function retry(item: AlbumItem) {
    const state = await database.albumState.get('album') ?? initialAlbumState()
    if (!valid(item, state)) throw new Error(t('album.stale'))
    await save({ ...item, attempts: 0, retryAt: 0, stage: item.candidate ? 'needs_review' : 'discovered', reason: undefined })
    if (!item.candidate) await scan()
}
export async function reject(item: AlbumItem) { await save({ ...item, stage: 'rejected', reason: undefined }) }
export async function confirm(item: AlbumItem, candidate: ImportedScore, protection: number) {
    const result = await scoreRepository.commitAlbum(item.accountId, item.mediaId, candidate, protection)
    album.message = t('album.saved', { recorded: Number(result.recorded), updated: Number(result.updated) })
}
export async function preview(item: AlbumItem, signal: AbortSignal) {
    const state = await database.albumState.get('album') ?? initialAlbumState()
    if (!valid(item, state)) throw new Error(t('album.stale'))
    const result = await credentialLock(() => request<MediaResponse>('album/media', 'POST', {}))
    if (result.accountId !== item.accountId || result.bindingId !== state.bindingId) throw new Error(t('album.stale'))
    const media = result.media.find(row => row.mediaId === item.mediaId)
    if (!media) throw new Error(t('album.imageUnavailable'))
    return download(media, signal)
}
export function initializeAlbum() {
    if (started) return
    started = true
    liveQuery(async () => {
        const state = await database.albumState.get('album') ?? initialAlbumState()
        return { state, items: state.accountId ? await database.albumItems.where('accountId').equals(state.accountId).toArray() : [] }
    }).subscribe({ next: ({ state, items }) => {
        if (state.datasetEpoch !== album.state.datasetEpoch || state.bindingGeneration !== album.state.bindingGeneration) aborter?.abort()
        album.state = state
        album.items = items.sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))
    }, error: () => { album.error = t('album.failed') } })
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') aborter?.abort()
        else if (album.state.accountId && album.items.some(item => !terminal.has(item.stage))) void scan(true)
    })
    let bound = false
    try { bound = localStorage.getItem(MARKER) === '1' } catch {}
    if (bound) void refreshBinding().then(async () => {
        const items = await database.albumItems.toArray()
        if (items.some(item => !terminal.has(item.stage))) await scan(true)
    }).catch(recordError)
}
