import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/styles.css'

import App from './App.vue'
import router from './router'
import { bootPlatform } from './platform/boot'

const app = createApp(App)

app.use(createPinia())

// Шим Node-глобала process для IIFE-сборки SDK (читает process.env.NODE_ENV).
window.process = window.process || { env: {} }
window.process.env = window.process.env || {}
if (!window.process.env.NODE_ENV) window.process.env.NODE_ENV = 'production'

// Грузим vendored SDK динамически, с учётом base (суб-путь /svoyak/) — статический
// абсолютный <script src="/vendor/…"> в index.html не переписывается под base и 404-ит.
function loadSdk() {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = import.meta.env.BASE_URL + 'vendor/mygame-sdk.global.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false) // без SDK игра работает, платформенные фичи скрыты
    document.head.appendChild(s)
  })
}

// Мост к платформе MyGame Hub (?pt=/join=/spectate=) — ДО установки роутера:
// vue-router захватывает URL при старте навигации и вернул бы стёртый ?pt=
// обратно в адресную строку, а guard успел бы дёрнуть fetchMe со старым токеном
loadSdk().finally(() => {
  bootPlatform(router).finally(() => {
    app.use(router)
    app.mount('#app')
  })
})
