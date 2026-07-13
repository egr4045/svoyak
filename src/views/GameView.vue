<template>
  <div class="flex flex-col h-screen relative" style="background: radial-gradient(ellipse at top, #0e141e 0%, #05080d 60%, #000 100%)">

    <!-- Шапка -->
    <header class="shrink-0 pt-4 pb-3 px-8 w-full flex items-center justify-between border-b border-hub-border bg-hub-deep/50 backdrop-blur-sm z-20">
      <div class="flex items-center gap-4">
        <h1 class="text-xl font-black tracking-wide text-hub-text uppercase">
          🧠 Своя Игра
        </h1>
        <span v-if="store.isSpectator" class="text-xs font-black uppercase tracking-widest text-hub-text bg-hub-hover border border-hub-border rounded-full px-3 py-1">
          👁 Вы наблюдатель
        </span>
      </div>
      <div class="flex gap-3">
        <button v-if="isHost" @click="store.resetGame" class="hub-btn text-sm">Сброс раунда</button>
        <button @click="leaveRoom" class="hub-btn text-sm !text-hub-negative">Выйти в хаб</button>
      </div>
    </header>

    <!-- Основная зона: доска (всегда вписывается в остаток экрана) -->
    <main class="flex-1 min-h-0 w-full relative">
      <div class="h-full p-4 overflow-hidden">
        <GameBoard />
      </div>
      <ActiveQuestion />
    </main>
    
    <!-- Панель ведущего (докнута над игроками) + панель игроков -->
    <footer class="shrink-0 w-full z-40 flex flex-col gap-2 py-3 px-6 bg-hub-deep/80 border-t border-hub-border backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <HostPanel />
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
import HostPanel from '../components/HostPanel.vue'
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
  platform.returnToHub();
}
</script>
