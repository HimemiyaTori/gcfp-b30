import 'virtual:uno.css'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import zhCN from './locales/zh-CN.json'
import './style.css'
import './motion.css'
createApp(App)
    .use(
        createI18n({
            legacy: false,
            locale: 'zh-CN',
            messages: { 'zh-CN': zhCN },
        }),
    )
    .mount('#app')
