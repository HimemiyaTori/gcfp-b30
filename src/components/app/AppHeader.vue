<script setup lang="ts">
import DisplayControls from './DisplayControls.vue'
</script>

<template>
    <header class="topbar between">
        <a
            href="#home"
            class="game-identity"
            aria-label="Groove Coaster Future Performers B30 首页"
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
            <span class="preview-pill"
                ><span class="tiny-dot"></span> 界面预览</span
            >
            <div class="topbar-mobile-controls">
                <DisplayControls />
            </div>
            <div class="avatar">FP</div>
        </div>
    </header>
</template>
