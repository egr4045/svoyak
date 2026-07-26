<template>
  <div class="flex flex-col gap-2 w-full h-full max-w-7xl mx-auto overflow-hidden">

    <!-- Сплэш экран раунда -->
    <div v-if="store.questionStatus === 'showing_round_splash'" class="flex-1 flex flex-col items-center justify-center p-4 md:p-8 panel-glass shadow-2xl relative overflow-hidden anim-pop-in">
      <div class="absolute inset-0 bg-gradient-to-br from-hub-accent/10 to-transparent pointer-events-none"></div>

      <h2 class="text-3xl md:text-6xl font-black mb-6 md:mb-8 tracking-widest uppercase relative z-10 text-center font-display text-party-gradient anim-rise-in">
        {{ roundName }}
      </h2>

      <div class="flex flex-col items-center mb-8 md:mb-10 relative z-10 w-full max-w-4xl">
        <h3 class="text-sm md:text-lg text-hub-muted uppercase tracking-widest mb-4 font-bold anim-fade-in">Темы раунда:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 w-full">
          <div v-for="(cat, idx) in splashCategories" :key="idx"
               class="hub-card p-3 text-center font-bold text-hub-text anim-pop-in anim-stagger border-l-2 border-l-party-violet"
               :style="{ '--stagger': idx }">
            {{ cat.category }}
          </div>
        </div>
      </div>

      <button v-if="isHost" @click="store.startRound()" class="hub-btn-primary relative z-10 py-3 md:py-4 px-8 md:px-12 text-lg md:text-xl tracking-widest uppercase hover:scale-105 anim-rise-in">
        Старт раунда
      </button>
      <div v-else class="relative z-10 text-hub-muted text-lg font-bold italic animate-pulse">Ожидание ведущего…</div>
    </div>

    <!-- Финал: подиум, ранжир, фейерверк -->
    <FinalScoreboard v-else-if="store.questionStatus === 'game_over'" />

    <!-- Доска: десктоп/планшет — классическая сетка -->
    <template v-else>
      <div class="hidden sm:flex flex-col gap-2 flex-1 min-h-0">
        <div
          v-for="(category, catIdx) in store.board" :key="catIdx"
          class="flex-1 grid gap-2 min-h-0"
          :style="{ gridTemplateColumns: `minmax(150px, 220px) repeat(${category.questions.length}, minmax(0,1fr))` }"
        >
          <!-- Заголовок категории -->
          <div class="bg-gradient-to-r from-hub-deep to-hub-solid border-l-4 border-party-violet rounded-r-xl px-3 flex items-center shadow-lg h-full overflow-hidden">
            <h2 class="font-black text-xs md:text-sm lg:text-base uppercase tracking-tighter text-hub-text leading-tight break-words drop-shadow-md">
              {{ category.category }}
            </h2>
          </div>

          <!-- Кнопки номиналов -->
          <!-- Без v-memo: он кэширует узлы ПОЗИЦИОННО, а строки бывают разной длины
               (5 вопросов в одной категории, 6 в другой) — кэш смещался и применял состояние
               чужой строки: отвеченные ячейки оставались кликабельными, а нетронутые гасли.
               Доска — максимум ~30 кнопок, мемоизация тут ничего не экономит. -->
          <button v-for="(q, qIdx) in category.questions" :key="qIdx"
                  @click="handleQuestionClick(catIdx, qIdx)"
                  :disabled="q.answered"
                  :class="['board-cell relative rounded-xl flex items-center justify-center font-black h-full w-full select-none',
                           q.answered ? 'anim-cell-vanish pointer-events-none' :
                           isHighlighted(catIdx, qIdx)
                             ? 'bg-hub-accent border-2 border-white glow-accent scale-[1.02] z-10 cell-highlight'
                             : 'bg-hub-deep/60 border border-hub-border hover:border-party-cyan hover:bg-party-cyan/10 hover:scale-[1.02] shadow-sm cursor-pointer']"
          >
            <span class="font-display text-lg md:text-xl lg:text-2xl xl:text-3xl"
                  :class="isHighlighted(catIdx, qIdx) ? 'text-white' : 'text-hub-accent drop-shadow-md'"
            >
              {{ q.points }}
            </span>
          </button>
        </div>
      </div>

      <!-- Доска: телефон — стопка категорий с горизонтальной лентой номиналов -->
      <div class="sm:hidden flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-2">
        <div v-for="(category, catIdx) in store.board" :key="catIdx" class="shrink-0">
          <div class="border-l-4 border-party-violet pl-2 mb-1.5">
            <h2 class="font-black text-xs uppercase tracking-tight text-hub-text leading-tight">{{ category.category }}</h2>
          </div>
          <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button v-for="(q, qIdx) in category.questions" :key="qIdx"
                    @click="handleQuestionClick(catIdx, qIdx)"
                    :disabled="q.answered"
                    :class="['shrink-0 w-[68px] h-12 rounded-xl flex items-center justify-center font-black select-none',
                             q.answered ? 'opacity-15 pointer-events-none border border-hub-border/40' :
                             isHighlighted(catIdx, qIdx)
                               ? 'bg-hub-accent border-2 border-white glow-accent'
                               : 'bg-hub-deep/70 border border-hub-border active:scale-95']"
            >
              <span class="font-display text-base" :class="isHighlighted(catIdx, qIdx) ? 'text-white' : 'text-hub-accent'">{{ q.points }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Переход к следующему раунду -->
      <div v-if="isHost && allQuestionsAnswered" class="mt-2 md:mt-6 flex justify-center w-full anim-rise-in relative z-20 shrink-0">
        <button @click="store.nextRound()" class="hub-btn-primary py-3 md:py-5 px-8 md:px-12 text-lg md:text-2xl tracking-widest uppercase hover:scale-105 hover:-translate-y-1">
          {{ store.currentRoundIndex < (store.roundsCount || store.roundsData.length) - 1 ? 'Следующий раунд ➔' : 'Завершить игру' }}
        </button>
      </div>
    </template>

  </div>

</template>

<script setup>
import { computed, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { rain } from '../lib/confetti'
import { playSfx, preloadSfx } from '../lib/sfx'
import FinalScoreboard from './FinalScoreboard.vue'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)

preloadSfx()

const roundName = computed(() => {
  const r = store.roundsData?.[store.currentRoundIndex]
  return r?.name || r?.round || 'Раунд'
})

// board заполняется ДО сплэша (startGame/nextRound) — темы берём из него,
// а roundsData оставляем фолбэком (приходит при join полным стейтом)
const splashCategories = computed(() =>
  store.board?.length ? store.board : (store.roundsData?.[store.currentRoundIndex]?.categories || [])
)

// Сплэш раунда — маленький праздник: дождь конфетти + вуш
watch(() => store.questionStatus, (s) => {
  if (s === 'showing_round_splash') { rain(); playSfx('whoosh') }
})

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

<style scoped>
.board-cell { transition: transform var(--dur-snap) var(--ease-pop), border-color var(--dur-quick) ease-out, background-color var(--dur-quick) ease-out; }
/* Пульс подсвеченной ячейки: мигает opacity подложки-псевдоэлемента, не box-shadow */
.cell-highlight::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  box-shadow: 0 0 26px color-mix(in srgb, var(--c-accent) 70%, transparent);
  animation: kf-pulse-opacity 1.1s ease-in-out infinite;
  pointer-events: none;
}
</style>
