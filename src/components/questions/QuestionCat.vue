<template>
  <div class="flex-1 flex flex-col items-center justify-center">
    <div v-if="store.questionStatus === 'cat_roulette'" class="w-full max-w-sm mx-auto flex flex-col items-center gap-10">
      <div class="relative group">
        <div class="absolute inset-0 bg-blue-500/20 blur-[80px] rounded-full animate-pulse"></div>
        <div class="relative w-48 h-48 rounded-full border-8 border-slate-900 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center bg-slate-950 overflow-hidden ring-4 ring-white/5">
           <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1)_0%,transparent_70%)]"></div>
           <div v-for="i in 12" :key="i" class="absolute w-1 h-3 bg-white/10 rounded-full" :style="{ transform: `rotate(${i*30}deg) translateY(-80px)` }"></div>
           
           <img :src="roulettePlayer?.avatar" class="w-32 h-32 rounded-3xl object-cover shadow-2xl relative z-10 transition-all duration-300 border-2 border-white/10" />
        </div>
      </div>
      
      <div class="flex flex-col items-center gap-3">
         <span class="text-xs font-black uppercase tracking-[0.4em] text-blue-500 animate-pulse">Выбор жертвы...</span>
         <h2 class="text-3xl font-black text-slate-100 tracking-tight">{{ roulettePlayer?.name }}</h2>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const roulettePlayer = ref(null)

onMounted(() => {
  const players = store.players
  let idx = 0
  const interval = setInterval(() => {
    roulettePlayer.value = players[idx % players.length]
    idx++
    if (store.questionStatus !== 'cat_roulette') clearInterval(interval)
  }, 100)
})
</script>
