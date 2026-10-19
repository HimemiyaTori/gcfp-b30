<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
</script>

<template>
    <div class="select-field">
        <slot />
        <ChevronDown :size="15" aria-hidden="true" />
    </div>
</template>

<style scoped>
.select-field {
    position: relative;
    min-width: 0;
}
.select-field :deep(select) {
    width: 100%;
    appearance: none;
    padding-right: 36px;
}
.select-field > svg {
    position: absolute;
    top: 50%;
    right: 12px;
    color: var(--muted);
    transform: translateY(-50%);
    pointer-events: none;
}
</style>
