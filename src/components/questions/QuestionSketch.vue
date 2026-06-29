<template>
  <div class="flex-1 flex flex-col items-center">
    <div v-if="store.questionStatus === 'sketch_drawing'" class="w-full h-full max-h-[60vh] relative mb-12">
      <SketchCanvas ref="sketchCanvas" @submit="submitSketch" />
    </div>

    <div v-if="store.questionStatus === 'sketch_judging'" class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      <div v-for="(sketchUrl, pId) in store.sketchAnswers" :key="pId"
           class="bg-white/5 border border-white/5 rounded-3xl overflow-hidden flex flex-col p-4 transition-all duration-300 group hover:bg-white/10"
           :class="store.sketchVotes[store.user?.id] === pId ? 'ring-2 ring-blue-500 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : ''">
         <img :src="sketchUrl" class="w-full aspect-square object-contain bg-white rounded-2xl mb-4 group-hover:scale-[1.02] transition-transform" />
         <div class="flex items-center justify-between mt-auto">
            <span class="font-bold text-slate-300">{{ store.getPlayerById(pId)?.name }}</span>
            <div class="flex items-center gap-2">
               <span class="text-xs font-black text-slate-500">{{ Object.values(store.sketchVotes).filter(v => v === pId).length }}</span>
               <button v-if="!isHost && store.user?.id !== pId" @click="vote(pId)" 
                       class="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all">Голосовать</button>
               <button v-if="isHost" @click="emit('awardWinner', pId)" 
                       class="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">Победил</button>
            </div>
         </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import SketchCanvas from '../SketchCanvas.vue'

const store = useGameStore()
const emit = defineEmits(['submitSketch', 'vote', 'awardWinner'])
const isHost = computed(() => store.host?.id === store.user?.id)
const sketchCanvas = ref(null)

const submitSketch = (dataUrl) => {
  emit('submitSketch', dataUrl)
}

const vote = (pId) => {
  emit('vote', pId)
}
</script>
