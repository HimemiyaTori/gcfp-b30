import { computed, onMounted, onUnmounted, ref } from 'vue'
import { liveQuery } from 'dexie'
import { scoreRepository } from '../db/scoreRepository'
import type { ScoreRecord, ScoreRow, RatingSnapshot } from '../db/models'
import { getScoreRow } from '../core/score/display'
import { songLanguage } from './useSettings'
import { database } from '../db/database'
export function useScoreList() {
    const records = ref<ScoreRecord[]>([]), error = ref(''), loading = ref(true)
    const historyCount = ref(0), snapshots = ref<RatingSnapshot[]>([])
    let subscription: { unsubscribe(): void } | undefined
    let disposed = false
    async function reload() {
        loading.value = true; error.value = ''; subscription?.unsubscribe()
        try {
            await scoreRepository.initialize()
            if (disposed) return
            subscription = liveQuery(() => database.transaction('r', [database.scores, database.scoreHistory, database.ratingSnapshots], async () => ({ records: await scoreRepository.list(), count: await database.scoreHistory.count(), snapshots: await scoreRepository.snapshots() }))).subscribe({
                next: value => { records.value = value.records; historyCount.value = value.count; snapshots.value = value.snapshots; loading.value = false; error.value = '' },
                error: () => { error.value = '无法读取本地成绩，请检查浏览器存储权限后重试。'; loading.value = false },
            })
        } catch {
            error.value = '数据库初始化或曲库版本重算失败，原有数据已保留。请检查浏览器存储权限或曲库后重试。'
            loading.value = false
        }
    }
    onMounted(reload)
    onUnmounted(() => { disposed = true; subscription?.unsubscribe() })
    const scores = computed<ScoreRow[]>(() => records.value.map(record => getScoreRow(record, songLanguage.value)))
    return { scores, historyCount, snapshots, error, loading, reload }
}
