<script setup lang="ts">
import { Check, CircleAlert, Gamepad2, Info, LoaderCircle, RefreshCw } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AnimatedProgress from '../common/AnimatedProgress.vue'
import AccountAvatar from '../common/AccountAvatar.vue'
import NintendoBindDialog from './NintendoBindDialog.vue'
import { album, retryable, retryFailed, scan, unbind } from '../../core/album/controller'
const emit = defineEmits<{ notify: [message: string, title?: string] }>()
const { t, locale } = useI18n()
const bindDialog = ref<InstanceType<typeof NintendoBindDialog>>()
const unbindDialog = ref<HTMLDialogElement>()
const unbinding = ref(false)
const unbindError = ref('')
const now = ref(Date.now())
const features = ['auto', 'local', 'private'] as const
const bound = computed(() => !!album.state.accountId)
const name = computed(() => album.state.nickname || t('account.nintendo'))
const initial = computed(() => Array.from(name.value)[0]?.toUpperCase() ?? 'N')
const cooldown = computed(() => Math.max(0, Math.ceil((album.state.nextAllowedAt - now.value) / 1000)))
const done = computed(() => album.jobs.filter((job) => !['queued', 'running'].includes(job.status)).length)
const failures = computed(() =>
    album.items.filter((item) => item.datasetEpoch === album.state.datasetEpoch && retryable.has(item.stage)),
)
const format = (time?: number | null) =>
    time ? new Date(time).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : t('account.never')
let ticker: ReturnType<typeof setInterval> | undefined
watch(
    () => album.state.nextAllowedAt,
    (next) => {
        clearInterval(ticker)
        now.value = Date.now()
        if (next <= now.value) return
        ticker = setInterval(() => {
            now.value = Date.now()
            if (now.value >= next) clearInterval(ticker)
        }, 1000)
    },
    { immediate: true },
)
onUnmounted(() => clearInterval(ticker))
function openUnbind() {
    unbindError.value = ''
    unbindDialog.value?.showModal()
}
async function confirmUnbind() {
    unbinding.value = true
    unbindError.value = ''
    try {
        await unbind()
        unbindDialog.value?.close()
        emit('notify', t('account.unbound'))
    } catch (cause) {
        unbindError.value = cause instanceof Error ? cause.message : t('album.failed')
    } finally {
        unbinding.value = false
    }
}
</script>

<template>
    <section class="panel settings-panel account-panel">
        <div class="section-title between">
            <h2>{{ t('account.section') }}</h2>
            <span class="micro-label">NINTENDO ACCOUNT</span>
        </div>
        <div v-if="!bound" class="account-intro">
            <span class="account-mark" aria-hidden="true"><Gamepad2 :size="26" /></span>
            <div class="account-copy">
                <h3>{{ t('account.nintendo') }}</h3>
                <p>{{ t('account.unboundDescription') }}</p>
                <ul class="account-features">
                    <li v-for="feature in features" :key="feature">
                        <Check :size="13" />{{ t(`account.features.${feature}`) }}
                    </li>
                </ul>
            </div>
            <button class="button primary" @click="bindDialog?.open()">{{ t('account.bind') }}</button>
        </div>
        <template v-else>
            <div class="account-intro">
                <AccountAvatar class="account-avatar" :src="album.state.avatarUrl" :fallback="initial" />
                <div class="account-copy">
                    <h3 class="row gap-2">
                        <span class="account-name">{{ name }}</span>
                        <span class="account-status"><span></span>{{ t('account.bound') }}</span>
                    </h3>
                    <p>{{ t('account.boundDescription') }}</p>
                </div>
                <div class="account-actions">
                    <button
                        class="button primary"
                        :disabled="album.busy || cooldown > 0 || album.configured === false"
                        @click="scan(true)"
                    >
                        <LoaderCircle v-if="album.busy" class="spin" :size="15" /><RefreshCw v-else :size="15" />
                        {{
                            album.busy
                                ? t('account.updating')
                                : cooldown
                                  ? t('account.cooldown', { seconds: cooldown })
                                  : t('account.update')
                        }}
                    </button>
                    <button class="button secondary danger-button" @click="openUnbind">
                        {{ t('account.unbind') }}
                    </button>
                </div>
            </div>
            <dl class="account-stats">
                <div>
                    <dt>{{ t('account.stats.media') }}</dt>
                    <dd>{{ album.state.mediaCount ?? '—' }}</dd>
                </div>
                <div>
                    <dt>{{ t('account.stats.imported') }}</dt>
                    <dd>{{ album.importedCount }}</dd>
                </div>
                <div>
                    <dt>{{ t('account.stats.lastUpdate') }}</dt>
                    <dd class="account-time">{{ format(album.state.lastCheckedAt) }}</dd>
                </div>
            </dl>
            <div v-if="album.busy" class="account-progress" role="status">
                <div class="between">
                    <span class="row gap-2">
                        <LoaderCircle class="spin" :size="15" />
                        {{ album.phase === 'importing' ? t('sync.banner.importing') : t('sync.banner.checking') }}
                    </span>
                    <span v-if="album.phase === 'importing'" class="muted">
                        {{ t('ocr.progress', { done, total: album.jobs.length }) }}
                    </span>
                </div>
                <AnimatedProgress v-if="album.phase === 'importing'" :value="done" :max="album.jobs.length" />
            </div>
            <details v-else-if="failures.length" class="account-failures">
                <summary>{{ t('account.failures', { count: failures.length }, failures.length) }}</summary>
                <ul>
                    <li v-for="item in failures" :key="item.mediaId">
                        <span>{{ format(item.capturedAt) }}</span>
                        <small v-if="item.reason">{{ item.reason }}</small>
                    </li>
                </ul>
                <button class="button secondary" :disabled="cooldown > 0" @click="retryFailed()">
                    {{ t('account.retry') }}
                </button>
            </details>
        </template>
        <p v-if="album.error" class="error account-alert" role="alert"><CircleAlert :size="15" />{{ album.error }}</p>
        <p v-if="bound && album.configured === false" class="warning account-alert">{{ t('account.notConfigured') }}</p>
        <p v-if="bound" class="account-note"><Info :size="14" />{{ t('account.note') }}</p>
    </section>
    <NintendoBindDialog ref="bindDialog" @bound="scan(true)" />
    <dialog
        ref="unbindDialog"
        class="editor-dialog"
        aria-labelledby="unbind-title"
        @cancel="unbinding && $event.preventDefault()"
    >
        <h2 id="unbind-title">{{ t('account.unbindTitle') }}</h2>
        <p class="muted">{{ t('account.unbindDescription') }}</p>
        <p v-if="unbindError" class="error" role="alert">{{ unbindError }}</p>
        <div class="dialog-actions">
            <button class="button secondary" :disabled="unbinding" @click="unbindDialog?.close()">
                {{ t('common.cancel') }}
            </button>
            <button class="button primary danger-button" :disabled="unbinding" @click="confirmUnbind">
                {{ unbinding ? t('account.unbindPending') : t('account.unbindConfirm') }}
            </button>
        </div>
    </dialog>
</template>

<style scoped>
.account-intro {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 26px;
}
.account-mark,
.account-avatar {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
}
.account-mark {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--soft-gradient);
    color: var(--accent);
}
.account-avatar {
    border-radius: 50%;
    background: var(--brand-gradient);
    box-shadow: 0 4px 14px #679aeb33;
    color: #172039;
    font-size: 22px;
    font-weight: 700;
}
.account-copy {
    flex: 1;
    min-width: 0;
}
.account-copy h3 {
    flex-wrap: wrap;
    font-size: 15px;
    font-weight: 650;
}
.account-name {
    overflow-wrap: anywhere;
}
.account-copy p {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--muted);
}
.account-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 20px;
    background: color-mix(in srgb, #2fbf71 14%, var(--panel));
    color: #1f8a53;
    font-size: 11px;
    font-weight: 500;
}
:global(.dark) .account-status {
    color: #6ad9a0;
}
.account-status span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}
.account-features {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    font-size: 12px;
}
.account-features li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.account-features svg {
    color: var(--accent);
}
.account-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    flex-shrink: 0;
}
.account-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0 26px 24px;
}
.account-stats div {
    min-width: 0;
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--field);
}
.account-stats dt {
    font-size: 11px;
    color: var(--muted);
}
.account-stats dd {
    margin: 8px 0 0;
    font-size: 24px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}
.account-stats .account-time {
    margin-top: 12px;
    font-size: 14px;
    line-height: 1.6;
}
.account-progress {
    display: grid;
    gap: 10px;
    margin: 0 26px 24px;
    padding: 14px 16px;
    border-radius: 10px;
    background: var(--soft);
    font-size: 13px;
}
.account-progress svg {
    color: var(--accent);
}
.account-failures {
    margin: 0 26px 24px;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 12px;
}
.account-failures summary {
    cursor: pointer;
    color: #b58349;
    font-weight: 600;
}
.account-failures ul {
    max-height: 240px;
    overflow: auto;
    list-style: none;
    padding: 0;
    margin: 10px 0 12px;
}
.account-failures li {
    padding: 10px 0;
    border-top: 1px solid var(--line);
    line-height: 1.7;
}
.account-failures small {
    color: var(--muted);
    overflow-wrap: anywhere;
}
.account-alert {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 26px 20px;
}
.account-alert svg,
.account-note svg {
    margin-top: 3px;
}
.account-note {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 16px 26px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
    line-height: 1.8;
}
@media (max-width: 680px) {
    .account-intro {
        flex-wrap: wrap;
        gap: 14px;
        padding: 22px 19px;
    }
    .account-intro > .button,
    .account-actions {
        width: 100%;
    }
    .account-actions .button {
        flex: 1;
    }
    .account-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 0 19px 20px;
    }
    .account-stats div:last-child {
        grid-column: 1 / -1;
    }
    .account-progress,
    .account-failures {
        margin-inline: 19px;
    }
    .account-alert {
        margin-inline: 19px;
    }
    .account-note {
        padding-inline: 19px;
    }
}
</style>
