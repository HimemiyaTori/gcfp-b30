<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Camera, KeyRound, LoaderCircle } from 'lucide-vue-next'
import AccountAvatar from '../common/AccountAvatar.vue'
import PasswordField from '../common/PasswordField.vue'
import { refreshAccount, saveAvatar, saveNickname, savePassword, siteAccount } from '../../core/account/controller'
import { album } from '../../core/album/controller'
import { compressAvatar } from '../../core/account/avatar'
import { AccountError } from '../../core/errors'
import { errorMessage } from '../../i18n'

const emit = defineEmits<{ notify: [message: string]; reauthenticate: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const avatarInput = ref<HTMLInputElement>()
const nickname = ref(''), error = ref(''), pending = ref('')
const avatar = ref<Blob>(), previewUrl = ref(''), avatarChanged = ref(false)
const editingPassword = ref(false), currentPassword = ref(''), newPassword = ref(''), confirmation = ref(''), reauthentication = ref(false)
const hasPassword = computed(() => siteAccount.user?.hasPassword !== false)
const source = computed(() => avatarChanged.value ? previewUrl.value || album.state.avatarUrl : siteAccount.user?.avatarUrl)
const initial = computed(() => Array.from(nickname.value.trim() || siteAccount.user?.email || '')[0]?.toUpperCase() || 'FP')
const changed = computed(() => avatarChanged.value || nickname.value.trim() !== (siteAccount.user?.nickname || '') || editingPassword.value)

function clearPasswords() {
    currentPassword.value = ''; newPassword.value = ''; confirmation.value = ''
    editingPassword.value = false; reauthentication.value = false
}
function togglePassword() {
    const opening = !editingPassword.value
    clearPasswords(); error.value = ''; editingPassword.value = opening
}
function reauthenticate() {
    dialog.value?.close()
    clearPasswords()
    emit('reauthenticate')
}

function releasePreview() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
}
function resetDraft() {
    clearPasswords()
    releasePreview()
    avatar.value = undefined
    avatarChanged.value = false
    error.value = ''
}
function open() {
    resetDraft()
    nickname.value = siteAccount.user?.nickname || ''
    dialog.value?.showModal()
}
async function changeAvatar(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || pending.value) return
    pending.value = 'avatar'; error.value = ''
    try {
        const compressed = await compressAvatar(file)
        releasePreview()
        avatar.value = compressed
        previewUrl.value = URL.createObjectURL(compressed)
        avatarChanged.value = true
    } catch (cause) { error.value = errorMessage(cause) }
    finally { pending.value = '' }
}
function resetAvatar() {
    releasePreview()
    avatar.value = undefined
    avatarChanged.value = true
}
async function save() {
    if (pending.value || !changed.value || !siteAccount.authenticated) return
    if (editingPassword.value && newPassword.value !== confirmation.value) { error.value = t('siteAccount.errors.password_mismatch'); return }
    pending.value = 'save'; error.value = ''
    try {
        if (editingPassword.value) {
            await savePassword(newPassword.value, hasPassword.value ? currentPassword.value : undefined)
            clearPasswords()
        }
        if (avatarChanged.value) {
            await saveAvatar(avatar.value)
            avatarChanged.value = false
            releasePreview()
        }
        if (nickname.value.trim() !== siteAccount.user?.nickname) await saveNickname(nickname.value.trim())
        dialog.value?.close()
        emit('notify', t('siteAccount.saved'))
    } catch (cause) {
        error.value = errorMessage(cause)
        if (cause instanceof AccountError && ['login_required', 'account_changed'].includes(cause.code)) void refreshAccount()
        if (cause instanceof AccountError && cause.code === 'password_reauth_required') reauthentication.value = true
        if (cause instanceof AccountError && ['password_already_set', 'credential_account_not_found'].includes(cause.code)) { clearPasswords(); void refreshAccount() }
    } finally { pending.value = '' }
}
onUnmounted(releasePreview)
defineExpose({ open })
</script>

<template>
    <dialog ref="dialog" class="editor-dialog profile-dialog" aria-labelledby="profile-dialog-title" @cancel="pending && $event.preventDefault()" @close="resetDraft">
        <div class="eyebrow">GROOVE ARCHIVE</div>
        <h2 id="profile-dialog-title">{{ t('siteAccount.editProfile') }}</h2>
        <form class="profile-form" @submit.prevent="save">
            <div class="profile-avatar-editor">
                <AccountAvatar class="profile-preview" :src="source" :fallback="initial" />
                <div class="profile-avatar-actions">
                    <button type="button" class="button secondary" :disabled="!!pending || !siteAccount.authenticated" @click="avatarInput?.click()"><Camera :size="15" />{{ t('siteAccount.uploadAvatar') }}</button>
                    <button v-if="source" type="button" class="text-link" :disabled="!!pending || !siteAccount.authenticated" @click="resetAvatar">{{ t('siteAccount.resetAvatar') }}</button>
                </div>
                <input ref="avatarInput" type="file" hidden accept="image/png,image/jpeg,image/webp" :aria-label="t('siteAccount.uploadAvatar')" @change="changeAvatar" />
            </div>
            <p class="profile-avatar-hint">{{ t('siteAccount.avatarHint') }}</p>
            <label><span>{{ t('siteAccount.nickname') }}</span><input v-model="nickname" autocomplete="nickname" maxlength="40" :placeholder="t('siteAccount.nicknamePlaceholder')" :disabled="!!pending || !siteAccount.authenticated" /></label>
            <div class="profile-password-section">
                <button type="button" class="text-link" :disabled="!!pending || !siteAccount.authenticated" :aria-expanded="editingPassword" aria-controls="profile-password-fields" @click="togglePassword"><KeyRound :size="15" />{{ t(editingPassword ? 'siteAccount.cancelPasswordChange' : hasPassword ? 'siteAccount.changePassword' : 'siteAccount.newPassword') }}</button>
                <div v-if="editingPassword" id="profile-password-fields" class="profile-password-fields">
                    <p class="profile-password-note">{{ t(hasPassword ? 'siteAccount.passwordChangeNote' : 'siteAccount.passwordSetupNote') }}</p>
                    <PasswordField v-if="hasPassword" v-model="currentPassword" :label="t('siteAccount.currentPassword')" :min-length="1" :disabled="!!pending || !siteAccount.authenticated" />
                    <PasswordField v-model="newPassword" :label="t('siteAccount.replacementPassword')" :hint="t('siteAccount.passwordHint')" auto-complete="new-password" :disabled="!!pending || !siteAccount.authenticated" />
                    <PasswordField v-model="confirmation" :label="t('siteAccount.confirmPassword')" auto-complete="new-password" :disabled="!!pending || !siteAccount.authenticated" />
                </div>
            </div>
            <p v-if="pending === 'avatar'" class="profile-feedback" role="status"><LoaderCircle class="spin" :size="15" />{{ t('siteAccount.preparingAvatar') }}</p>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <button v-if="reauthentication" type="button" class="text-link" :disabled="!!pending" @click="reauthenticate">{{ t('siteAccount.relogin') }}</button>
            <div class="dialog-actions">
                <button type="button" class="button secondary" :disabled="!!pending" @click="dialog?.close()">{{ t('common.cancel') }}</button>
                <button type="submit" class="button primary" :disabled="!!pending || !changed || !siteAccount.authenticated"><LoaderCircle v-if="pending === 'save'" class="spin" :size="15" />{{ t('siteAccount.saveProfile') }}</button>
            </div>
        </form>
    </dialog>
</template>

<style scoped>
.profile-dialog { max-width: 440px; }
.profile-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; margin-top: 24px; }
.profile-avatar-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
.profile-preview { display: grid; place-items: center; flex-shrink: 0; width: 80px; height: 80px; border-radius: 50%; background: var(--soft-gradient); color: var(--accent); font-size: 30px; font-weight: 700; }
.profile-avatar-actions { display: grid; justify-items: start; gap: 12px; min-width: 0; max-width: 100%; }
.profile-avatar-actions .text-link { font-size: 12px; white-space: normal; text-align: start; }
.profile-avatar-hint { color: var(--muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.profile-form label { margin: 0; gap: 8px; min-width: 0; }
.profile-form input { min-width: 0; font-size: 15px; }
.profile-feedback { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.profile-password-section { display: grid; gap: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
.profile-password-section > .text-link { justify-self: start; white-space: normal; text-align: start; }
.profile-password-fields { display: grid; gap: 18px; min-width: 0; }
.profile-password-note { color: var(--muted); font-size: 12px; line-height: 1.8; }
.profile-form .dialog-actions { margin-top: 2px; }
.profile-form .dialog-actions .button { flex: 1; }
</style>
