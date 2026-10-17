<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RatingSnapshot } from '../db/models'
import type { RatingMode } from '../core/rating/calculator'
import { dayDate } from '../core/rating/calendar'
export type RatingGrain = 'day' | 'month' | 'year'
const props = defineProps<{ snapshots: RatingSnapshot[]; mode: RatingMode }>()
const grain = defineModel<RatingGrain>('grain', { required: true })
const { t, locale } = useI18n()
const selected = ref(0)
const today = ref(new Date().setHours(0, 0, 0, 0))
const calendarTimer = window.setInterval(() => { today.value = new Date().setHours(0, 0, 0, 0) }, 60000)
const canvas = ref<SVGSVGElement>()
const width = ref(900)
const observer = new ResizeObserver(entries => {
    width.value = Math.max(280, entries[0]?.contentRect.width ?? 900)
})
watch(canvas, value => { observer.disconnect(); if (value) observer.observe(value) })
onUnmounted(() => { observer.disconnect(); window.clearInterval(calendarTimer) })
const period = (time: number) => { const date = new Date(time); return new Date(date.getFullYear(), grain.value === 'year' ? 0 : date.getMonth(), grain.value === 'day' ? date.getDate() : 1) }
const points = computed(() => {
    if (!props.snapshots.length) return []
    const buckets = new Map<number, number>()
    for (const snapshot of props.snapshots) buckets.set(period(dayDate(snapshot.day).getTime()).getTime(), props.mode === 'BASIC' ? snapshot.basic : snapshot.advanced)
    const date = period(dayDate(props.snapshots[0]!.day).getTime()), end = period(today.value).getTime()
    const result: { time: number; rating: number }[] = []
    let value = 0
    while (date.getTime() <= end) {
        value = buckets.get(date.getTime()) ?? value
        result.push({ time: date.getTime(), rating: value })
        if (grain.value === 'day') date.setDate(date.getDate() + 1)
        else if (grain.value === 'month') date.setMonth(date.getMonth() + 1)
        else date.setFullYear(date.getFullYear() + 1)
    }
    return result
})
watch(points, value => { selected.value = Math.max(0, value.length - 1) }, { immediate: true })
const bounds = computed(() => {
    let min = Infinity, max = -Infinity
    for (const point of points.value) { min = Math.min(min, point.rating); max = Math.max(max, point.rating) }
    const pad = Math.max((max - min) * .15, .05)
    return { min: Math.max(0, min - pad), max: max + pad }
})
const x = (index: number) => points.value.length < 2 ? width.value / 2 : 48 + index / (points.value.length - 1) * (width.value - 68)
const y = (value: number) => 210 - (value - bounds.value.min) / (bounds.value.max - bounds.value.min) * 180
const line = computed(() => points.value.map((point, index) => `${x(index)},${y(point.rating)}`).join(' '))
const focus = computed(() => points.value[selected.value])
const label = (time: number) => new Intl.DateTimeFormat(locale.value, { year: 'numeric', ...(grain.value !== 'year' ? { month: 'numeric' } : {}), ...(grain.value === 'day' ? { day: 'numeric' } : {}) }).format(time)
function pick(event: PointerEvent) {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
    const fraction = ((event.clientX - rect.left) / rect.width * width.value - 48) / (width.value - 68)
    selected.value = Math.max(0, Math.min(points.value.length - 1, Math.round(fraction * (points.value.length - 1))))
}
</script>
<template>
    <section class="panel rating-trend" :aria-label="t('trend.region')">
        <div class="section-title between"><div><h2>{{ t('trend.title') }} <small>{{ mode }}</small></h2></div><div class="segmented" role="group" :aria-label="t('trend.grain')"><button v-for="key in ['day', 'month', 'year'] as const" :key="key" :aria-pressed="grain === key" :class="{ selected: grain === key }" @click="grain = key">{{ t(`trend.grains.${key}`) }}</button></div></div>
        <template v-if="points.length && focus">
            <p class="trend-value" aria-live="polite">{{ label(focus.time) }} · {{ focus.rating.toFixed(2) }} RT</p>
            <svg ref="canvas" :viewBox="`0 0 ${width} 245`" role="img" :aria-label="t('trend.chart', { mode, count: points.length }, points.length)" @pointermove="pick" @pointerdown="pick">
                <g v-for="step in [0, 1, 2, 3]" :key="step"><line x1="48" :x2="width - 20" :y1="30 + step * 60" :y2="30 + step * 60" class="trend-grid" /><text x="38" :y="35 + step * 60" text-anchor="end">{{ (bounds.max - step / 3 * (bounds.max - bounds.min)).toFixed(2) }}</text></g>
                <polyline :points="line" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
                <circle :cx="x(selected)" :cy="y(focus.rating)" r="5" fill="currentColor" />
                <text x="48" y="239">{{ label(points[0]!.time) }}</text><text v-if="points.length > 1" :x="width - 20" y="239" text-anchor="end">{{ label(points[points.length - 1]!.time) }}</text>
            </svg>
        </template>
        <p v-else class="empty">{{ t('trend.empty') }}</p>
    </section>
</template>
<style scoped>
.rating-trend { margin-bottom: 24px; }
.rating-trend h2 small { font-size: 12px; color: var(--muted); }
.rating-trend svg { width: calc(100% - 24px); margin: 0 12px 16px; display: block; color: var(--accent); touch-action: pan-y; }
.rating-trend svg text { fill: var(--muted); font-size: 13px; }
.trend-grid { stroke: currentColor; opacity: .12; }
.trend-value { font-variant-numeric: tabular-nums; margin: 0 24px; }
@media (--mobile) { .rating-trend svg { min-height: 160px; } }
</style>
