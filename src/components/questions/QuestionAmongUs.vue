<template>
  <div class="flex-1 flex flex-col items-center">
    <div v-if="store.questionStatus === 'among_us_voting'" class="w-full max-w-4xl mx-auto space-y-6 mb-8">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="player in store.players" :key="player.id" 
             @click="vote(player.id)"
             class="group relative flex flex-col items-center p-4 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden"
             :class="[
               store.amongUsVotes[store.user?.id] === player.id ? 'bg-red-500/20 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20',
               player.id === store.user?.id ? 'opacity-50 pointer-events-none grayscale' : ''
             ]">
          <img :src="player.avatar" class="w-16 h-16 rounded-2xl mb-3 shadow-lg group-hover:scale-110 transition-transform" />
          <span class="font-black text-xs text-center break-words w-full">{{ player.name }}</span>
          
          <div v-if="store.revealedAmongUs && player.id === store.imposterId" class="absolute inset-0 bg-red-600/40 flex items-center justify-center backdrop-blur-sm">
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
         <div class="text-4xl font-mono font-black" :class="store.amongUsTimerState.timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-200'">
            {{ formatTime(store.amongUsTimerState.timeLeft) }}
         </div>
         <div v-if="isHost" class="flex gap-4">
            <button v-if="store.amongUsTimerState.status === 'running'" @click="emit('pauseTimer', store.amongUsTimerState.timeLeft)" class="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 text-xs font-black">ПАУЗА</button>
            <button v-else @click="emit('resumeTimer', store.amongUsTimerState.timeLeft)" class="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-xs font-black">ПРОДОЛЖИТЬ</button>
         </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['vote', 'pauseTimer', 'resumeTimer'])
const isHost = computed(() => store.host?.id === store.user?.id)

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
