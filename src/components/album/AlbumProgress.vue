<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { album } from '../../core/album/controller'
const { t } = useI18n()
</script>
<template>
    <p v-if="album.busy || album.message || album.error" class="album-progress" role="status">
        {{ album.busy ? t('album.working') : album.error || album.message }}
        <a href="#settings">{{ t('album.title') }}</a>
    </p>
</template>
<style scoped>
.album-progress { font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.album-progress a { margin-inline-start: 12px; }
</style>
