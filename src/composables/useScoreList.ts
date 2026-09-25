import { computed, onMounted, onUnmounted, ref } from 'vue'
import { liveQuery } from 'dexie'
import { scoreRepository } from '../db/scoreRepository'
import type { ScoreRecord, ScoreRow } from '../db/models'
import { songService, getSongTitle, getSongArtist, formatLevel } from '../core/song/songService'
import { songLanguage } from './useSettings'
export function useScoreList() {
    const records = ref<ScoreRecord[]>([]), error = ref(''), loading = ref(true)
    let subscription: { unsubscribe(): void } | undefined
    let disposed = false
    async function reload() {
        loading.value = true; error.value = ''; subscription?.unsubscribe()
        try {
            await scoreRepository.initialize()
            if (disposed) return
            subscription = liveQuery(() => scoreRepository.list()).subscribe({
                next: value => { records.value = value; loading.value = false; error.value = '' },
                error: () => { error.value = '无法读取本地成绩，请检查浏览器存储权限后重试。'; loading.value = false },
            })
        } catch {
            error.value = '数据库初始化或曲库版本重算失败，原有数据已保留。请检查浏览器存储权限或曲库后重试。'
            loading.value = false
        }
    }
    onMounted(reload)
    onUnmounted(() => { disposed = true; subscription?.unsubscribe() })
    const scores = computed<ScoreRow[]>(() => records.value.map(record => {
        const { song, chart } = songService.getChart(record.songId, record.chartId)
        return { ...record, id: record.id!, ja: getSongTitle(song, 'ja'), en: getSongTitle(song, 'en'), artist: getSongArtist(song, songLanguage.value), category: song.genre, difficulty: chart.difficulty.toUpperCase(), mode: chart.mode.toUpperCase(), level: formatLevel(chart.level), coverSourceUrl: song.coverSourceUrl }
    }))
    return { scores, error, loading, reload }
}
