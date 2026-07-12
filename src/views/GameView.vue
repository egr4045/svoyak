<template>
  <div class="flex flex-col h-screen relative bg-slate-950" style="background: radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)">

    <!-- Шапка -->
    <header class="shrink-0 pt-4 pb-3 px-8 w-full flex items-center justify-between border-b border-blue-900/30 bg-black/30 backdrop-blur-sm z-20">
      <div class="flex items-center gap-4">
        <h1 class="text-xl font-bold tracking-wide text-slate-100 uppercase">
          Своя Игра <span class="text-blue-500/50 ml-2">|</span>
          <span class="text-base font-medium text-amber-500 ml-2">{{ store.roomCode }}</span>
        </h1>
        <span v-if="store.isSpectator" class="text-xs font-black uppercase tracking-widest text-slate-300 bg-slate-800 border border-slate-600 rounded-full px-3 py-1">
          👁 Вы наблюдатель
        </span>
      </div>
      <div class="flex gap-3">
        <button v-if="isHost" @click="store.resetGame"
                class="py-1.5 px-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700 text-slate-400 text-sm font-medium transition-colors">
          Сброс раунда
        </button>
        <button @click="leaveRoom" class="py-1.5 px-3 rounded-lg border border-red-900/50 text-red-500 hover:bg-red-900/20 text-sm font-medium transition-colors">
          Покинуть игру
        </button>
      </div>
    </header>

    <!-- Основная зона: доска (всегда вписывается в остаток экрана) -->
    <main class="flex-1 min-h-0 w-full relative">
      <div class="h-full p-4 overflow-hidden">
        <GameBoard />
      </div>
      <ActiveQuestion />
    </main>
    
    <!-- Панель игроков: естественно внизу -->
    <footer class="shrink-0 w-full z-30 py-3 px-6 bg-slate-900/80 border-t border-indigo-900/30 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <PlayerPanel />
    </footer>

    <EventLog />
    <VoiceBar />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import GameBoard from '../components/GameBoard.vue'
import PlayerPanel from '../components/PlayerPanel.vue'
import ActiveQuestion from '../components/ActiveQuestion.vue'
import EventLog from '../components/EventLog.vue'
import VoiceBar from '../components/VoiceBar.vue'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()

const isHost = computed(() => store.host && store.user && store.host.id === store.user.id)

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

function leaveRoom() {
  store.logout();
  router.push({ name: 'home' });
}
</script>
