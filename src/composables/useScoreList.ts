import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { liveQuery } from 'dexie'
import { scoreRepository } from '../db/scoreRepository'
import type { ScoreRecord, ScoreRow } from '../db/models'
import { getScoreRow } from '../core/score/display'
import { songLanguage } from './useSettings'
import { database, databaseReady } from '../db/database'
import { t } from '../i18n'
export function useScoreList() {
    const records = shallowRef<ScoreRecord[]>([]), errorKey = ref(''), loading = ref(true)
    const error = computed(() => errorKey.value && t(errorKey.value))
    const historyCount = ref(0)
    let subscriptions: { unsubscribe(): void }[] = []
    let revision = 0
    let disposed = false
    async function reload() {
        const current = ++revision
        loading.value = true; errorKey.value = ''
        subscriptions.forEach(subscription => subscription.unsubscribe())
        subscriptions = []
        try {
            await databaseReady
            await scoreRepository.initialize()
            if (disposed || current !== revision) return
            const ready = { scores: false, count: false }
            const loaded = (key: keyof typeof ready) => {
                ready[key] = true
                loading.value = !errorKey.value && (!ready.scores || !ready.count)
            }
            const failed = () => { errorKey.value = 'errors.readScores'; loading.value = false }
            subscriptions = [
                liveQuery(async () => scoreRepository.list()).subscribe({
                    next: value => { records.value = value; loaded('scores') },
                    error: failed,
                }),
                liveQuery(async () => database.scoreHistory.count()).subscribe({
                    next: value => { historyCount.value = value; loaded('count') },
                    error: failed,
                }),
            ]
        } catch {
            if (disposed || current !== revision) return
            errorKey.value = 'errors.initialize'
            loading.value = false
        }
    }
    onMounted(reload)
    onUnmounted(() => { disposed = true; subscriptions.forEach(subscription => subscription.unsubscribe()) })
    const scores = computed<ScoreRow[]>(() => records.value.map(record => getScoreRow(record, songLanguage.value)))
    return { scores, historyCount, error, loading, reload }
}
