<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Gamepad2, Images, LoaderCircle, ScanLine } from 'lucide-vue-next'
import AnimatedSuccess from '../common/AnimatedSuccess.vue'
import { motionTiming } from '../common/motion'
import PasswordField from '../common/PasswordField.vue'
import NintendoBindDialog from '../album/NintendoBindDialog.vue'
import { dismissCompletion, finishOnboarding, loginWithCode, loginWithPassword, register, sendCode, siteAccount, verifyRegistration } from '../../core/account/controller'
import { scan } from '../../core/album/controller'
import { AccountError } from '../../core/errors'
import { errorMessage } from '../../i18n'
import { formatDisplayDateTime } from '../../core/dateTime'

const { t, locale } = useI18n()
const dialog = ref<HTMLDialogElement>()
const bindDialog = ref<InstanceType<typeof NintendoBindDialog>>()
const mode = ref<'password' | 'code' | 'register'>('password')
const step = ref<'credentials' | 'details' | 'nintendo' | 'success'>('credentials')
const email = ref(''), otp = ref(''), password = ref(''), confirmation = ref(''), nickname = ref('')
const error = ref(''), pending = ref(''), sent = ref(false), binding = ref(false)
const nextSendAt = ref(0), now = ref(Date.now())
const cooldown = computed(() => Math.max(0, Math.ceil((nextSendAt.value - now.value) / 1000)))
const retryTime = computed(() => cooldown.value > 60 ? formatDisplayDateTime(nextSendAt.value, locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : '')
const title = computed(() => t(`siteAccount.${step.value === 'details' ? 'setupTitle' : step.value === 'nintendo' ? 'nintendoTitle' : mode.value === 'register' ? 'registerTitle' : mode.value === 'code' ? 'codeLoginTitle' : 'loginTitle'}`))
const displayName = computed(() => siteAccount.user?.nickname || siteAccount.user?.email || '')
const successTitle = computed(() => t('siteAccount.registerSuccess', { name: displayName.value }))
let ticker: ReturnType<typeof setInterval> | undefined
let successTimer: ReturnType<typeof setTimeout> | undefined
watch(nextSendAt, value => {
    clearInterval(ticker)
    now.value = Date.now()
    if (value <= now.value) return
    ticker = setInterval(() => { now.value = Date.now(); if (now.value >= value) clearInterval(ticker) }, 1000)
})
watch(() => [siteAccount.authenticated, siteAccount.completion?.step], async () => {
    clearTimeout(successTimer)
    if (!siteAccount.authenticated || !siteAccount.completion || siteAccount.completion.userId !== siteAccount.user?.id || binding.value) return
    step.value = siteAccount.completion.step
    error.value = ''
    clearCredentials()
    await nextTick()
    if (!dialog.value?.open) dialog.value?.showModal()
    if (step.value === 'success') successTimer = setTimeout(done, motionTiming.successCircle + motionTiming.successCheck + motionTiming.successHold)
}, { immediate: true, flush: 'post' })
onUnmounted(() => { clearInterval(ticker); clearTimeout(successTimer) })

function clearCredentials() { otp.value = ''; password.value = ''; confirmation.value = '' }
function open(preferredMode: typeof mode.value = 'password') {
    clearTimeout(successTimer)
    step.value = 'credentials'; mode.value = preferredMode; error.value = ''; sent.value = false
    email.value = siteAccount.user?.email || ''; nickname.value = ''
    clearCredentials()
    dialog.value?.showModal()
}
function switchMode(value: typeof mode.value) {
    mode.value = value; step.value = 'credentials'; error.value = ''; sent.value = false
    clearCredentials()
}
async function perform(kind: string, work: () => Promise<void>) {
    if (pending.value) return
    pending.value = kind; error.value = ''
    try { await work() } catch (cause) {
        error.value = errorMessage(cause)
        if (cause instanceof AccountError && cause.retryAt && kind === 'code') nextSendAt.value = cause.retryAt
        if (cause instanceof AccountError && cause.code === 'registration_expired' && step.value === 'details') {
            step.value = 'credentials'; clearCredentials(); sent.value = false
        }
    } finally { pending.value = '' }
}
function requestCode() {
    if (cooldown.value) return
    void perform('code', async () => {
        await sendCode(email.value.trim(), mode.value === 'register' ? 'registration' : 'sign-in')
        sent.value = true; nextSendAt.value = Date.now() + 60000
    })
}
function submit() {
    if (step.value === 'details' && password.value !== confirmation.value) { error.value = t('siteAccount.errors.password_mismatch'); return }
    void perform('auth', async () => {
        if (step.value === 'details') await register(email.value.trim(), nickname.value.trim(), password.value)
        else if (mode.value === 'password') { await loginWithPassword(email.value.trim(), password.value); dialog.value?.close() }
        else if (mode.value === 'code') { await loginWithCode(email.value.trim(), otp.value); dialog.value?.close() }
        else { await verifyRegistration(email.value.trim(), otp.value); step.value = 'details'; otp.value = ''; error.value = '' }
    })
}
async function beginNintendo() {
    binding.value = true
    dialog.value?.close()
    await nextTick()
    bindDialog.value?.open()
}
async function bindingClosed(bound: boolean) {
    binding.value = false
    if (bound) { finishOnboarding(); void scan(true) }
    await nextTick()
    if (!dialog.value?.open) dialog.value?.showModal()
}
function done() { dismissCompletion(); dialog.value?.close() }
function cancel(event: Event) {
    if (pending.value) event.preventDefault()
    else if (step.value === 'nintendo') { event.preventDefault(); finishOnboarding() }
    else if (step.value === 'success') dismissCompletion()
}
function closed() {
    clearTimeout(successTimer)
    clearCredentials()
    if (!binding.value && step.value === 'success') dismissCompletion()
}
defineExpose({ open })
</script>

<template>
    <dialog ref="dialog" class="editor-dialog account-auth-dialog" aria-labelledby="account-auth-title" @cancel="cancel" @close="closed">
        <div v-if="step === 'success'" class="account-auth-success" role="status">
            <AnimatedSuccess />
            <h2 id="account-auth-title">{{ successTitle }}</h2>
        </div>
        <template v-else-if="step === 'nintendo'">
            <div class="eyebrow">NINTENDO SWITCH 2</div>
            <h2 id="account-auth-title">{{ title }}</h2>
            <div class="account-nintendo-visual" aria-hidden="true"><Gamepad2 :size="32" /><span>→</span><Images :size="30" /><span>→</span><ScanLine :size="30" /></div>
            <p class="muted account-auth-description">{{ t('siteAccount.nintendoDescription') }}</p>
            <p class="muted account-auth-description">{{ t('siteAccount.nintendoOptional') }}</p>
            <div class="dialog-actions account-nintendo-actions"><button type="button" class="button secondary" @click="finishOnboarding">{{ t('siteAccount.skipNintendo') }}</button><button type="button" class="button primary" @click="beginNintendo">{{ t('account.bind') }}</button></div>
        </template>
        <template v-else>
            <div class="eyebrow">GROOVE ARCHIVE</div>
            <h2 id="account-auth-title">{{ title }}</h2>
            <p class="muted account-auth-description">{{ t(step === 'details' ? 'siteAccount.setupDescription' : mode === 'register' ? 'siteAccount.registerDescription' : mode === 'code' ? 'siteAccount.codeLoginDescription' : 'siteAccount.loginDescription') }}</p>
            <form class="account-auth-form" @submit.prevent="submit">
                <template v-if="step === 'details'">
                    <p class="account-verified-email">{{ email }}</p>
                    <label><span>{{ t('siteAccount.nickname') }}</span><input v-model="nickname" autocomplete="nickname" maxlength="40" :placeholder="t('siteAccount.nicknamePlaceholder')" :disabled="!!pending" /></label>
                    <PasswordField v-model="password" :label="t('siteAccount.newPassword')" :hint="t('siteAccount.passwordHint')" auto-complete="new-password" :disabled="!!pending" />
                    <PasswordField v-model="confirmation" :label="t('siteAccount.confirmPassword')" auto-complete="new-password" :disabled="!!pending" />
                </template>
                <template v-else>
                    <label><span>{{ t('siteAccount.email') }}</span><input v-model="email" type="email" autocomplete="username" required maxlength="254" :disabled="!!pending" @input="sent = false; otp = ''" /></label>
                    <PasswordField v-if="mode === 'password'" v-model="password" :label="t('siteAccount.password')" :disabled="!!pending" />
                    <template v-else>
                        <div class="otp-field"><label><span>{{ t('siteAccount.code') }}</span><input v-model="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required :disabled="!!pending" /></label><button type="button" class="button secondary" :disabled="!!pending || cooldown > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())" @click="requestCode">{{ retryTime ? t('siteAccount.waitToRetry') : cooldown ? t('siteAccount.resendIn', { seconds: cooldown }) : t('siteAccount.sendCode') }}</button></div>
                        <p v-if="sent" class="muted" role="status">{{ t('siteAccount.codeSent') }}</p>
                        <p v-if="retryTime" class="muted" role="status">{{ t('siteAccount.retryAt', { time: retryTime }) }}</p>
                    </template>
                    <button v-if="mode !== 'register'" type="button" class="text-link account-auth-switch" :disabled="!!pending" @click="switchMode(mode === 'password' ? 'code' : 'password')">{{ t(mode === 'password' ? 'siteAccount.useCode' : 'siteAccount.usePassword') }}</button>
                </template>
                <p v-if="error" class="error" role="alert">{{ error }}</p>
                <div class="dialog-actions"><button type="button" class="button secondary" :disabled="!!pending" @click="step === 'details' ? switchMode('register') : dialog?.close()">{{ t(step === 'details' ? 'bind.back' : 'common.cancel') }}</button><button type="submit" class="button primary" :disabled="!!pending || (step === 'credentials' && mode !== 'password' && !/^\d{6}$/.test(otp))"><LoaderCircle v-if="pending === 'auth'" class="spin" :size="15" />{{ t(step === 'details' ? 'siteAccount.createAccount' : mode === 'register' ? 'siteAccount.next' : 'siteAccount.signIn') }}</button></div>
            </form>
            <div v-if="step === 'credentials'" class="account-auth-footer">
                <span>{{ t(mode === 'register' ? 'siteAccount.hasAccount' : 'siteAccount.noAccount') }}</span>
                <button type="button" class="text-link" :disabled="!!pending" @click="switchMode(mode === 'register' ? 'password' : 'register')">{{ t(mode === 'register' ? 'siteAccount.signIn' : 'siteAccount.createOne') }}</button>
            </div>
        </template>
    </dialog>
    <NintendoBindDialog ref="bindDialog" @closed="bindingClosed" />
</template>

<style scoped>
.account-auth-dialog { max-width: 480px; }
.account-auth-description { margin-top: 12px; line-height: 1.8; }
.account-auth-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; margin-top: 24px; padding: 17px 12px; border-radius: 12px; background: var(--soft); color: var(--muted); font-size: 14px; }
.account-auth-footer .text-link { padding: 2px 4px; font: inherit; }
.account-auth-form { display: grid; gap: 18px; margin-top: 22px; }
.account-auth-form label { display: grid; gap: 8px; font-size: 13px; margin: 0; }
.account-auth-form input { min-width: 0; width: 100%; font-size: 15px; }
.account-auth-form .muted { margin: 0; }
.account-auth-form small { font-size: 12px; }
.account-auth-form .dialog-actions { margin-top: 2px; }
.account-auth-form .dialog-actions .button { flex: 1; }
.account-auth-switch { justify-self: start; font-size: 13px; }
.otp-field { display: flex; align-items: flex-end; gap: 12px; }
.otp-field label { flex: 1; min-width: 0; }
.account-verified-email { color: var(--accent); font-size: 14px; overflow-wrap: anywhere; }
.account-auth-success { display: grid; justify-items: center; gap: 24px; padding: 24px 0 12px; text-align: center; }
.account-auth-success h2 { margin: 0; overflow-wrap: anywhere; max-width: 100%; }
.account-nintendo-visual { display: flex; justify-content: center; align-items: center; gap: 22px; padding: 30px 0 18px; color: var(--accent); }
.account-nintendo-visual span { color: var(--muted); }
@media (--mobile) {
    .account-auth-dialog .dialog-actions { flex-wrap: wrap; }
    .account-auth-dialog .dialog-actions .button { flex: 1; }
    .account-auth-dialog .account-nintendo-actions { flex-direction: column-reverse; align-items: stretch; }
    .account-auth-dialog .account-nintendo-actions .button { flex: auto; }
}
</style>
