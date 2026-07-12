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
             <span class="bg-amber-500 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-lg border border-amber-300 uppercase tracking-tighter">Выбор</span>
        </div>
        
        <div v-if="store.answeringPlayerId === player.id"
             class="absolute -top-4 w-full flex justify-center z-30">
             <span class="bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-300 uppercase tracking-tighter animate-pulse">Отвечает</span>
        </div>

        <!-- Эмодзи-реакция -->
        <Transition name="reaction">
          <div v-if="store.reactions[player.id]"
               class="absolute -top-12 left-1/2 -translate-x-1/2 z-40 text-4xl drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
            {{ store.reactions[player.id] }}
          </div>
        </Transition>

        <!-- Основная карточка -->
        <div class="bg-slate-800/80 border-2 rounded-2xl p-2 flex flex-col items-center shadow-2xl relative transition-all"
             :style="{ width: cardSize + 'px' }"
             :class="store.answeringPlayerId === player.id ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : 'border-slate-700/50'">
          
          <!-- Аватарка (Большая) + живая камера из звонка -->
          <div :style="{ width: avatarSize + 'px', height: avatarSize + 'px' }"
               class="bg-slate-900 rounded-xl mb-1 flex items-center justify-center relative overflow-hidden transition-all"
               :class="voiceOf(player)?.speaking ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'ring-1 ring-slate-700'">
             <img v-if="player.avatar" :src="store.getAvatarUrl(player.avatar)" class="w-full h-full object-cover">
             <MonitorPlay v-else :class="avatarSize < 60 ? 'w-5 h-5' : 'w-8 h-8'" class="text-slate-700" />
             <PlayerVideo v-if="player.platformId && voiceOf(player)?.camOn" :account-id="player.platformId" />
             <div v-if="voiceOf(player) && !voiceOf(player).micOn" class="absolute bottom-0.5 right-0.5 z-20 text-[10px] bg-slate-950/80 rounded px-0.5" title="Микрофон выключен">🔇</div>
             <div v-if="store.answeringPlayerId === player.id" class="absolute inset-0 bg-gradient-to-t from-emerald-500/30 to-transparent"></div>
          </div>

          <!-- Текст -->
          <div class="text-center w-full max-w-[100px]">
            <div class="text-[10px] md:text-xs font-black uppercase text-slate-400 truncate mb-1">{{ player.name }}</div>
            <div :class="['text-xl md:text-2xl font-black', player.score > 0 ? 'text-yellow-400' : player.score < 0 ? 'text-rose-400' : 'text-slate-200']">
              {{ player.score }}
            </div>
          </div>

          <!-- Контролы ведущего (скрытые, по наведению или компактные) -->
          <div v-if="isHost" class="flex flex-col gap-1 mt-2 pt-2 border-t border-slate-700/50 w-full">
            <div class="flex gap-1 items-center justify-center">
               <input type="number" v-model.number="customAmounts[player.id]"
                        class="w-10 bg-slate-950 text-[10px] py-1 px-1 rounded border border-slate-700 outline-none font-bold text-center" />
               <button @click="store.adjustScore(player.id, customAmounts[player.id] || 0)" class="w-6 h-6 bg-emerald-600/20 hover:bg-emerald-600 text-[10px] rounded border border-emerald-500/30 transition-colors">+</button>
               <button @click="store.adjustScore(player.id, -(customAmounts[player.id] || 0))" class="w-6 h-6 bg-rose-600/20 hover:bg-rose-600 text-[10px] rounded border border-rose-500/30 transition-colors">−</button>
            </div>
            <div class="flex gap-1 justify-center">
               <button @click="kickPlayer(player.id)" class="text-[8px] font-black text-rose-500 hover:text-white uppercase px-2">Кик</button>
               <button v-if="store.questionStatus === 'idle' && store.selectingPlayerId !== player.id"
                        @click="store.setSelectingPlayer(player.id)" 
                        class="text-[8px] font-black text-indigo-400 hover:text-white uppercase px-2">Выбор</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Полоса наблюдателей -->
    <div v-if="store.spectators.length" class="flex items-center gap-2 mt-1 bg-slate-900/60 border border-slate-700/40 rounded-xl px-3 py-1.5">
      <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">👁 {{ store.spectators.length }} набл.</span>
      <div v-for="s in store.spectators" :key="s.id"
           class="w-7 h-7 bg-slate-800 rounded-lg overflow-hidden border flex items-center justify-center text-[10px] font-bold text-slate-400 cursor-default"
           :class="voiceOf(s)?.speaking ? 'border-emerald-400' : 'border-slate-700'"
           :title="s.name"
           @contextmenu="onPlayerContextMenu(s, $event, 'spectator')">
        <img v-if="s.avatar" :src="store.getAvatarUrl(s.avatar)" class="w-full h-full object-cover">
        <span v-else>{{ s.name.charAt(0).toUpperCase() }}</span>
      </div>
    </div>

    <!-- Панель эмоций для игроков -->
    <div v-if="store.gameStarted && !isHost && !store.isSpectator" class="flex gap-2 mt-1">
      <button v-for="emoji in REACTIONS" :key="emoji"
        @click="sendReaction(emoji)"
        :disabled="reactionCooldown"
        class="w-9 h-9 rounded-lg text-xl flex items-center justify-center border transition-all duration-200 select-none"
        :class="reactionCooldown
          ? 'bg-slate-800/40 border-slate-700/50 opacity-50 cursor-not-allowed'
          : 'bg-slate-800 border-slate-600 hover:border-slate-400 hover:bg-slate-700 hover:scale-110 active:scale-95 cursor-pointer'"
      >{{ emoji }}</button>
    </div>

  </div>
</template>

<script setup>
import { reactive, computed, ref } from 'vue'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { showParticipantMenu } from '../platform/contextMenu'
import PlayerVideo from './PlayerVideo.vue'
import { MonitorPlay } from 'lucide-vue-next'

const store = useGameStore()
const platform = usePlatformStore()
const isHost = computed(() => store.host?.id === store.user?.id)

// Участник голосового звонка для карточки (или null)
function voiceOf(p) {
  return p?.platformId ? platform.participantFor(p.platformId) : null
}

function onPlayerContextMenu(target, event, role) {
  // Если пунктов нет (гость, не ведущий) — отдаём браузеру родное меню
  showParticipantMenu(target, event, role)
}

const cardSize = computed(() => {
  const count = store.players.length;
  if (count <= 4) return 140;
  if (count <= 6) return 120;
  if (count <= 8) return 100;
  return 90; // Для 10+ игроков
});

const avatarSize = computed(() => {
  const count = store.players.length;
  if (count <= 4) return 80;
  if (count <= 6) return 70;
  if (count <= 8) return 60;
  return 50;
});

const REACTIONS = ['😂', '🔥', '👏', '💀', '🤔', '😤']
const reactionCooldown = ref(false)

function sendReaction(emoji) {
  if (reactionCooldown.value) return
  store.sendReaction(emoji)
  reactionCooldown.value = true
  setTimeout(() => { reactionCooldown.value = false }, 2000)
}

function kickPlayer(playerId) {
  if (confirm('Кикнуть этого игрока?')) {
    store.kickPlayer(playerId)
  }
}

const customAmounts = reactive({})
store.players.forEach(p => { customAmounts[p.id] = 100 })
// Добавляем новых игроков динамически
import { watch } from 'vue'
watch(() => store.players, (players) => {
  players.forEach(p => {
    if (customAmounts[p.id] === undefined) customAmounts[p.id] = 100
  })
}, { deep: true })
</script>

<style scoped>
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.reaction-enter-active { animation: reaction-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.reaction-leave-active { animation: reaction-fade 0.3s ease-in forwards; }
@keyframes reaction-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.4); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
}
@keyframes reaction-fade {
  from { opacity: 1; transform: translateX(-50%) scale(1); }
  to   { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.7); }
}
</style>