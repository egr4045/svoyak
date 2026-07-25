<template>
  <div class="flex flex-col items-center gap-2 w-full">

    <!-- Карточки игроков: флюид-ширина, на телефоне — горизонтальная лента -->
    <div class="flex gap-2 md:gap-6 w-full flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible md:justify-center pb-1 md:pb-0 px-1">
      <div v-for="player in store.players" :key="player.id"
           class="flex flex-col items-center transition-all duration-300 relative shrink-0 player-card-wrap"
           @contextmenu="onPlayerContextMenu(player, $event, 'player')"
           :class="{
             'md:scale-110 z-20': store.answeringPlayerId === player.id,
             'opacity-50 md:scale-95 grayscale-[0.3]': store.answeringPlayerId !== null && store.answeringPlayerId !== player.id
           }">

        <!-- Индикатор статуса (ВЫБОР / ОТВЕТ) -->
        <div v-if="store.selectingPlayerId === player.id && store.questionStatus === 'idle'"
             class="absolute -top-4 w-full flex justify-center z-30 animate-bounce">
             <span class="bg-hub-warning text-black text-[9px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-tighter">Выбор</span>
        </div>
        <div v-if="store.answeringPlayerId === player.id"
             class="absolute -top-4 w-full flex justify-center z-30">
             <span class="bg-hub-accent text-white text-[9px] font-black px-3 py-1 rounded-full glow-accent uppercase tracking-tighter animate-pulse">Отвечает</span>
        </div>

        <!-- Плавающая дельта счёта (+N / −N) -->
        <div v-if="scoreFx[player.id]" :key="scoreFx[player.id].key"
             class="absolute -top-2 right-0 z-40 pointer-events-none font-display font-black text-lg score-float"
             :class="scoreFx[player.id].delta > 0 ? 'text-party-lime' : 'text-hub-negative'">
          {{ scoreFx[player.id].delta > 0 ? '+' : '' }}{{ scoreFx[player.id].delta }}
        </div>

        <!-- Основная карточка (без вложенного blur: футер уже блюрит) -->
        <div class="border-2 rounded-2xl p-1.5 md:p-2 flex flex-col items-center shadow-2xl relative transition-all player-card"
             :class="store.answeringPlayerId === player.id ? 'border-hub-accent glow-accent' : 'border-hub-border'">

          <!-- Тайл: живая камера — основа, аватар под ней как фолбэк (просвечивает, когда камеры нет).
               PlayerVideo держим смонтированным всегда: SDK сам вешает/снимает <video> по треку,
               а v-if на camOn давал лишний attach/detach на каждое мигание камеры. -->
          <div class="avatar-box bg-hub-deep rounded-xl mb-1 flex items-center justify-center relative overflow-hidden transition-all"
               :class="voiceOf(player)?.speaking ? 'ring-2 ring-hub-accent' : 'ring-1 ring-hub-border'">
             <img v-if="player.avatar && store.avatarIsImage(player.avatar)" :src="store.getAvatarUrl(player.avatar)" class="w-full h-full object-cover">
             <span v-else-if="player.avatar" class="avatar-emoji">{{ player.avatar }}</span>
             <MonitorPlay v-else class="w-6 h-6 text-hub-border" />
             <PlayerVideo v-if="player.platformId" :account-id="player.platformId" />
             <div v-if="voiceOf(player) && !voiceOf(player).micOn" class="absolute bottom-0.5 right-0.5 z-20 text-[10px] bg-hub-deep/80 rounded px-0.5" title="Микрофон выключен">🔇</div>
             <div v-if="!player.connected" class="absolute inset-0 z-20 bg-black/60 flex items-center justify-center text-xl" title="Отключился">🔌</div>
             <div v-if="String(store.answeringPlayerId) === String(player.id)" class="absolute inset-0 z-20 bg-gradient-to-t from-hub-accent/30 to-transparent pointer-events-none"></div>
          </div>

          <!-- Текст -->
          <div class="text-center w-full">
            <div class="text-[10px] md:text-xs font-black uppercase text-hub-muted truncate mb-0.5" :class="{ 'opacity-50': !player.connected }">{{ player.name }}</div>
            <div :key="'s' + player.id + '-' + player.score"
                 :class="['font-display text-lg md:text-2xl font-black anim-score-bump',
                          player.score > 0 ? 'text-hub-warning' : player.score < 0 ? 'text-hub-negative' : 'text-hub-text']">
              {{ player.score }}
            </div>
          </div>

          <!-- Быстрые контролы ведущего (кик/профиль — по правому клику) -->
          <div v-if="isHost" class="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-hub-border w-full">
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

// Плавающая дельта очков: следим за счётом каждого игрока, показываем +N/−N на 1.6с
const prevScores = new Map()
const scoreFx = reactive({})
watch(() => store.players.map(p => [p.id, p.score]), (now) => {
  for (const [id, score] of now) {
    const prev = prevScores.get(id)
    if (prev !== undefined && prev !== score) {
      scoreFx[id] = { delta: score - prev, key: Date.now() }
      setTimeout(() => { if (scoreFx[id] && Date.now() - scoreFx[id].key > 1500) delete scoreFx[id] }, 1700)
    }
    prevScores.set(id, score)
  }
}, { deep: true })

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

/* Флюид-размер карточки: от телефона до десктопа без ступеней по числу игроков */
.player-card-wrap { width: clamp(84px, 11vw, 132px); }
.player-card {
  width: 100%;
  background: rgba(16, 24, 38, 0.95); /* solid вместо blur: карточек до 16, под ними видео */
  contain: layout paint;              /* изолируем перерисовки карточки с живой камерой */
}
.avatar-box { width: 100%; aspect-ratio: 1 / 1; }
.avatar-emoji { font-size: clamp(1.5rem, 3.5vw, 2.5rem); }
.score-float { animation: kf-float-up 1.6s ease-out both; }
</style>
