<template>
  <div class="flex flex-col h-dvh relative overflow-hidden" style="background: radial-gradient(ellipse at top, #0e141e 0%, #05080d 60%, #000 100%)">

    <!-- Неон-фон: два дрейфующих блоба (transform-анимация, глушится reduced-motion) -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-32 -left-24 w-[45vw] h-[45vw] rounded-full opacity-[0.07] blur-[110px]"
           style="background: radial-gradient(circle, var(--c-violet), transparent 70%); animation: kf-blob-drift 26s ease-in-out infinite;"></div>
      <div class="absolute -bottom-40 -right-24 w-[40vw] h-[40vw] rounded-full opacity-[0.06] blur-[110px]"
           style="background: radial-gradient(circle, var(--c-cyan), transparent 70%); animation: kf-blob-drift 32s ease-in-out infinite reverse;"></div>
    </div>

    <!-- Шапка -->
    <header class="shrink-0 pt-2 pb-2 md:pt-3 px-3 md:px-8 w-full flex items-center justify-between border-b border-hub-border bg-hub-deep/50 z-20">
      <div class="flex items-center gap-2 md:gap-4 min-w-0">
        <h1 class="text-base md:text-xl font-black tracking-wide uppercase font-display truncate">
          🧠 <span class="text-party-gradient">Своя Игра</span>
        </h1>
        <span v-if="store.isSpectator" class="hidden sm:inline text-xs font-black uppercase tracking-widest text-hub-text bg-hub-hover border border-hub-border rounded-full px-3 py-1">
          👁 Вы наблюдатель
        </span>
      </div>
      <div class="flex gap-2 md:gap-3 shrink-0">
        <button v-if="isHost" @click="store.resetGame" class="hub-btn text-xs md:text-sm">Сброс раунда</button>
        <button @click="leaveRoom" class="hub-btn text-xs md:text-sm !text-hub-negative">Выйти в хаб</button>
      </div>
    </header>

    <!-- Основная зона: доска (всегда вписывается в остаток экрана) -->
    <main class="flex-1 min-h-0 w-full relative">
      <div class="h-full p-2 md:p-4 overflow-hidden">
        <GameBoard />
      </div>
      <ActiveQuestion />
    </main>

    <!-- Панель ведущего (докнута над игроками) + панель игроков.
         Один слой blur на футере, карточки внутри без вложенного blur (перф) -->
    <footer class="shrink-0 w-full z-40 flex flex-col gap-2 py-2 md:py-3 px-2 md:px-6 bg-hub-deep/85 border-t border-hub-border backdrop-blur-md shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <HostPanel />
      <PlayerPanel />
    </footer>

    <EventLog />
    <VoiceBar />
    <FunPanel />
    <EffectsOverlay />

    <!-- Гард соединения: свой сокет отвалился -->
    <div v-if="!store.connected" class="fixed inset-0 z-[120] bg-black/80 flex flex-col items-center justify-center gap-4 anim-fade-in">
      <div class="w-14 h-14 rounded-full border-4 border-hub-accent/30 border-t-hub-accent animate-spin"></div>
      <p class="text-xl font-bold text-hub-text">Переподключение…</p>
      <p v-if="longDisconnect" class="text-sm text-hub-muted max-w-xs text-center">Связь не восстанавливается. Проверьте интернет — игра ждёт вас.</p>
    </div>

    <!-- Гард: ведущий потерял связь (игра без ведущего стоит) -->
    <div v-else-if="hostGone" class="fixed top-14 left-1/2 -translate-x-1/2 z-[110] panel-glass border-hub-warning/60 px-6 py-3 flex items-center gap-3 anim-rise-in">
      <span class="text-2xl animate-pulse">📡</span>
      <div class="text-left">
        <p class="font-bold text-hub-warning">Ведущий потерял связь</p>
        <p class="text-xs text-hub-muted">Ждём возвращения — игра на паузе.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { useCallInvite } from '../platform/useCallInvite'
import GameBoard from '../components/GameBoard.vue'
import PlayerPanel from '../components/PlayerPanel.vue'
import ActiveQuestion from '../components/ActiveQuestion.vue'
import HostPanel from '../components/HostPanel.vue'
import EventLog from '../components/EventLog.vue'
import VoiceBar from '../components/VoiceBar.vue'
import FunPanel from '../components/host/FunPanel.vue'
import EffectsOverlay from '../components/EffectsOverlay.vue'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()

const isHost = computed(() => store.host && store.user && store.host.id === store.user.id)

// Гарды соединения: свой дисконнект (оверлей) и отвал ведущего (баннер)
const hostGone = computed(() => !isHost.value && store.gameStarted && store.host && store.host.connected === false)
const longDisconnect = ref(false)
let discTimer = null
watch(() => store.connected, (ok) => {
  clearTimeout(discTimer)
  if (!ok) discTimer = setTimeout(() => { longDisconnect.value = true }, 10000)
  else longDisconnect.value = false
})

onMounted(() => {
  if (!store.roomCode) {
    store.roomCode = route.params.id;
  }
  if (!store.connected) {
    store.initSocket();
  }
})

// F5 прямо в игре: голос переподключаем только после первого gameStateUpdated,
// когда isSpectator уже отражает реальную роль (иначе наблюдатель войдёт с включённым микрофоном)
const voiceJoined = ref(false)
watch(() => store.host, (h) => {
  if (h && !voiceJoined.value) {
    voiceJoined.value = true
    platform.joinVoice(store.roomCode, { spectator: store.isSpectator })
    platform.setActivity(store.roomCode)
  }
}, { immediate: true })
// Повысили из наблюдателя в игрока — авто-включаем микрофон
watch(() => store.isSpectator, (isSpec, was) => {
  if (was && !isSpec && platform.voiceConnected) platform.setMic(true)
})

// Опоздавшие в звонок подхватываются и в середине игры
useCallInvite(store, platform, isHost)

function leaveRoom() {
  store.logout();
  platform.returnToHub();
}
</script>
