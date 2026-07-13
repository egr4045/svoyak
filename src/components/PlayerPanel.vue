<template>
  <div class="flex flex-col items-center gap-2 w-full">

    <!-- Карточки игроков -->
    <div class="flex justify-center gap-4 md:gap-8 w-full flex-wrap">
      <div v-for="player in store.players" :key="player.id"
           class="flex flex-col items-center transition-all duration-300 relative"
           @contextmenu="onPlayerContextMenu(player, $event, 'player')"
           :class="{
             'scale-110 z-20': store.answeringPlayerId === player.id,
             'opacity-50 scale-95 grayscale-[0.3]': store.answeringPlayerId !== null && store.answeringPlayerId !== player.id
           }">

        <!-- Индикатор статуса (ВЫБОР / ОТВЕТ) -->
        <div v-if="store.selectingPlayerId === player.id && store.questionStatus === 'idle'"
             class="absolute -top-4 w-full flex justify-center z-30 animate-bounce">
             <span class="bg-hub-warning text-black text-[9px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-tighter">Выбор</span>
        </div>
        <div v-if="store.answeringPlayerId === player.id"
             class="absolute -top-4 w-full flex justify-center z-30">
             <span class="bg-hub-accent text-white text-[9px] font-black px-3 py-1 rounded-full shadow-[0_0_15px_rgba(73,160,90,0.5)] uppercase tracking-tighter animate-pulse">Отвечает</span>
        </div>

        <!-- Основная карточка -->
        <div class="bg-hub-panel border-2 rounded-2xl p-2 flex flex-col items-center shadow-2xl relative transition-all backdrop-blur-md"
             :style="{ width: cardSize + 'px' }"
             :class="store.answeringPlayerId === player.id ? 'border-hub-accent shadow-[0_0_25px_rgba(73,160,90,0.3)]' : 'border-hub-border'">

          <!-- Аватар + живая камера из звонка -->
          <div :style="{ width: avatarSize + 'px', height: avatarSize + 'px' }"
               class="bg-hub-deep rounded-xl mb-1 flex items-center justify-center relative overflow-hidden transition-all"
               :class="voiceOf(player)?.speaking ? 'ring-2 ring-hub-accent shadow-[0_0_12px_rgba(73,160,90,0.5)]' : 'ring-1 ring-hub-border'">
             <img v-if="player.avatar && store.avatarIsImage(player.avatar)" :src="store.getAvatarUrl(player.avatar)" class="w-full h-full object-cover">
             <span v-else-if="player.avatar" :class="avatarSize < 60 ? 'text-2xl' : 'text-4xl'">{{ player.avatar }}</span>
             <MonitorPlay v-else :class="avatarSize < 60 ? 'w-5 h-5' : 'w-8 h-8'" class="text-hub-border" />
             <PlayerVideo v-if="player.platformId && voiceOf(player)?.camOn" :account-id="player.platformId" />
             <div v-if="voiceOf(player) && !voiceOf(player).micOn" class="absolute bottom-0.5 right-0.5 z-20 text-[10px] bg-hub-deep/80 rounded px-0.5" title="Микрофон выключен">🔇</div>
             <div v-if="store.answeringPlayerId === player.id" class="absolute inset-0 bg-gradient-to-t from-hub-accent/30 to-transparent"></div>
          </div>

          <!-- Текст -->
          <div class="text-center w-full max-w-[100px]">
            <div class="text-[10px] md:text-xs font-black uppercase text-hub-muted truncate mb-1">{{ player.name }}</div>
            <div :class="['text-xl md:text-2xl font-black', player.score > 0 ? 'text-hub-warning' : player.score < 0 ? 'text-hub-negative' : 'text-hub-text']">
              {{ player.score }}
            </div>
          </div>

          <!-- Быстрые контролы ведущего (кик/профиль — по правому клику) -->
          <div v-if="isHost" class="flex flex-col gap-1 mt-2 pt-2 border-t border-hub-border w-full">
            <div class="flex gap-1 items-center justify-center">
               <input type="number" v-model.number="customAmounts[player.id]"
                        class="w-10 bg-hub-deep text-[10px] py-1 px-1 rounded border border-hub-border outline-none font-bold text-center text-hub-text" />
               <button @click="store.adjustScore(player.id, customAmounts[player.id] || 0)" class="w-6 h-6 bg-hub-accent/20 hover:bg-hub-accent hover:text-white text-[10px] rounded border border-hub-accent/30 transition-colors">+</button>
               <button @click="store.adjustScore(player.id, -(customAmounts[player.id] || 0))" class="w-6 h-6 bg-hub-negative/20 hover:bg-hub-negative hover:text-white text-[10px] rounded border border-hub-negative/30 transition-colors">−</button>
            </div>
            <button v-if="store.questionStatus === 'idle' && store.selectingPlayerId !== player.id"
                     @click="store.setSelectingPlayer(player.id)"
                     class="text-[8px] font-black text-hub-accent hover:text-white uppercase px-2">Право выбора</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Полоса наблюдателей -->
    <div v-if="store.spectators.length" class="flex items-center gap-2 mt-1 hub-card px-3 py-1.5">
      <span class="text-[10px] font-black uppercase tracking-widest text-hub-muted">👁 {{ store.spectators.length }} набл.</span>
      <div v-for="s in store.spectators" :key="s.id"
           class="w-7 h-7 bg-hub-deep rounded-lg overflow-hidden border flex items-center justify-center text-[10px] font-bold text-hub-muted cursor-default"
           :class="voiceOf(s)?.speaking ? 'border-hub-accent' : 'border-hub-border'"
           :title="s.name"
           @contextmenu="onPlayerContextMenu(s, $event, 'spectator')">
        <img v-if="s.avatar && store.avatarIsImage(s.avatar)" :src="store.getAvatarUrl(s.avatar)" class="w-full h-full object-cover">
        <span v-else-if="s.avatar">{{ s.avatar }}</span>
        <span v-else>{{ s.name.charAt(0).toUpperCase() }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { showParticipantMenu } from '../platform/contextMenu'
import PlayerVideo from './PlayerVideo.vue'
import { MonitorPlay } from 'lucide-vue-next'

const store = useGameStore()
const platform = usePlatformStore()
const isHost = computed(() => store.host?.id === store.user?.id)

function voiceOf(p) {
  return p?.platformId ? platform.participantFor(p.platformId) : null
}
function onPlayerContextMenu(target, event, role) {
  showParticipantMenu(target, event, role)
}

const cardSize = computed(() => {
  const count = store.players.length
  if (count <= 4) return 140
  if (count <= 6) return 120
  if (count <= 8) return 100
  return 90
})
const avatarSize = computed(() => {
  const count = store.players.length
  if (count <= 4) return 80
  if (count <= 6) return 70
  if (count <= 8) return 60
  return 50
})

const customAmounts = reactive({})
store.players.forEach(p => { customAmounts[p.id] = 100 })
watch(() => store.players, (players) => {
  players.forEach(p => { if (customAmounts[p.id] === undefined) customAmounts[p.id] = 100 })
}, { deep: true })
</script>

<style scoped>
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; appearance: textfield; }
</style>
