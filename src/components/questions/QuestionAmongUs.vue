<template>
  <div class="flex-1 flex flex-col items-center">
    <!-- Фаза ответов/проверки: вопрос видят все, КРОМЕ шпиона (механика «Хамелеона») -->
    <div v-if="store.questionStatus === 'text_inputting' || store.questionStatus === 'text_judging'" class="w-full max-w-3xl mx-auto mb-4">
      <!-- Я — шпион -->
      <div v-if="amImposter" class="bg-hub-negative/10 border-2 border-hub-negative/50 rounded-2xl p-5 text-center anim-pop-in">
        <p class="text-3xl mb-1">🕵️</p>
        <p class="text-xl font-black text-hub-negative mb-1">ВЫ — ШПИОН!</p>
        <p class="text-sm text-hub-text">Вопрос вам не показан. Подслушивайте, смотрите на реакции и напишите <b>правдоподобный</b> ответ, чтобы слиться с толпой.</p>
      </div>
      <!-- Мирные (и ведущий) -->
      <template v-else>
        <h3 class="text-xl md:text-3xl font-black text-hub-text text-center mb-2">{{ store.currentQuestion.q }}</h3>
        <p class="text-xs text-hub-muted text-center">🕵️ Среди вас шпион — он <b>не видит</b> вопрос. Отвечайте честно, потом вычислите блефующего.</p>
        <p v-if="isHost && hostReveal" class="text-xs text-center mt-1 text-hub-warning">👁 Для ведущего: шпион — <b>{{ hostReveal.imposterName }}</b></p>
      </template>
    </div>

    <div v-if="store.questionStatus === 'among_us_voting'" class="w-full max-w-4xl mx-auto space-y-6 mb-8">
      <!-- Инструкция + ставки голосования -->
      <div class="text-center">
        <p class="text-lg font-black text-hub-text">Кто блефовал? Голосуйте!</p>
        <p class="text-xs text-hub-muted mt-1">
          Толпа угадала: голосовавшим верно <b class="text-party-lime">+{{ pts }}</b>, шпиону <b class="text-hub-negative">−{{ pts * 2 }}</b> ·
          Не угадала: шпиону <b class="text-party-lime">+{{ pts * 2 }}</b>, остальным <b class="text-hub-negative">−{{ pts }}</b>
        </p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="player in store.players" :key="player.id" 
             @click="vote(player.id)"
             class="group relative flex flex-col items-center p-4 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden"
             :class="[
               store.amongUsVotes[store.user?.id] === player.id ? 'bg-red-500/20 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20',
               player.id === store.user?.id ? 'opacity-50 pointer-events-none grayscale' : ''
             ]">
          <img v-if="player.avatar && store.avatarIsImage(player.avatar)" :src="store.getAvatarUrl(player.avatar)" class="w-16 h-16 rounded-2xl mb-3 shadow-lg group-hover:scale-110 transition-transform" />
          <div v-else class="w-16 h-16 rounded-2xl mb-3 bg-hub-deep flex items-center justify-center text-3xl shadow-lg">{{ player.avatar || (player.name || '?').charAt(0).toUpperCase() }}</div>
          <span class="font-black text-xs text-center break-words w-full">{{ player.name }}</span>
          
          <div v-if="store.amongUsResult && player.id === store.imposterId" class="absolute inset-0 bg-red-600/40 flex items-center justify-center backdrop-blur-sm">
             <span class="font-black text-white rotate-12 text-sm uppercase tracking-widest border-2 border-white px-2 py-0.5">ШПИОН</span>
          </div>
          
          <!-- Votes count display -->
          <div class="mt-2 flex -space-x-2">
             <div v-for="v in getVotesFor(player.id)" :key="v" class="w-2 h-2 rounded-full bg-red-500 border border-black shadow" />
          </div>
        </div>
      </div>
      
      <div v-if="store.amongUsTimerState" class="p-6 rounded-3xl bg-slate-900/50 border border-white/5 flex flex-col items-center gap-4">
         <span class="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Время на обсуждение</span>
         <div class="text-4xl font-mono font-black" :class="displayTimeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-200'">
            {{ formatTime(displayTimeLeft) }}
         </div>
         <!-- Пауза/продолжение — на пульте ведущего внизу (единое место управления) -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['vote'])
const isHost = computed(() => String(store.host?.id) === String(store.user?.id))
const pts = computed(() => store.currentQuestion?.points || 0)

// Приватная роль из privateReveal (вне broadcast): шпион узнаёт себя, ведущий — имя шпиона
const amImposter = computed(() => !isHost.value && store.privateReveal?.kind === 'imposter')
const hostReveal = computed(() => store.privateReveal?.kind === 'imposter_host' ? store.privateReveal : null)

// Живой отсчёт: пока таймер «running», считаем остаток от endsAt (сервер тикает не сам);
// на паузе показываем сохранённый timeLeft
const now = ref(Date.now())
let ticker = null
onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 500) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

const displayTimeLeft = computed(() => {
  const t = store.amongUsTimerState
  if (!t) return 0
  if (t.status === 'running' && t.endsAt) return Math.max(0, Math.ceil((t.endsAt - now.value) / 1000))
  return t.timeLeft ?? 0
})

const vote = (targetId) => {
  if (store.isSpectator) return
  if (store.questionStatus === 'among_us_voting') {
    emit('vote', targetId)
  }
}

const getVotesFor = (pId) => {
  return Object.values(store.amongUsVotes || {}).filter(v => v === pId).length
}

const formatTime = (s) => {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}
</script>
