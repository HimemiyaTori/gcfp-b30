import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { pinia } from './stores'
import './composables/useSettings'
import './style.css'
import './motion.css'
createApp(App).use(pinia).use(i18n).mount('#app')
