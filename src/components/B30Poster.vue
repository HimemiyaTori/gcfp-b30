<script setup lang="ts">
import { computed } from 'vue'
import type { getModeB30 } from '../core/rating/calculator'
import { coverThumbUrl } from '../core/song/cover'

const props = defineProps<{
    summary: ReturnType<typeof getModeB30>
    language: 'ja' | 'en'
    generatedAt: string
}>()
const asset = (name: string) => `${import.meta.env.BASE_URL}images/b30/${name}`
const logo = `${import.meta.env.BASE_URL}images/gcfp-logo.png`
const chartConstant = (level: string) =>
    (Number(level.replace('+', '')) + (level.endsWith('+') ? 0.5 : 0)).toFixed(1)
const backgrounds: Record<string, string> = {
    EASY: 'Basic',
    NORMAL: 'Advance',
    HARD: 'Expert',
    MASTER: 'Master',
}
const slots = computed(() =>
    Array.from({ length: 30 }, (_, i) => props.summary.items[i]),
)
const average = computed(() =>
    Math.round(
        props.summary.items.reduce((sum, item) => sum + item.score, 0) /
            (props.summary.items.length || 1),
    ).toLocaleString('en-US'),
)
const averageConstant = computed(() => {
    const items = props.summary.items
    if (!items.length) return '—'
    return (
        items.reduce((sum, item) => sum + Number(chartConstant(item.level)), 0) /
        items.length
    ).toFixed(2)
})
</script>

<template>
    <article
        class="b30-poster"
        :class="{ 'poster-advanced': summary.mode === 'ADVANCED' }"
    >
        <header class="poster-header">
            <div class="poster-profile">
                <div class="poster-profile-content">
                    <div class="poster-kicker">
                        GROOVE COASTER · FUTURE PERFORMERS
                    </div>
                    <div class="poster-mode">
                        {{ summary.label }} <span>BEST 30</span>
                    </div>
                </div>
                <div class="poster-rating">
                    <span>GROOVE RATING</span>
                    <strong>{{ summary.rating.toFixed(2) }}</strong>
                </div>
            </div>
            <img
                class="poster-logo"
                :src="logo"
                alt="Groove Coaster Future Performers"
            />
        </header>
        <div class="poster-summary">
            <div class="poster-summary-average">
                <span class="poster-summary-label">Avg.</span>
                <b>{{ summary.items.length ? average : '—' }}</b>
                <span class="poster-summary-divider"></span>
                <b>{{ averageConstant }}</b>
            </div>
            <div class="poster-summary-floor">
                <span class="poster-summary-label">Floor</span>
                <b>{{ summary.floor?.toFixed(2) ?? '—' }}</b>
            </div>
        </div>
        <div class="poster-grid">
            <div
                v-for="(item, index) in slots"
                :key="index"
                class="poster-card"
                :class="item?.difficulty.toLowerCase() ?? 'poster-empty'"
            >
                <template v-if="item">
                    <img
                        class="poster-card-bg"
                        :src="
                            asset(
                                `bg_${backgrounds[item.difficulty] ?? 'Master'}.png`,
                            )
                        "
                        alt=""
                    />
                    <div class="poster-cover">
                        <span>♪</span>
                        <img
                            v-if="coverThumbUrl(item.coverSourceUrl)"
                            :src="coverThumbUrl(item.coverSourceUrl)"
                            data-cover
                            alt=""
                        />
                    </div>
                    <div class="poster-card-info">
                        <span class="poster-position">#{{ index + 1 }}</span>
                        <div class="poster-chart">
                            <span>{{ item.level }}</span
                            ><span>{{ item.difficulty }}</span>
                        </div>
                        <div class="poster-title" :title="item[language] || item.ja">
                            {{ item[language] || item.ja }}
                        </div>
                        <div class="poster-score">
                            {{ item.score.toLocaleString('en-US') }}
                        </div>
                        <div class="poster-chart-rating">
                            {{ chartConstant(item.level) }} <span>→</span>
                            {{ item.rating.toFixed(2) }}
                        </div>
                    </div>
                </template>
                <template v-else
                    ><span class="poster-empty-number">#{{ index + 1 }}</span
                    ><span>NO RECORD</span></template
                >
            </div>
        </div>
        <footer class="poster-footer">
            <span
                >GROOVE ARCHIVE · {{ summary.label }} ·
                {{ summary.items.length }} / 30</span
            ><span>{{ generatedAt }} · 不足 30 张按 0 计入总 Rating</span>
        </footer>
    </article>
</template>

<style scoped>
.b30-poster {
    box-sizing: border-box;
    width: 1800px;
    padding: 40px;
    color: #fff;
    font-family: 'QQBotArialDegree', 'QQBotUD', sans-serif;
    font-weight: 700;
    font-synthesis: none;
    font-size: 16px;
    line-height: 1.25;
    background:
        radial-gradient(ellipse at 8% 0%, #8baed4 0%, transparent 52%),
        radial-gradient(ellipse at 100% 85%, #797ab1 0%, transparent 60%),
        linear-gradient(145deg, #526d97, #253d61 60%, #48647b);
}
.b30-poster * {
    box-sizing: border-box;
}
.poster-advanced {
    background:
        radial-gradient(ellipse at 8% 0%, #b49abd 0%, transparent 52%),
        radial-gradient(ellipse at 100% 85%, #668ead 0%, transparent 60%),
        linear-gradient(145deg, #795b91, #423d68 60%, #375970);
}
.poster-header {
    height: 168px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}
.poster-profile {
    position: relative;
    width: 1020px;
    height: 168px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 34px;
    overflow: hidden;
    border-left: 5px solid #dfff00;
    background:
        linear-gradient(120deg, transparent 48%, #ffffff0c 48%, #ffffff0c 61%, transparent 61%),
        linear-gradient(60deg, transparent 63%, #20deef24 63%, #20deef24 78%, transparent 78%),
        linear-gradient(110deg, #123859e6, #087b9bcc);
    box-shadow: inset 0 -1px #5dedff70;
}
.poster-profile-content {
    position: relative;
}
.poster-kicker {
    color: #b9e5ef;
    font-size: 12px;
    letter-spacing: 2px;
}
.poster-mode {
    font-size: 42px;
    font-weight: 900;
    margin-top: 14px;
    letter-spacing: 1px;
}
.poster-mode > span {
    display: block;
    margin-top: 5px;
    color: #8fdae6;
    font-size: 17px;
    letter-spacing: 7px;
}
.poster-rating {
    position: relative;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    color: #e4ff00;
    font-size: 25px;
    font-style: italic;
    letter-spacing: 2px;
}
.poster-rating strong {
    font-size: 76px;
    line-height: 1;
    color: #fff;
    font-style: normal;
    letter-spacing: 1px;
    text-shadow: 0 0 18px #51e9ff66;
}
.poster-logo {
    width: 560px;
    height: 168px;
    object-fit: contain;
}
.poster-summary {
    height: 64px;
    width: 850px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
}
.poster-summary-average,
.poster-summary-floor {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 0 28px;
    background: #142c4666;
    box-shadow: inset 0 1px #ffffff30;
}
.poster-summary-average {
    width: 560px;
    height: 64px;
    border-left: 3px solid #8de7ef;
}
.poster-summary-floor {
    flex: 1;
    height: 54px;
    background: #142c4640;
}
.poster-summary-label {
    color: #b9e5ef;
    font-size: 24px;
}
.poster-summary b {
    font-size: 30px;
    white-space: nowrap;
}
.poster-summary-divider {
    width: 1px;
    height: 24px;
    background: #ffffff40;
}
.poster-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px 20px;
}
.poster-card {
    position: relative;
    height: 150px;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    padding: 10px 8px;
    gap: 12px;
    background: #76439c;
    box-shadow: 0 3px 8px #14244240;
}
.poster-card.easy {
    background: #25784d;
}
.poster-card.normal {
    background: #9b611b;
}
.poster-card.hard {
    background: #a53648;
}
.poster-card-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}
.poster-cover {
    position: absolute;
    left: 8px;
    top: 10px;
    width: 120px;
    height: 120px;
    border-radius: 12px;
    overflow: hidden;
    background: #e8e8f2;
    color: #7b7c98;
    display: grid;
    place-items: center;
    font-size: 48px;
}
.poster-cover > img {
    position: absolute;
    inset: 0;
    width: 120px;
    height: 120px;
    object-fit: cover;
}
.poster-card-info {
    position: absolute;
    inset: 0;
}
.poster-position {
    position: absolute;
    top: 8px;
    left: 140px;
    width: 40px;
    text-align: center;
    font-size: 13px;
    line-height: 24px;
}
.poster-chart {
    position: absolute;
    top: 8px;
    left: 182px;
    right: 8px;
    display: flex;
    align-items: baseline;
    gap: 12px;
    font-size: 16px;
    line-height: 24px;
    white-space: nowrap;
}
.poster-title {
    position: absolute;
    top: 42px;
    left: 140px;
    right: 10px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: clip;
    font-size: 16px;
    line-height: 22px;
}
.poster-title.is-overflowing {
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
}
.poster-score {
    position: absolute;
    top: 72px;
    left: 140px;
    right: 10px;
    font-size: 25px;
    line-height: 30px;
    font-variant-numeric: tabular-nums;
}
.poster-chart-rating {
    position: absolute;
    top: 108px;
    left: 140px;
    right: 10px;
    font-size: 21px;
    line-height: 27px;
    white-space: nowrap;
}
.poster-chart-rating > span {
    opacity: 0.7;
}
.poster-empty {
    align-items: center;
    justify-content: center;
    flex-direction: column;
    background: #ffffff12;
    border: 1px solid #ffffff30;
    box-shadow: none;
    color: #ffffff80;
    font-size: 14px;
    letter-spacing: 3px;
}
.poster-empty-number {
    font-size: 28px;
    font-weight: 700;
}
.poster-footer {
    height: 28px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 13px;
    letter-spacing: 1px;
    color: #e0e8f1;
}
</style>
