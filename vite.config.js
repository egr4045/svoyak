import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
// base: в проде игру отдаёт шлюз хаба на суб-пути (VITE_BASE_PATH=/svoyak/),
// иначе '/'. Все клиентские URL (ассеты, API_URL, socket.io, vendored SDK)
// производны от import.meta.env.BASE_URL, чтобы работать под префиксом.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
