<script setup lang="ts">
import { motionTiming } from './motion'
defineProps<{ variant?: 'card' | 'notice' }>()
</script>

<template>
    <Transition :name="variant === 'notice' ? 'notice-motion' : 'card-motion'">
        <slot :motion-style="{
            '--motion-enter': `${motionTiming.enter}ms`,
            '--motion-leave': `${motionTiming.leave}ms`,
        }" />
    </Transition>
</template>
