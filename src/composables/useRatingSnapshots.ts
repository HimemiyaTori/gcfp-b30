import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { liveQuery } from 'dexie'
import { scoreRepository } from '../db/scoreRepository'
import type { RatingSnapshot } from '../db/models'
import { t } from '../i18n'

export function useRatingSnapshots() {
    const snapshots = shallowRef<RatingSnapshot[]>([])
    const failed = ref(false), loading = ref(true)
    const error = computed(() => failed.value ? t('errors.readTrend') : '')
    let subscription: { unsubscribe(): void } | undefined
    function reload() {
        subscription?.unsubscribe()
        failed.value = false
        loading.value = true
        subscription = liveQuery(async () => scoreRepository.snapshots()).subscribe({
            next: value => { snapshots.value = value; loading.value = false },
            error: () => { failed.value = true; loading.value = false },
        })
    }
    onMounted(reload)
    onUnmounted(() => subscription?.unsubscribe())
    return { snapshots, error, loading, reload }
}
