<script setup lang="ts">
import { Check, ClipboardPaste, Cloud, ExternalLink, Images, KeyRound, LoaderCircle, Lock, ShieldAlert } from 'lucide-vue-next'
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedSuccess from '../common/AnimatedSuccess.vue'
import { motionTiming } from '../common/motion'
import { album, beginBinding, finishBinding, refreshBinding } from '../../core/album/controller'
import { errorMessage } from '../../i18n'
const emit = defineEmits<{ bound: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const step = ref<'notice' | 'login' | 'success'>('notice')
const agreed = ref(false)
const authUrl = ref('')
const preparing = ref(false)
const pending = ref(false)
const callback = ref('')
const error = ref('')
const nickname = ref('')
const notices = [
    { id: 'unofficial', icon: ShieldAlert },
    { id: 'thirdParty', icon: Cloud },
    { id: 'storage', icon: KeyRound },
    { id: 'scope', icon: Images },
] as const
const linkValid = computed(() => /^npf[0-9a-z]+:\/\/auth\b/i.test(callback.value.trim()))
let timer: ReturnType<typeof setTimeout> | undefined
function open() {
    clearTimeout(timer)
    step.value = 'notice'
    agreed.value = false
    authUrl.value = ''
    callback.value = ''
    error.value = ''
    dialog.value?.showModal()
    // 进入绑定流程时查询一次服务状态，并恢复丢失的已绑定标记
    void refreshBinding()
        .then((binding) => {
            if (binding.status === 'active' && step.value === 'notice') close()
        })
        .catch(() => {})
}
function close() {
    clearTimeout(timer)
    dialog.value?.close()
}
function closed() {
    callback.value = ''
    if (step.value !== 'success') return
    step.value = 'notice'
    emit('bound')
}
async function prepare() {
    preparing.value = true
    error.value = ''
    authUrl.value = ''
    try {
        authUrl.value = (await beginBinding()).url
    } catch (cause) {
        error.value = errorMessage(cause)
    } finally {
        preparing.value = false
    }
}
function proceed() {
    if (!agreed.value) return
    step.value = 'login'
    void prepare()
}
async function paste() {
    try {
        callback.value = (await navigator.clipboard.readText()).trim()
    } catch {
        error.value = t('bind.pasteFailed')
    }
}
async function complete() {
    if (!linkValid.value || pending.value) return
    pending.value = true
    error.value = ''
    try {
        const binding = await finishBinding(callback.value.trim())
        callback.value = ''
        nickname.value = binding.nickname || t('account.nintendo')
        step.value = 'success'
        timer = setTimeout(close, motionTiming.successHold * 2 + motionTiming.successCircle + motionTiming.successCheck)
    } catch (cause) {
        error.value = errorMessage(cause)
    } finally {
        pending.value = false
    }
}
onUnmounted(() => clearTimeout(timer))
defineExpose({ open })
</script>

<template>
    <dialog
        ref="dialog"
        class="editor-dialog bind-dialog"
        aria-labelledby="bind-title"
        @cancel="pending && $event.preventDefault()"
        @close="closed"
    >
        <div v-if="step === 'success'" class="import-success" role="status">
            <AnimatedSuccess />
            <h2 id="bind-title">{{ t('bind.success') }}</h2>
            <p>{{ nickname }}</p>
            <small>{{ t('bind.successNote') }}</small>
            <button class="button primary bind-done" @click="close">{{ t('bind.done') }}</button>
        </div>
        <template v-else>
            <div class="eyebrow">NINTENDO ACCOUNT</div>
            <h2 id="bind-title">{{ t('bind.title') }}</h2>
            <ol class="bind-stepper">
                <li :class="step === 'notice' ? 'current' : 'done'" :aria-current="step === 'notice' ? 'step' : undefined">
                    <span><Check v-if="step !== 'notice'" :size="12" /><template v-else>1</template></span>{{ t('bind.steps.notice') }}
                </li>
                <li :class="{ current: step === 'login' }" :aria-current="step === 'login' ? 'step' : undefined">
                    <span>2</span>{{ t('bind.steps.login') }}
                </li>
            </ol>
            <template v-if="step === 'notice'">
                <p class="muted">{{ t('bind.noticeIntro') }}</p>
                <ul class="bind-notices">
                    <li v-for="notice in notices" :key="notice.id">
                        <span class="bind-icon"><component :is="notice.icon" :size="18" /></span>
                        <div>
                            <h3>{{ t(`bind.notices.${notice.id}.title`) }}</h3>
                            <p>{{ t(`bind.notices.${notice.id}.text`) }}</p>
                        </div>
                    </li>
                </ul>
                <p v-if="album.configured === false" class="error" role="alert">{{ t('account.notConfigured') }}</p>
                <label class="bind-consent">
                    <input v-model="agreed" type="checkbox" />
                    <span>{{ t('bind.consent') }}</span>
                </label>
                <div class="dialog-actions">
                    <a
                        class="text-link bind-source"
                        href="https://github.com/himemiyatori/gcfp-b30"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ t('account.source') }}</a
                    >
                    <button class="button secondary" @click="close">{{ t('common.cancel') }}</button>
                    <button class="button primary" :disabled="!agreed || album.configured === false" @click="proceed">
                        {{ t('bind.agree') }}
                    </button>
                </div>
            </template>
            <template v-else>
                <p class="muted">{{ t('bind.loginIntro') }}</p>
                <ol class="bind-guide">
                    <li>
                        <span class="bind-index">1</span>
                        <div>
                            <h3>{{ t('bind.guide.login.title') }}</h3>
                            <p>{{ t('bind.guide.login.text') }}</p>
                            <div class="bind-login">
                                <a
                                    v-if="authUrl"
                                    class="button primary"
                                    :href="authUrl"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    >{{ t('bind.openLogin') }}<ExternalLink :size="15"
                                /></a>
                                <button v-else class="button primary" disabled>
                                    <LoaderCircle v-if="preparing" class="spin" :size="15" />
                                    {{ preparing ? t('bind.preparing') : t('bind.openLogin') }}
                                </button>
                                <button type="button" class="text-link" :disabled="preparing" @click="prepare">
                                    {{ t('bind.regenerate') }}
                                </button>
                            </div>
                        </div>
                    </li>
                    <li>
                        <span class="bind-index">2</span>
                        <div>
                            <h3>{{ t('bind.guide.copy.title') }}</h3>
                            <p>{{ t('bind.guide.copy.text') }}</p>
                        </div>
                    </li>
                    <li>
                        <span class="bind-index">3</span>
                        <div>
                            <h3>{{ t('bind.guide.paste.title') }}</h3>
                            <p>{{ t('bind.guide.paste.text') }}</p>
                            <div class="bind-field between">
                                <label for="bind-callback">{{ t('bind.callback') }}</label>
                                <button type="button" class="text-link" @click="paste">
                                    <ClipboardPaste :size="13" />{{ t('bind.paste') }}
                                </button>
                            </div>
                            <textarea
                                id="bind-callback"
                                v-model="callback"
                                rows="3"
                                autocomplete="off"
                                spellcheck="false"
                                placeholder="npf71b963c1b7b6d119://auth#session_state=…"
                            />
                            <p v-if="callback.trim() && !linkValid" class="warning">{{ t('bind.invalidLink') }}</p>
                        </div>
                    </li>
                </ol>
                <p class="bind-safety"><Lock :size="14" />{{ t('bind.safety') }}</p>
                <p v-if="error" class="error" role="alert">{{ error }}</p>
                <div class="dialog-actions">
                    <button class="button secondary" :disabled="pending" @click="step = 'notice'">
                        {{ t('bind.back') }}
                    </button>
                    <button class="button primary" :disabled="!linkValid || !authUrl || pending" @click="complete">
                        {{ pending ? t('bind.finishing') : t('bind.finish') }}
                    </button>
                </div>
            </template>
        </template>
    </dialog>
</template>

<style scoped>
.bind-dialog {
    width: min(600px, calc(100% - 32px));
}
.bind-stepper {
    display: flex;
    gap: 8px;
    list-style: none;
    padding: 0;
    margin: 18px 0 0;
}
.bind-stepper li {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--muted);
    font-size: 12px;
}
.bind-stepper span {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1px solid var(--line);
    background: var(--panel);
    font-size: 11px;
}
.bind-stepper .current {
    border-color: var(--accent);
    background: var(--soft);
    color: var(--accent);
}
.bind-stepper .current span,
.bind-stepper .done span {
    border-color: transparent;
    background: var(--brand-gradient);
    color: #172039;
}
.bind-notices,
.bind-guide {
    list-style: none;
    padding: 0;
    margin: 0;
}
.bind-notices {
    display: grid;
    gap: 10px;
}
.bind-notices li {
    display: flex;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--field);
}
.bind-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--soft);
    color: var(--accent);
}
.bind-notices h3,
.bind-guide h3 {
    font-size: 13px;
    font-weight: 600;
}
.bind-notices p,
.bind-guide p {
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--muted);
}
.bind-guide .warning {
    color: #b58349;
}
.bind-consent {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    padding: 13px 15px;
    border-radius: 9px;
    background: var(--soft-gradient);
    line-height: 1.7;
    cursor: pointer;
}
.bind-consent input {
    width: 16px;
    height: 16px;
    margin: 3px 0 0;
    flex-shrink: 0;
    accent-color: var(--accent);
}
.bind-source {
    margin-right: auto;
}
.bind-guide > li {
    position: relative;
    display: flex;
    gap: 14px;
    padding-bottom: 22px;
}
.bind-guide > li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 13px;
    top: 32px;
    bottom: 6px;
    width: 1px;
    background: var(--line);
}
.bind-guide > li > div {
    flex: 1;
    min-width: 0;
    padding-top: 4px;
}
.bind-index {
    width: 27px;
    height: 27px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--accent);
    font-size: 12px;
    font-weight: 650;
}
.bind-login {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 12px;
}
.bind-field {
    gap: 10px;
    margin-top: 12px;
    margin-bottom: 8px;
    font-size: 12px;
}
.bind-field label {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
}
.bind-dialog textarea {
    display: block;
    width: 100%;
    min-height: 78px;
    resize: vertical;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: inherit;
    font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
    word-break: break-all;
}
.bind-dialog textarea:focus-visible {
    outline: 3px solid #68bce9;
    outline-offset: 2px;
}
.bind-safety {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--field);
    color: var(--muted);
    font-size: 11px;
    line-height: 1.8;
}
.bind-safety svg {
    margin-top: 3px;
}
.bind-done {
    margin-top: 10px;
}
@media (--mobile) {
    .bind-dialog .dialog-actions {
        flex-wrap: wrap;
    }
    .bind-source {
        width: 100%;
    }
}
</style>
