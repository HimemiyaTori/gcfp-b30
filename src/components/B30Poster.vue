<script setup lang="ts">
import { computed } from 'vue'
import type { getModeB30 } from '../core/rating/calculator'
import { getRankByScore } from '../core/rating/rank'
import { coverThumbUrl } from '../core/song/cover'

const props = defineProps<{
    summary: ReturnType<typeof getModeB30>
    language: 'ja' | 'en'
    generatedAt: string
}>()
const asset = (name: string) => `${import.meta.env.BASE_URL}images/b30/${name}`
const logo = `${import.meta.env.BASE_URL}images/gcfp-logo.png`
const backgrounds: Record<string, string> = { EASY: 'Basic', NORMAL: 'Advance', HARD: 'Expert', MASTER: 'Master' }
const slots = computed(() => Array.from({ length: 30 }, (_, i) => props.summary.items[i]))
const average = computed(() => Math.round(props.summary.items.reduce((sum, item) => sum + item.score, 0) / (props.summary.items.length || 1)).toLocaleString('en-US'))
const rankAsset = (score: number) => {
    const rank = getRankByScore(score)
    return rank === 'E' ? '' : asset(`${rank.toLowerCase().replace('+', 'p')}.webp`)
}
</script>

<template>
    <article class="b30-poster" :class="{ 'poster-advanced': summary.mode === 'ADVANCED' }">
        <header class="poster-header">
            <div class="poster-profile">
                <img class="poster-profile-bg" :src="asset('256001.png')" alt="" />
                <div class="poster-profile-content">
                    <div class="poster-kicker">GROOVE COASTER · FUTURE PERFORMERS</div>
                    <div class="poster-mode">{{ summary.label }} <span>BEST 30</span></div>
                    <div class="poster-rating">Groove Rating <strong>{{ summary.rating.toFixed(2) }}</strong><span>RT</span></div>
                </div>
            </div>
            <img class="poster-logo" :src="logo" alt="Groove Coaster Future Performers" />
        </header>
        <div class="poster-summary">
            <img :src="asset('bg_b30.png')" alt="" />
            <strong>BEST 30</strong>
            <span>Floor <b>{{ summary.floor?.toFixed(2) ?? '—' }}</b></span>
            <span>Avg. Score <b>{{ average }}</b></span>
            <span>{{ summary.items.length }} / 30 CHARTS</span>
        </div>
        <div class="poster-grid">
            <div v-for="(item, index) in slots" :key="index" class="poster-card" :class="item?.difficulty.toLowerCase() ?? 'poster-empty'">
                <template v-if="item">
                    <img class="poster-card-bg" :src="asset(`bg_${backgrounds[item.difficulty] ?? 'Master'}.png`)" alt="" />
                    <div class="poster-cover">
                        <span>♪</span>
                        <img v-if="coverThumbUrl(item.coverSourceUrl)" :src="coverThumbUrl(item.coverSourceUrl)" data-cover alt="" />
                    </div>
                    <div class="poster-card-info">
                        <div class="poster-chart"><span>#{{ index + 1 }}</span><b>{{ item.level }}</b> {{ item.difficulty }}</div>
                        <div class="poster-title">{{ item[language] || item.ja }}</div>
                        <div class="poster-score">{{ item.score.toLocaleString('en-US') }}</div>
                        <div class="poster-chart-rating">{{ item.level }} <span>→</span> <b>{{ item.rating.toFixed(2) }}</b> <small>RT</small></div>
                        <div class="poster-badges">
                            <span class="poster-rank"><span>{{ getRankByScore(item.score) }}</span><img v-if="rankAsset(item.score)" :src="rankAsset(item.score)" :alt="getRankByScore(item.score)" /></span>
                            <span v-if="item.ap" class="poster-ap">ALL PERFECT</span>
                            <span v-else-if="item.fc" class="poster-fc"><span>FULL COMBO</span><img :src="asset('fullcombo.webp')" alt="FULL COMBO" /></span>
                        </div>
                    </div>
                </template>
                <template v-else><span class="poster-empty-number">#{{ index + 1 }}</span><span>NO RECORD</span></template>
            </div>
        </div>
        <footer class="poster-footer"><span>GROOVE ARCHIVE · {{ summary.label }} · {{ summary.items.length }} / 30</span><span>{{ generatedAt }} · 不足 30 张按 0 计入总 RT</span></footer>
    </article>
</template>

<style scoped>
.b30-poster { box-sizing: border-box; width: 1800px; padding: 40px; color: #fff; font-family: 'Yu Gothic', 'Microsoft YaHei', system-ui, sans-serif; font-size: 16px; line-height: 1.25; background: radial-gradient(ellipse at 8% 0%, #8baed4 0%, transparent 52%), radial-gradient(ellipse at 100% 85%, #797ab1 0%, transparent 60%), linear-gradient(145deg, #526d97, #253d61 60%, #48647b); }
.b30-poster * { box-sizing: border-box; }
.poster-advanced { background: radial-gradient(ellipse at 8% 0%, #b49abd 0%, transparent 52%), radial-gradient(ellipse at 100% 85%, #668ead 0%, transparent 60%), linear-gradient(145deg, #795b91, #423d68 60%, #375970); }
.poster-header { height: 168px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.poster-profile { position: relative; width: 1020px; height: 168px; border-radius: 8px; overflow: hidden; background: #e6eff3; color: #25304b; }
.poster-profile-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .75; }
.poster-profile-content { position: relative; padding: 18px 32px; }
.poster-kicker { font-size: 15px; letter-spacing: 3px; font-weight: 800; }
.poster-mode { font-size: 35px; font-weight: 900; margin: 7px 0 3px; }
.poster-mode > span { margin-left: 22px; font-size: 24px; opacity: .65; }
.poster-rating { display: flex; align-items: baseline; gap: 18px; font-size: 26px; font-weight: 700; }
.poster-rating strong { font-size: 50px; line-height: 1; color: #655393; }
.poster-rating > span { font-size: 17px; }
.poster-logo { width: 560px; height: 168px; object-fit: contain; }
.poster-summary { position: relative; height: 64px; margin-bottom: 20px; display: flex; align-items: center; gap: 52px; padding: 0 24px; border-radius: 6px; overflow: hidden; background: #354c70; }
.poster-summary > img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .45; }
.poster-summary > :not(img) { position: relative; }
.poster-summary > strong { font-size: 32px; letter-spacing: 2px; }
.poster-summary > span { font-size: 23px; }
.poster-summary > span:last-child { margin-left: auto; font-size: 18px; letter-spacing: 2px; }
.poster-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px 20px; }
.poster-card { position: relative; height: 150px; border-radius: 8px; overflow: hidden; display: flex; align-items: flex-start; padding: 10px 8px; gap: 12px; background: #76439c; box-shadow: 0 3px 8px #14244240; }
.poster-card.easy { background: #25784d; }
.poster-card.normal { background: #9b611b; }
.poster-card.hard { background: #a53648; }
.poster-card-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.poster-cover { position: relative; flex: 0 0 120px; height: 120px; border-radius: 12px; overflow: hidden; background: #e8e8f2; color: #7b7c98; display: grid; place-items: center; font-size: 48px; }
.poster-cover > img { position: absolute; inset: 0; width: 120px; height: 120px; object-fit: cover; }
.poster-card-info { position: relative; flex: 1; min-width: 0; text-shadow: 0 1px 2px #0005; }
.poster-chart { display: flex; align-items: baseline; gap: 8px; font-size: 13px; white-space: nowrap; }
.poster-chart > span { font-size: 12px; opacity: .85; min-width: 23px; }
.poster-chart > b { font-size: 17px; }
.poster-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 16px; font-weight: 700; margin: 5px 0; height: 20px; }
.poster-score { font-size: 28px; font-weight: 800; line-height: 1.1; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
.poster-chart-rating { font-size: 20px; margin: 3px 0 5px; }
.poster-chart-rating > span { opacity: .7; }
.poster-chart-rating small { display: inline; font-size: 11px; color: inherit; }
.poster-badges { display: flex; gap: 6px; align-items: center; height: 17px; }
.poster-rank, .poster-fc { display: inline-block; width: 83px; height: 16px; position: relative; font-size: 11px; font-weight: 900; line-height: 16px; text-align: center; }
.poster-rank > img, .poster-fc > img { position: absolute; inset: 0; width: 83px; height: 16px; }
.poster-rank:has(img) > span, .poster-fc:has(img) > span { display: none; }
.poster-ap { font-size: 10px; font-weight: 900; border: 1px solid #fff4b1; border-radius: 3px; padding: 1px 3px; color: #fff4b1; white-space: nowrap; }
.poster-empty { align-items: center; justify-content: center; flex-direction: column; background: #ffffff12; border: 1px solid #ffffff30; box-shadow: none; color: #ffffff80; font-size: 14px; letter-spacing: 3px; }
.poster-empty-number { font-size: 28px; font-weight: 700; }
.poster-footer { height: 28px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; letter-spacing: 1px; color: #e0e8f1; }
</style>
