<script setup lang="ts">
import { Activity, ChevronsLeft } from 'lucide-vue-next'
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { navigation, type Page } from '../../navigation'
import { uiLanguages, uiLanguage } from '../../composables/useSettings'
import DisplayControls from './DisplayControls.vue'
defineProps<{ page: Page; count: number }>()
const sidebarCollapsed = defineModel<boolean>('collapsed', { required: true })
const { t } = useI18n()
const narrowSidebar = window.matchMedia('(max-width: 960px)')
sidebarCollapsed.value = narrowSidebar.matches
function syncSidebarToViewport(event: MediaQueryListEvent) {
    sidebarCollapsed.value = event.matches
}
onMounted(() => narrowSidebar.addEventListener('change', syncSidebarToViewport))
onUnmounted(() => narrowSidebar.removeEventListener('change', syncSidebarToViewport))
</script>

<template>
    <aside class="sidebar stack">
        <a
            href="#home"
            class="brand row gap-3"
            aria-label="Groove Archive 首页"
            ><span class="brand-mark"><Activity :size="24" /></span>
            <div class="sidebar-copy">
                <strong>GROOVE<span>ARCHIVE</span></strong
                ><small>FUTURE PERFORMERS</small>
            </div></a
        >
        <div class="sidebar-caption sidebar-copy">我的音乐旅程</div>
        <nav class="stack gap-2">
            <a
                v-for="n in navigation"
                :key="n.id"
                :href="`#${n.id}`"
                :class="['nav-item row gap-3', { active: page === n.id }]"
                :aria-label="t(`nav.${n.id}`)"
                :title="sidebarCollapsed ? t(`nav.${n.id}`) : undefined"
                :aria-current="page === n.id ? 'page' : undefined"
                ><component :is="n.icon" :size="19" /><span
                    class="sidebar-copy"
                    >{{ t(`nav.${n.id}`) }}</span
                ><span
                    v-if="n.id === 'scores' && count > 0"
                    class="nav-badge"
                    >{{ count }}</span
                ><span v-if="page === n.id" class="active-dot"></span
            ></a>
        </nav>
        <div class="sidebar-controls stack gap-2">
            <div class="ui-language-control sidebar-copy">
                <span class="ui-language-icon" aria-hidden="true"></span>
                <div
                    class="ui-language-options"
                    role="group"
                    aria-label="界面语言（预览选择）"
                >
                    <button
                        v-for="option in uiLanguages"
                        :key="option.id"
                        type="button"
                        :class="{ selected: uiLanguage === option.id }"
                        :aria-pressed="uiLanguage === option.id"
                        @click="uiLanguage = option.id"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <div class="sidebar-control-row">
                <DisplayControls />
                <button
                    class="sidebar-collapse-control"
                    type="button"
                    :aria-label="
                        sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'
                    "
                    :aria-expanded="!sidebarCollapsed"
                    :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
                    @click="sidebarCollapsed = !sidebarCollapsed"
                >
                    <ChevronsLeft :size="23" />
                </button>
            </div>
        </div>
    </aside>
</template>
