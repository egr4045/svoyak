<template>
  <div class="flex-1 flex flex-col items-center justify-center">
    <div v-if="store.questionStatus === 'auction_bidding'" class="w-full max-w-lg mx-auto bg-slate-900/80 p-8 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-2xl space-y-8">
      <div class="flex flex-col items-center gap-4 text-center">
         <div class="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-2">
            <Gavel class="w-8 h-8" />
         </div>
         <h3 class="text-2xl font-black text-slate-100 uppercase tracking-widest">Аукцион вслепую</h3>
         <p class="text-slate-400 text-sm max-w-[280px]">Сделайте ставку. Максимальная ставка определит, кто будет отвечать.</p>
      </div>

      <div v-if="!store.auctionBets[store.user?.id]" class="flex flex-col gap-6">
         <div class="relative group">
            <input type="number" v-model.number="myBet" class="w-full bg-black/40 border-2 border-white/5 rounded-2xl p-6 text-3xl font-black text-center text-amber-400 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all outline-none" placeholder="0" />
            <span class="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-black">OЧКОВ</span>
         </div>
         <button @click="submitBet" class="w-full p-5 rounded-2xl bg-amber-600 border border-amber-400/30 text-white font-black text-lg hover:bg-amber-500 transition-all shadow-xl shadow-amber-600/20 active:scale-95">СДЕЛАТЬ СТАВКУ</button>
      </div>
      <div v-else class="py-8 flex flex-col items-center gap-6">
         <div class="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"></div>
         <div class="flex flex-col items-center gap-2">
           <span class="text-xs font-black uppercase tracking-[0.3em] text-emerald-500">Ставка принята</span>
           <span class="text-3xl font-black text-slate-200">{{ store.auctionBets[store.user?.id] }}</span>
         </div>
         <p class="text-xs text-slate-500 font-medium uppercase tracking-widest animate-pulse">Ожидание остальных игроков...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGameStore } from '../../stores/game'
import { Gavel } from 'lucide-vue-next'

const store = useGameStore()
const emit = defineEmits(['submitBet'])

const myBet = ref(Math.ceil((store.currentQuestion?.points || 0) / 2))

const submitBet = () => {
  emit('submitBet', myBet.value)
}
</script>
