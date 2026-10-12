<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import DisplayControls from './DisplayControls.vue'
const { t } = useI18n()
</script>

<template>
    <header class="topbar between">
        <a
            href="#home"
            class="game-identity"
            :aria-label="t('header.home')"
        >
            <img
                class="game-logo"
                src="/images/gcfp-logo.png"
                alt="Groove Coaster Future Performers"
                width="700"
                height="296"
            />
            <span class="game-edition">B30</span>
        </a>
        <div class="row gap-4">
            <div class="topbar-mobile-controls">
                <DisplayControls />
            </div>
            <div class="avatar">FP</div>
        </div>
    </header>
</template>
