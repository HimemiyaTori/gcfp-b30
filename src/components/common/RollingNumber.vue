<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ value: number; decimals?: number; motionKey?: string }>(), { decimals: 0 })
const direction = ref('digit-up')
const formatted = computed(() => props.value.toFixed(props.decimals))
const digits = computed(() => [...formatted.value].map((digit, index, all) => ({ digit, place: all.length - index })))
// 按位保留节点，快速更新时由 Vue 接续过渡，避免延时队列显示旧值
watch(() => props.value, (value, previous) => { direction.value = value < previous ? 'digit-down' : 'digit-up' }, { flush: 'sync' })
</script>

<template>
    <strong class="rolling-number" :aria-label="formatted">
        <span v-for="item in digits" :key="item.place" :class="['digit-window', { separator: item.digit === '.' }]" aria-hidden="true">
            <Transition :name="direction" appear>
                <span :key="`${item.digit}-${motionKey ?? ''}`" class="digit-value">{{ item.digit }}</span>
            </Transition>
        </span>
    </strong>
</template>

<style scoped>
.rolling-number { display: inline-flex; vertical-align: bottom; font: inherit; font-variant-numeric: tabular-nums; letter-spacing: inherit; }
.digit-window { display: inline-grid; position: relative; overflow: hidden; width: 1ch; height: 1.2em; line-height: 1.2; }
.digit-window.separator { width: .45ch; }
.digit-value { grid-area: 1 / 1; display: block; }
.digit-up-enter-active, .digit-up-leave-active,
.digit-down-enter-active, .digit-down-leave-active { transition: transform 420ms var(--motion-ease-out), opacity 420ms ease; }
.digit-up-enter-from, .digit-down-leave-to { transform: translateY(100%); opacity: 0; }
.digit-up-leave-to, .digit-down-enter-from { transform: translateY(-100%); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
    .digit-up-enter-active, .digit-up-leave-active,
    .digit-down-enter-active, .digit-down-leave-active { transition: none; }
}
</style>
