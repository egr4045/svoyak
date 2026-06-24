<template>
  <div class="flex flex-col gap-2 w-full h-full max-w-7xl mx-auto overflow-hidden">
    
    <!-- Сплэш экран раунда -->
    <div v-if="store.questionStatus === 'showing_round_splash'" class="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
      <div class="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-purple-900/20 pointer-events-none"></div>
      
      <h2 class="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-8 tracking-widest uppercase drop-shadow-lg relative z-10 text-center">
        {{ store.roundsData?.[store.currentRoundIndex]?.name || 'Раунд' }}
      </h2>
      
      <div class="flex flex-col items-center mb-10 relative z-10 w-full max-w-4xl">
        <h3 class="text-lg text-slate-400 uppercase tracking-widest mb-4 font-bold">Темы раунда:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
          <div v-for="(cat, idx) in store.roundsData?.[store.currentRoundIndex]?.categories" :key="idx" class="bg-slate-800/80 border border-slate-600 rounded-xl p-3 text-center font-bold text-slate-200 shadow-md">
            {{ cat.category }}
          </div>
        </div>
      </div>
      
      <button v-if="isHost" @click="store.startRound()" class="relative z-10 py-4 px-12 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-all hover:scale-105 tracking-widest uppercase focus:outline-none focus:ring-4 focus:ring-blue-500">
        СТАРТ РАУНДА
      </button>
      <div v-else class="relative z-10 text-slate-400 text-lg font-bold italic animate-pulse">Ожидание ведущего...</div>
    </div>

    <!-- Финал -->
    <div v-else-if="store.questionStatus === 'game_over'" class="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/80 backdrop-blur-md rounded-3xl border border-amber-600 shadow-2xl">
      <h2 class="text-5xl font-black text-amber-500 mb-6 tracking-widest uppercase drop-shadow-lg text-center">ИГРА ОКОНЧЕНА</h2>
      <p class="text-xl text-slate-300 font-medium">Спасибо за игру!</p>
    </div>
    
    <!-- Сама доска -->
    <template v-else>
      <div
        v-for="(category, catIdx) in store.board" :key="catIdx"
        class="flex-1 grid gap-2 min-h-0"
        :style="{ gridTemplateColumns: `minmax(180px, 240px) repeat(${category.questions.length}, minmax(0,1fr))` }"
      >
        <!-- Заголовок категории -->
        <div class="bg-gradient-to-r from-blue-950 to-blue-900 border-l-4 border-amber-500 rounded-r-xl px-3 flex items-center shadow-lg h-full overflow-hidden">
          <h2 class="font-black text-xs md:text-sm lg:text-base uppercase tracking-tighter text-slate-100 leading-tight break-words drop-shadow-md">
            {{ category.category }}
          </h2>
        </div>

        <!-- Кнопки номиналов -->
        <button v-for="(q, qIdx) in category.questions" :key="qIdx"
                @click="handleQuestionClick(catIdx, qIdx)"
                :disabled="q.answered"
                :class="['relative rounded-xl flex items-center justify-center font-black transition-all duration-300 h-full w-full select-none',
                         q.answered ? 'opacity-0 pointer-events-none' :
                         isHighlighted(catIdx, qIdx)
                           ? 'bg-amber-500 border-2 border-white shadow-[0_0_30px_rgba(245,158,11,1)] animate-pulse scale-[1.02] z-10'
                           : 'bg-blue-900/60 border border-blue-700/50 hover:bg-blue-600 hover:border-amber-400 hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] shadow-sm cursor-pointer']"
        >
          <span v-if="!q.answered"
                class="text-xl md:text-2xl lg:text-3xl xl:text-4xl"
                :class="isHighlighted(catIdx, qIdx) ? 'text-white' : 'text-yellow-400 drop-shadow-md'"
          >
            {{ q.points }}
          </span>
        </button>
      </div>

      <!-- Переход к следующему раунду -->
      <div v-if="isHost && allQuestionsAnswered" class="mt-6 flex justify-center w-full animate-in fade-in duration-500 relative z-20">
        <button @click="store.nextRound()" class="py-5 px-12 bg-purple-600 hover:bg-purple-500 text-white font-black text-2xl rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all hover:scale-105 tracking-widest uppercase hover:-translate-y-1">
          {{ store.currentRoundIndex < store.roundsData.length - 1 ? 'СЛЕДУЮЩИЙ РАУНД ➔' : 'ЗАВЕРШИТЬ ИГРУ' }}
        </button>
      </div>
    </template>

  </div>

</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)

const allQuestionsAnswered = computed(() => {
  if (!store.board || store.board.length === 0) return false;
  return store.board.every(c => c.questions.every(q => q.answered));
})

const isHighlighted = (catIdx, qIdx) => {
  return store.highlightedQuestion?.catIdx === catIdx && store.highlightedQuestion?.qIdx === qIdx;
}

const handleQuestionClick = (catIdx, qIdx) => {
  // Ведущий моментально открывает вопрос
  if (isHost.value) {
    store.selectQuestion(catIdx, qIdx);
  } 
  // Игрок с правом выбора подсвечивает его
  else if (store.user?.id === store.selectingPlayerId) {
    store.highlightQuestion(catIdx, qIdx);
  }
}
</script>