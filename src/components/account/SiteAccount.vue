<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Camera, LoaderCircle, LogIn, LogOut, Mail, UserRound } from 'lucide-vue-next'
import AccountAvatar from '../common/AccountAvatar.vue'
import NintendoAccount from '../album/NintendoAccount.vue'
import { login, logout, refreshAccount, saveAvatar, saveNickname, sendCode, siteAccount } from '../../core/account/controller'
import { compressAvatar } from '../../core/account/avatar'
import { AccountError } from '../../core/errors'
import { errorMessage } from '../../i18n'
import { formatDisplayDateTime } from '../../core/dateTime'

const emit = defineEmits<{ notify: [message: string, title?: string]; view: [] }>()
const { t, locale } = useI18n()
const loginDialog = ref<HTMLDialogElement>()
const logoutDialog = ref<HTMLDialogElement>()
const avatarInput = ref<HTMLInputElement>()
const email = ref(''), otp = ref(''), nickname = ref(''), error = ref(''), pending = ref('')
const sent = ref(false), nextSendAt = ref(0), now = ref(Date.now())
const cooldown = computed(() => Math.max(0, Math.ceil((nextSendAt.value - now.value) / 1000)))
const retryTime = computed(() => cooldown.value > 60 ? formatDisplayDateTime(nextSendAt.value, locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : '')
const name = computed(() => siteAccount.user?.nickname || siteAccount.user?.email || t('siteAccount.title'))
const initial = computed(() => Array.from(name.value)[0]?.toUpperCase() || 'FP')
let ticker: ReturnType<typeof setInterval> | undefined
watch(() => siteAccount.user?.nickname, value => { nickname.value = value || '' }, { immediate: true })
watch(nextSendAt, value => {
    clearInterval(ticker)
    now.value = Date.now()
    if (value <= now.value) return
    ticker = setInterval(() => { now.value = Date.now(); if (now.value >= value) clearInterval(ticker) }, 1000)
})
onMounted(() => { if (!siteAccount.loading) void refreshAccount() })
onUnmounted(() => clearInterval(ticker))

function openLogin() {
    error.value = ''; otp.value = ''; sent.value = false
    email.value = siteAccount.user?.email || ''
    loginDialog.value?.showModal()
}
async function perform(kind: string, work: () => Promise<void>) {
    if (pending.value) return
    pending.value = kind; error.value = ''
    try { await work() } catch (cause) {
        error.value = errorMessage(cause)
        if (cause instanceof AccountError && cause.retryAt && kind === 'code') nextSendAt.value = cause.retryAt
        if (cause instanceof AccountError && ['login_required', 'account_changed'].includes(cause.code)) void refreshAccount()
    } finally { pending.value = '' }
}
function requestCode() {
    if (cooldown.value) return
    void perform('code', async () => {
        await sendCode(email.value.trim())
        sent.value = true
        nextSendAt.value = Date.now() + 60000
    })
}
function submitLogin() {
    void perform('login', async () => { await login(email.value.trim(), otp.value); otp.value = ''; loginDialog.value?.close() })
}
function changeAvatar(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    void perform('avatar', async () => { await saveAvatar(await compressAvatar(file)); emit('notify', t('siteAccount.saved')) })
}
</script>

<template>
    <section class="panel settings-panel site-account-panel">
        <div class="section-title between">
            <h2>{{ t('siteAccount.title') }}</h2>
            <span class="micro-label">GROOVE ARCHIVE</span>
        </div>
        <div v-if="!siteAccount.user" class="setting-row account-welcome">
            <span class="site-account-icon"><UserRound :size="26" /></span>
            <div class="account-description"><h3>{{ t('siteAccount.welcome') }}</h3><p>{{ t('siteAccount.description') }}</p></div>
            <button class="button primary" :disabled="siteAccount.loading" @click="openLogin"><LogIn :size="16" />{{ t('siteAccount.login') }}</button>
        </div>
        <template v-else>
            <div class="setting-row profile-row">
                <div class="avatar-editor">
                    <AccountAvatar class="site-avatar" :src="siteAccount.user.avatarUrl" :fallback="initial" />
                    <button class="avatar-change" :aria-label="t('siteAccount.uploadAvatar')" :title="t('siteAccount.uploadAvatar')" :disabled="!!pending || !siteAccount.authenticated" @click="avatarInput?.click()"><Camera :size="16" /></button>
                    <input ref="avatarInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" :aria-label="t('siteAccount.uploadAvatar')" @change="changeAvatar" />
                </div>
                <div class="account-description"><h3 class="profile-name">{{ name }}</h3><p><Mail :size="13" /> {{ siteAccount.user.email }}</p></div>
                <button class="button secondary" :disabled="!!pending" @click="error = ''; logoutDialog?.showModal()"><LogOut :size="15" />{{ t('siteAccount.logout') }}</button>
            </div>
            <div v-if="siteAccount.expired" class="account-session-warning" role="alert">
                <p>{{ t('siteAccount.expired') }}</p><button class="button primary" @click="openLogin">{{ t('siteAccount.relogin') }}</button>
            </div>
            <form class="profile-fields" @submit.prevent="perform('profile', async () => { await saveNickname(nickname); emit('notify', t('siteAccount.saved')) })">
                <label class="profile-nickname"><span>{{ t('siteAccount.nickname') }}</span><input v-model="nickname" maxlength="40" :placeholder="t('siteAccount.nicknamePlaceholder')" :disabled="!siteAccount.authenticated || !!pending" /></label>
                <button class="button secondary" :disabled="!siteAccount.authenticated || !!pending || nickname.trim() === siteAccount.user.nickname" type="submit">{{ t('siteAccount.save') }}</button>
                <p class="profile-hint">{{ t('siteAccount.avatarHint') }} <button v-if="siteAccount.user.avatarUrl" type="button" class="text-link" :disabled="!siteAccount.authenticated || !!pending" @click="perform('avatar', async () => { await saveAvatar(); emit('notify', t('siteAccount.saved')) })">{{ t('siteAccount.resetAvatar') }}</button></p>
            </form>
        </template>
        <p v-if="pending === 'avatar'" class="account-feedback" role="status"><LoaderCircle class="spin" :size="15" />{{ t('siteAccount.uploading') }}</p>
        <p v-if="siteAccount.error || (error && !loginDialog?.open && !logoutDialog?.open)" class="error account-feedback" role="alert">{{ siteAccount.error || error }}</p>
        <p class="account-local-note">{{ t('siteAccount.localNote') }}</p>
    </section>
    <NintendoAccount v-if="siteAccount.authenticated" @notify="(message, title) => emit('notify', message, title)" @view="emit('view')" />
    <dialog ref="loginDialog" class="editor-dialog account-login-dialog" aria-labelledby="site-login-title" @cancel="pending && $event.preventDefault()" @close="otp = ''">
        <div class="eyebrow">GROOVE ARCHIVE</div><h2 id="site-login-title">{{ t('siteAccount.loginTitle') }}</h2>
        <p class="muted">{{ t('siteAccount.loginDescription') }}</p>
        <form class="account-login-form" @submit.prevent="submitLogin">
            <label><span>{{ t('siteAccount.email') }}</span><input v-model="email" type="email" autocomplete="email" required maxlength="254" :disabled="!!pending" @input="sent = false" /></label>
            <div class="otp-field"><label><span>{{ t('siteAccount.code') }}</span><input v-model="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required :disabled="!!pending" /></label><button type="button" class="button secondary" :disabled="!!pending || cooldown > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())" @click="requestCode">{{ retryTime ? t('siteAccount.waitToRetry') : cooldown ? t('siteAccount.resendIn', { seconds: cooldown }) : t('siteAccount.sendCode') }}</button></div>
            <p v-if="sent" class="muted" role="status">{{ t('siteAccount.codeSent') }}</p>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <p v-if="retryTime" class="muted" role="status">{{ t('siteAccount.retryAt', { time: retryTime }) }}</p>
            <div class="dialog-actions"><button type="button" class="button secondary" :disabled="!!pending" @click="loginDialog?.close()">{{ t('common.cancel') }}</button><button type="submit" class="button primary" :disabled="!!pending || !/^\d{6}$/.test(otp)"><LoaderCircle v-if="pending === 'login'" class="spin" :size="15" />{{ t('siteAccount.continue') }}</button></div>
        </form>
    </dialog>
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
.profile-name { overflow-wrap: anywhere; }
.site-account-icon, .site-avatar { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 50%; background: var(--soft-gradient); color: var(--accent); font-weight: 700; font-size: 24px; }
.avatar-editor { position: relative; flex-shrink: 0; }
.avatar-change { position: absolute; bottom: -3px; right: -5px; width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%; color: var(--accent); background: var(--panel); }
.profile-fields { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; padding: 0 26px 24px; }
.profile-nickname { display: grid; gap: 8px; flex: 1; min-width: 180px; font-size: 13px; }
.profile-hint { width: 100%; color: var(--muted); font-size: 12px; line-height: 1.8; }
.account-local-note { border-top: 1px solid var(--line); padding: 16px 26px; color: var(--muted); font-size: 12px; line-height: 1.8; }
.account-feedback { display: flex; align-items: center; gap: 8px; margin: 0 26px 20px; }
.account-session-warning { margin: 0 26px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
.account-login-form { display: grid; gap: 18px; margin-top: 22px; }
.account-login-form label { display: grid; gap: 8px; font-size: 13px; }
.otp-field { display: flex; align-items: flex-end; gap: 12px; }
.otp-field label { flex: 1; min-width: 0; }
.otp-field input { width: 100%; min-width: 0; }
@media (--mobile) {
    .profile-fields { padding-inline: 19px; }
    .account-local-note { padding-inline: 19px; }
    .account-feedback, .account-session-warning { margin-inline: 19px; }
    .account-welcome > .button { width: 100%; }
}
</style>
