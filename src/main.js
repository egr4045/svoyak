import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/styles.css'

import App from './App.vue'
import router from './router'
import { bootPlatform } from './platform/boot'

const app = createApp(App)

app.use(createPinia())

// Мост к платформе MyGame Hub (?pt=/join=/spectate=) — ДО установки роутера:
// vue-router захватывает URL при старте навигации и вернул бы стёртый ?pt=
// обратно в адресную строку, а guard успел бы дёрнуть fetchMe со старым токеном
bootPlatform(router).finally(() => {
  app.use(router)
  app.mount('#app')
})
