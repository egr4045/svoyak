<template>
  <div class="flex-1 flex flex-col items-center">
    <div v-if="store.questionStatus === 'poker_bidding'" class="w-full max-w-lg mx-auto bg-slate-900/80 p-6 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-2xl space-y-8 mb-8">
      <div class="flex items-center justify-between pb-6 border-b border-white/5">
         <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500">
              <Trophy class="w-5 h-5" />
            </div>
            <span class="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Текущий Банк</span>
         </div>
         <span class="text-3xl font-black text-orange-400 drop-shadow-[0_0_15px_rgba(251,146,60,0.3)]">{{ store.pokerCurrentBet }}</span>
      </div>

      <div class="flex flex-col gap-2">
         <div v-for="pId in store.pokerActivePlayers" :key="pId" 
              class="flex items-center justify-between p-3 rounded-2xl border transition-all duration-300"
              :class="pId === activePokerPlayerId ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.1)] scale-[1.02]' : 'bg-white/5 border-transparent opacity-60'">
            <div class="flex items-center gap-3">
               <div class="w-1.5 h-1.5 rounded-full" :class="pId === activePokerPlayerId ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'"></div>
               <span class="font-bold text-slate-200">{{ store.getPlayerById(pId)?.name }}</span>
            </div>
            <div class="flex items-center gap-4">
               <span class="text-xs font-black text-slate-500 uppercase tracking-widest">Ставка</span>
               <span class="font-black text-slate-100 text-lg">{{ store.pokerBets[pId] || 0 }}</span>
            </div>
         </div>
      </div>
      
      <!-- Controls for active player only -->
      <div v-if="store.user?.id === activePokerPlayerId" class="pt-4 grid grid-cols-2 gap-4">
         <button @click="emit('pokerAction', { action: 'fold' })" class="p-4 rounded-2xl bg-slate-950 border border-white/10 font-bold hover:bg-slate-900 transition-all text-slate-400">Сбросить</button>
         <button @click="emit('pokerAction', { action: 'call' })" class="p-4 rounded-2xl bg-blue-600 border border-blue-400/30 font-bold hover:bg-blue-500 transition-all text-white shadow-lg shadow-blue-500/20">Коллировать {{ store.pokerCurrentBet }}</button>
         <div class="col-span-2 flex flex-col gap-3 pt-4 border-t border-white/5">
            <div class="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500">
               <span>Поднять ставку</span>
               <span>+ {{ raiseValue }}</span>
            </div>
            <input type="range" v-model.number="raiseValue" min="10" max="500" step="10" class="w-full accent-blue-500" />
            <button @click="emit('pokerAction', { action: 'raise', amount: raiseValue })" class="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-600 to-orange-500 border border-orange-400/30 font-black hover:from-orange-500 hover:to-orange-400 transition-all text-white shadow-xl shadow-orange-600/20">ПОВЫСИТЬ НА {{ raiseValue }}</button>
         </div>
      </div>
      <div v-else class="py-4 text-center">
         <span class="text-xs font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">Ожидание хода: {{ store.getPlayerById(activePokerPlayerId)?.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { Trophy } from 'lucide-vue-next'

const store = useGameStore()
const emit = defineEmits(['pokerAction'])

const raiseValue = ref(50)
const activePokerPlayerId = computed(() => store.pokerActivePlayers[store.pokerTurnIdx])
</script>
