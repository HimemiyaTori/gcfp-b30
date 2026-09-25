<script setup lang="ts">
import { motionTiming } from './motion'
</script>

<template>
    <svg
        class="animated-success"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        :style="{
            '--success-circle': `${motionTiming.successCircle}ms`,
            '--success-check': `${motionTiming.successCheck}ms`,
        }">
        <!-- 从顶部逆时针绘制，右上角保留缺口；pathLength 使时长不受尺寸影响 -->
        <path class="success-circle" d="M 50 12 A 38 38 0 1 0 88 50" pathLength="1" />
        <path class="success-check" d="m 32 49 13 13 33 -34" pathLength="1" />
    </svg>
</template>

<style scoped>
.animated-success {
    width: 100px;
    height: 100px;
    color: var(--accent);
    stroke: currentColor;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.animated-success path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: success-draw var(--success-circle) ease-out forwards;
}
.animated-success .success-check {
    animation-duration: var(--success-check);
    animation-delay: var(--success-circle);
}
@keyframes success-draw {
    to { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
    .animated-success path {
        animation: none;
        stroke-dashoffset: 0;
    }
}
</style>
