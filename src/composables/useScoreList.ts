import { computed, onMounted, onUnmounted, ref } from 'vue'
import { liveQuery } from 'dexie'
import { scoreRepository } from '../db/scoreRepository'
import type { ScoreRecord, ScoreRow, RatingSnapshot } from '../db/models'
import { getScoreRow } from '../core/score/display'
import { songLanguage } from './useSettings'
import { database } from '../db/database'
import { t } from '../i18n'
export function useScoreList() {
    const records = ref<ScoreRecord[]>([]), errorKey = ref(''), loading = ref(true)
    const error = computed(() => errorKey.value && t(errorKey.value))
    const historyCount = ref(0), snapshots = ref<RatingSnapshot[]>([])
    let subscription: { unsubscribe(): void } | undefined
    let disposed = false
    async function reload() {
        loading.value = true; errorKey.value = ''; subscription?.unsubscribe()
        try {
            await scoreRepository.initialize()
            if (disposed) return
            subscription = liveQuery(() => database.transaction('r', [database.scores, database.scoreHistory, database.ratingSnapshots], async () => ({ records: await scoreRepository.list(), count: await database.scoreHistory.count(), snapshots: await scoreRepository.snapshots() }))).subscribe({
                next: value => { records.value = value.records; historyCount.value = value.count; snapshots.value = value.snapshots; loading.value = false; errorKey.value = '' },
                error: () => { errorKey.value = 'errors.readScores'; loading.value = false },
            })
        } catch {
            errorKey.value = 'errors.initialize'
            loading.value = false
        }
    }
    onMounted(reload)
    onUnmounted(() => { disposed = true; subscription?.unsubscribe() })
    const scores = computed<ScoreRow[]>(() => records.value.map(record => getScoreRow(record, songLanguage.value)))
    return { scores, historyCount, snapshots, error, loading, reload }
}
