<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PasswordInput, usePasswordInput } from '@ark-ui/vue/password-input'
import { Eye, EyeOff } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
    label: string
    hint?: string
    autoComplete?: 'current-password' | 'new-password'
    disabled?: boolean
    minLength?: number
}>(), { autoComplete: 'current-password', disabled: false, minLength: 8 })
const value = defineModel<string>({ required: true })
const { t } = useI18n()
const hintId = useId()
const input = usePasswordInput(computed(() => ({
    autoComplete: props.autoComplete,
    disabled: props.disabled,
    required: true,
    translations: { visibilityTrigger: (visible: boolean) => t(visible ? 'siteAccount.hidePassword' : 'siteAccount.showPassword') },
})))
watch(value, next => { if (!next) input.value.setVisible(false) })
</script>

<template>
    <PasswordInput.RootProvider class="password-field" :value="input">
        <PasswordInput.Label>{{ label }}</PasswordInput.Label>
        <PasswordInput.Control class="password-control">
            <PasswordInput.Input as-child>
                <input v-model="value" :minlength="minLength" maxlength="128" :aria-describedby="hint ? hintId : undefined" />
            </PasswordInput.Input>
            <!-- 为组件补充键盘操作，显隐状态由 Ark UI 管理 -->
            <PasswordInput.VisibilityTrigger class="password-visibility" :tabindex="0" @keydown.enter.prevent="input.toggleVisible()" @keydown.space.prevent="input.toggleVisible()">
                <PasswordInput.Indicator>
                    <EyeOff :size="18" />
                    <template #fallback><Eye :size="18" /></template>
                </PasswordInput.Indicator>
            </PasswordInput.VisibilityTrigger>
        </PasswordInput.Control>
        <small v-if="hint" :id="hintId" class="password-hint">{{ hint }}</small>
    </PasswordInput.RootProvider>
</template>

<style scoped>
.password-field { display: grid; gap: 8px; min-width: 0; }
.password-field label { margin: 0; font-size: 13px; }
.password-control { position: relative; }
.password-control input { width: 100%; min-width: 0; padding-inline-end: 48px; font-size: 15px; }
.password-control input::-ms-reveal { display: none; }
.password-visibility { position: absolute; inset-block: 1px; right: 1px; display: grid; place-items: center; width: 42px; padding: 0; border-radius: 5px; background: transparent; color: var(--muted); }
.password-visibility:hover:not(:disabled) { color: var(--accent); }
.password-visibility :deep([data-part='indicator']) { display: flex; }
.password-hint { color: var(--muted); font-size: 12px; }
</style>
