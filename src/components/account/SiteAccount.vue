<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LogIn, LogOut, Mail, Pencil, UserRound } from 'lucide-vue-next'
import AccountAvatar from '../common/AccountAvatar.vue'
import NintendoAccount from '../album/NintendoAccount.vue'
import AccountAuthDialog from './AccountAuthDialog.vue'
import AccountProfileDialog from './AccountProfileDialog.vue'
import { logout, refreshAccount, siteAccount } from '../../core/account/controller'
import { AccountError } from '../../core/errors'
import { errorMessage } from '../../i18n'

const emit = defineEmits<{ notify: [message: string, title?: string]; view: [] }>()
const { t } = useI18n()
const loginDialog = ref<InstanceType<typeof AccountAuthDialog>>()
const profileDialog = ref<InstanceType<typeof AccountProfileDialog>>()
const logoutDialog = ref<HTMLDialogElement>()
const error = ref(''), pending = ref('')
const name = computed(() => siteAccount.user?.nickname || siteAccount.user?.email || t('siteAccount.title'))
const initial = computed(() => Array.from(name.value)[0]?.toUpperCase() || 'FP')
onMounted(() => { if (!siteAccount.loading) void refreshAccount() })

function openLogin() { loginDialog.value?.open() }
async function perform(kind: string, work: () => Promise<void>) {
    if (pending.value) return
    pending.value = kind; error.value = ''
    try { await work() } catch (cause) {
        error.value = errorMessage(cause)
        if (cause instanceof AccountError && ['login_required', 'account_changed'].includes(cause.code)) void refreshAccount()
    } finally { pending.value = '' }
}
</script>

<template>
    <section class="panel settings-panel site-account-panel">
        <div class="section-title between">
            <h2>{{ t('account.section') }}</h2>
            <span class="micro-label">GROOVE ARCHIVE</span>
        </div>
        <div v-if="!siteAccount.user" class="setting-row account-welcome">
            <span class="site-account-icon"><UserRound :size="26" /></span>
            <div class="account-description"><h3>{{ t('siteAccount.welcome') }}</h3><p>{{ t('siteAccount.description') }}</p></div>
            <button class="button primary" :disabled="siteAccount.loading" @click="openLogin"><LogIn :size="16" />{{ t('siteAccount.login') }}</button>
        </div>
        <template v-else>
            <div class="setting-row profile-row">
                <AccountAvatar class="site-avatar" :src="siteAccount.user.avatarUrl" :fallback="initial" />
                <div class="account-description"><span class="profile-type">{{ t('siteAccount.title') }}</span><h3 class="profile-name">{{ name }}</h3><p><Mail :size="13" /> {{ siteAccount.user.email }}</p></div>
                <div class="profile-actions">
                    <button class="button secondary" :disabled="!!pending || !siteAccount.authenticated" @click="profileDialog?.open()"><Pencil :size="15" />{{ t('siteAccount.editProfile') }}</button>
                    <button class="button secondary" :disabled="!!pending" @click="error = ''; logoutDialog?.showModal()"><LogOut :size="15" />{{ t('siteAccount.logout') }}</button>
                </div>
            </div>
            <div v-if="siteAccount.expired" class="account-session-warning" role="alert">
                <p>{{ t('siteAccount.expired') }}</p><button class="button primary" @click="openLogin">{{ t('siteAccount.relogin') }}</button>
            </div>
        </template>
        <p v-if="siteAccount.error || (error && !logoutDialog?.open)" class="error account-feedback" role="alert">{{ siteAccount.error || error }}</p>
        <NintendoAccount v-if="siteAccount.authenticated" embedded @notify="(message, title) => emit('notify', message, title)" @view="emit('view')" />
    </section>
    <AccountAuthDialog ref="loginDialog" />
    <AccountProfileDialog ref="profileDialog" @notify="message => emit('notify', message)" @reauthenticate="loginDialog?.open(siteAccount.user?.hasPassword === false ? 'code' : 'password')" />
    <dialog ref="logoutDialog" class="editor-dialog" aria-labelledby="site-logout-title" @cancel="pending && $event.preventDefault()">
        <h2 id="site-logout-title">{{ t('siteAccount.logout') }}</h2><p class="muted">{{ t('siteAccount.logoutDescription') }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="dialog-actions"><button class="button secondary" :disabled="!!pending" @click="logoutDialog?.close()">{{ t('common.cancel') }}</button><button class="button primary" :disabled="!!pending" @click="perform('logout', logout)">{{ t('siteAccount.logout') }}</button></div>
    </dialog>
</template>

<style scoped>
.account-welcome, .profile-row { gap: 18px; flex-wrap: wrap; }
.account-description { flex: 1; min-width: 160px; }
.account-description p { display: flex; align-items: center; gap: 6px; overflow-wrap: anywhere; }
.profile-row { border-bottom: 0; }
.profile-type { display: block; margin-bottom: 6px; color: var(--muted); font-size: 11px; }
.profile-name { overflow-wrap: anywhere; }
.profile-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.site-account-icon, .site-avatar { width: 58px; height: 58px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--soft-gradient); color: var(--accent); font-weight: 700; font-size: 24px; }
.account-feedback { display: flex; align-items: center; gap: 8px; margin: 0 26px 20px; }
.account-session-warning { margin: 0 26px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
@media (--mobile) {
    .account-feedback, .account-session-warning { margin-inline: 19px; }
    .profile-actions { width: 100%; }
    .profile-actions .button { flex: 1; }
    .account-welcome > .button { width: 100%; }
}
</style>
