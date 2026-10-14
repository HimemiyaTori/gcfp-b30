<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { AlbumState } from '../../db/albumModels'
import AccountAvatar from '../common/AccountAvatar.vue'
import DisplayControls from './DisplayControls.vue'
const props = defineProps<{ account?: Pick<AlbumState, 'accountId' | 'nickname' | 'avatarUrl'> }>()
const { t } = useI18n()
const name = computed(() => props.account?.accountId ? props.account.nickname || t('account.nintendo') : '')
const initial = computed(() => name.value ? Array.from(name.value)[0]?.toUpperCase() ?? 'N' : 'FP')
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
            <AccountAvatar
                class="avatar"
                :src="account?.accountId ? account.avatarUrl : undefined"
                :fallback="initial"
                :title="name || undefined"
            />
        </div>
    </header>
</template>
