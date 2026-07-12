<template>
  <div class="h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
    <div class="panel-glass p-10 max-w-md w-full text-center relative z-10 shadow-[0_24px_48px_rgba(0,0,0,0.55)]">
      <div class="text-6xl mb-6">🧠</div>
      <h1 class="text-3xl font-black mb-4 tracking-wider uppercase text-hub-accent">Своя Игра</h1>

      <p v-if="platform.platformAuthError" class="text-hub-warning text-sm font-bold bg-hub-warning/10 border border-hub-warning/20 rounded-xl p-3 mb-6">
        ⚠ {{ platform.platformAuthError }}
      </p>

      <p class="text-hub-muted mb-8 leading-relaxed">
        Игра запускается из платформы <b class="text-hub-text">MyGame Hub</b> — там ваш профиль,
        друзья, голосовые чаты и приглашения.
      </p>

      <a :href="hubUrl" class="hub-btn-primary block w-full py-4 uppercase tracking-widest text-center hover:scale-[1.02] transition-transform">
        Открыть MyGame Hub
      </a>

      <p class="text-hub-muted/60 text-xs mt-6">Уже в игре? Вернитесь в хаб и нажмите «Играть» на карточке Своей игры.</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { joinIntent } from '../platform/boot'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()

// Прод-адрес хаба (dev можно переопределить через VITE_HUB_URL)
const hubUrl = import.meta.env.VITE_HUB_URL || 'https://mygame-quiz.ru'

onMounted(() => {
  // Если сессия платформы уже есть, лендинг не нужен — уводим по назначению
  if (store.user?.platformId) {
    if (joinIntent.code) router.replace({ name: 'lobby', params: { id: joinIntent.code } })
    else router.replace({ name: 'host' })
  }
})
</script>
