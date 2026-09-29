<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from 'lucide-vue-next'
import { songLanguage, theme, uiLanguages, uiLanguage } from '../composables/useSettings'
defineProps<{ count: number; canWrite: boolean; excelBusy: boolean }>()
const emit = defineEmits<{ clear: []; import: []; export: []; template: [] }>()
</script>

<template>
    <section class="panel settings-panel">
        <div class="section-title"><h2>外观与显示</h2></div>
        <div class="setting-row">
            <div>
                <h3>界面主题</h3>
                <p>为你的下一段音乐旅程，挑选合适的底色。</p>
            </div>
            <div class="theme-options">
                <button
                    v-for="option in [
                        {
                            id: 'light',
                            label: '浅色',
                            icon: Sun,
                        },
                        {
                            id: 'dark',
                            label: '深色',
                            icon: Moon,
                        },
                        {
                            id: 'system',
                            label: '跟随系统',
                            icon: Monitor,
                        },
                    ] as const"
                    :key="option.id"
                    :class="{ selected: theme === option.id }"
                    @click="theme = option.id"
                >
                    <component :is="option.icon" :size="21" />
                    <span>{{ option.label }} </span>
                    <Check
                        v-if="theme === option.id"
                        :size="13"
                    />
                </button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>界面语言</h3>
                <p>当前仅预览选择状态，界面仍为简体中文。</p>
            </div>
            <div
                class="segmented ui-settings-options"
                role="group"
                aria-label="界面语言（预览选择）"
            >
                <button
                    v-for="option in uiLanguages"
                    :key="option.id"
                    type="button"
                    :class="{
                        selected: uiLanguage === option.id,
                    }"
                    :aria-pressed="uiLanguage === option.id"
                    @click="uiLanguage = option.id"
                >
                    {{ option.label }}
                </button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>曲目信息语言</h3>
                <p>切换曲名显示语言，不影响搜索与成绩关联。</p>
            </div>
            <div class="segmented">
                <button
                    :class="{ selected: songLanguage === 'ja' }"
                    @click="songLanguage = 'ja'"
                >
                    日本語
                </button>
                <button
                    :class="{ selected: songLanguage === 'en' }"
                    @click="songLanguage = 'en'"
                >
                    English
                </button>
            </div>
        </div>
    </section>
    <section class="panel settings-panel">
        <div class="section-title"><h2>本地数据</h2></div>
        <div class="setting-row">
            <div>
                <h3>Excel 导入与导出</h3>
                <p>导出全部 {{ count }} 条成绩，或按模板批量导入。导入前会检查数据并显示合并预览。</p>
                <p>支持 .xlsx，最大 5 MiB。模板按 BASIC / ADVANCED 预填全部谱面，填写 Score 后自动计算 Rank / RT。</p>
                <p v-if="excelBusy" role="status">正在处理文件，曲绘加载最多等待 20 秒…</p>
            </div>
            <div class="excel-actions">
                <button class="button secondary" :disabled="excelBusy" @click="emit('template')">下载导入模板</button>
                <button class="button secondary" :disabled="excelBusy || !canWrite || !count" @click="emit('export')">导出全部成绩</button>
                <button class="button primary" :disabled="excelBusy || !canWrite" @click="emit('import')">导入 Excel</button>
            </div>
        </div>
        <div class="setting-row">
            <div>
                <h3>清空成绩数据</h3>
                <p>删除本机存储的全部成绩。</p>
            </div>
            <button
                class="button secondary danger-button"
                :disabled="
                    !count || !canWrite || excelBusy
                "
                @click="emit('clear')"
            >
                清空数据
            </button>
        </div>
    </section>
</template>

<style scoped>
.excel-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0; max-width: 360px; }
@media (max-width: 680px) { .excel-actions { justify-content: flex-start; max-width: 100%; } }
</style>
