<template>
  <div class="flex-1 flex flex-col items-center">
    <!-- Ставка «аукцион»: торги вслепую (текст вопроса скрыт до победы) -->
    <div v-if="store.questionStatus === 'auction_bidding'" class="w-full max-w-lg mx-auto bg-slate-900/80 p-8 rounded-3xl border border-white/5 shadow-2xl space-y-8">
      <div class="flex flex-col items-center gap-4 text-center">
         <div class="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-2">
            <Gavel class="w-8 h-8" />
         </div>
         <h3 class="text-2xl font-black text-slate-100 uppercase tracking-widest">Аукцион вслепую</h3>
         <p class="text-slate-400 text-sm max-w-[280px]">Сделайте ставку. Максимальная ставка определит, кто будет отвечать.</p>
      </div>

      <div v-if="isHost || store.isSpectator" class="py-8 flex flex-col items-center gap-4">
         <p class="text-slate-400 text-sm font-medium uppercase tracking-widest animate-pulse">
           {{ isHost ? `Ставки: ${Object.keys(store.auctionBets || {}).length} / ${store.players.length}` : 'Игроки делают ставки… 👁' }}
         </p>
      </div>
      <div v-else-if="!store.auctionBets[store.user?.id]" class="flex flex-col gap-4">
         <div class="relative group">
            <input type="number" v-model.number="myBet" :min="1" :max="maxBet"
                   class="w-full bg-black/40 border-2 rounded-2xl p-6 text-3xl font-black text-center text-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all outline-none"
                   :class="betValid ? 'border-white/5 focus:border-amber-500/50' : 'border-hub-negative/60'" placeholder="0" />
            <span class="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-black">OЧКОВ</span>
         </div>
         <!-- Сервер молча отклонял ставку больше баланса — теперь предел виден и кнопка блокируется -->
         <p class="text-xs text-center" :class="betValid ? 'text-slate-500' : 'text-hub-negative font-bold'">
           Максимум: <b>{{ maxBet }}</b>{{ betValid ? '' : ' — исправьте ставку' }}
         </p>
         <button @click="submitBet" :disabled="!betValid"
                 class="w-full p-5 rounded-2xl bg-amber-600 border border-amber-400/30 text-white font-black text-lg hover:bg-amber-500 transition-all shadow-xl shadow-amber-600/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
           СДЕЛАТЬ СТАВКУ
         </button>
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

    <!-- Ставка «кот в мешке»: ожидание рулетки -->
    <div v-else-if="store.questionStatus === 'cat_target_selection'" class="flex-1 flex flex-col items-center justify-center gap-4 py-10">
      <span class="text-6xl">🐱</span>
      <h3 class="text-2xl font-black text-hub-warning uppercase tracking-widest">Кот в мешке!</h3>
      <p class="text-hub-muted text-sm">Ведущий крутит рулетку — вопрос достанется случайному игроку.</p>
    </div>

    <!-- Ставка «кот в мешке»: рулетка крутится -->
    <div v-else-if="store.questionStatus === 'cat_roulette'" class="flex-1 flex flex-col items-center justify-center">
      <div class="w-full max-w-sm mx-auto flex flex-col items-center gap-10">
        <div class="relative group">
          <div class="absolute inset-0 bg-hub-accent/20 blur-[80px] rounded-full animate-pulse"></div>
          <div class="relative w-48 h-48 rounded-full border-8 border-hub-deep shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center bg-hub-solid overflow-hidden ring-4 ring-hub-border">
             <div v-for="i in 12" :key="i" class="absolute w-1 h-3 bg-white/10 rounded-full" :style="{ transform: `rotate(${i*30}deg) translateY(-80px)` }"></div>

             <img v-if="roulettePlayer?.avatar && store.avatarIsImage(roulettePlayer.avatar)" :src="store.getAvatarUrl(roulettePlayer.avatar)" class="w-32 h-32 rounded-3xl object-cover shadow-2xl relative z-10 border-2 border-white/10" />
             <span v-else class="text-7xl relative z-10">{{ roulettePlayer?.avatar || (roulettePlayer?.name || '?').charAt(0).toUpperCase() }}</span>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3">
           <span class="text-xs font-black uppercase tracking-[0.4em] text-hub-accent animate-pulse">Выбор жертвы…</span>
           <h2 class="text-3xl font-black text-hub-text tracking-tight">{{ roulettePlayer?.name }}</h2>
        </div>
      </div>
    </div>

    <!-- Обычный показ: медиа + текст вопроса (глитч/фрагмент — модификаторы) -->
    <template v-else>
      <!-- Медиа (фото/аудио/видео): синхронизированный плеер (якорь позиции с сервера) -->
      <MediaPlayer v-if="q?.mediaType && q?.mediaSrc"
                   class="mb-4"
                   :src="q.mediaSrc"
                   :media-type="q.mediaType"
                   :blur-px="snippetBlur"
                   :label="q.snippet ? (q.mediaType === 'video' ? 'Видео-фрагмент' : 'Аудио-фрагмент') : ''" />

      <!-- Фрагмент: текущая цена, уровень раскрытия, контролы ведущего -->
      <template v-if="q?.snippet">
        <div class="flex items-center gap-4 mb-2">
          <span class="text-hub-warning font-black text-lg">Цена: {{ store.activeBet ?? q?.points }}</span>
          <span v-if="store.snippetLevel" class="text-hub-muted text-sm">Раскрыто: {{ store.snippetLevel }}</span>
        </div>
        <button v-if="isHost && store.questionStatus === 'snippet_playing'" @click="revealMore"
                class="hub-btn text-sm !text-hub-warning mb-2">🔓 Открыть больше (−очки)</button>
        <!-- В snippet_playing баззера ещё НЕТ (его открывает ведущий) — не зовём жать раньше времени -->
        <p v-else-if="store.questionStatus === 'snippet_playing' && !isHost" class="text-hub-muted text-sm italic mb-2">Слушайте фрагмент — ведущий откроет баззер.</p>
      </template>

      <!-- Ставка: отвечает один, промах стоит очков — предупреждаем до ответа -->
      <p v-if="isStake && store.questionStatus === 'answering'" class="text-xs text-hub-warning font-bold mb-2">
        ⚠ Отвечает один: неверно — минус {{ store.activeBet ?? q?.points }}, вопрос закроется
      </p>

      <!-- Текст вопроса: глитч-анимация или обычный -->
      <!-- Глитч — герой экрана: его расшифровывают, поэтому крупно и по центру -->
      <div v-if="q?.glitch && q?.q" class="my-6 md:my-10 max-w-4xl mx-auto drop-shadow-lg w-full">
        <div class="min-h-[120px] md:min-h-[160px] flex items-center justify-center">
          <GlitchText :text="q.q"
                      :seed="store.glitchSeed"
                      :isFinished="store.showAnswer"
                      :isPaused="store.questionStatus !== 'buzzer_active' && store.questionStatus !== 'buzzer_countdown' || store.buzzerResults.length > 0"
                      class="text-4xl md:text-6xl font-black leading-relaxed text-center" />
        </div>
      </div>
      <div v-else-if="q?.q" class="flex-1 flex flex-col justify-start items-center overflow-y-auto min-h-0 py-2 pb-6">
        <h3 class="font-black leading-tight text-slate-100 max-w-4xl mx-auto drop-shadow-2xl overflow-hidden break-words hyphens-auto text-center"
            :class="isHost ? 'text-lg md:text-2xl lg:text-3xl mb-4' : 'text-xl md:text-3xl lg:text-4xl mb-6'">
          {{ q.q }}
        </h3>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'
import { playSfx } from '../../lib/sfx'
import { Gavel } from 'lucide-vue-next'
import GlitchText from '../GlitchText.vue'
import MediaPlayer from '../MediaPlayer.vue'

const store = useGameStore()
const emit = defineEmits(['submitBet', 'action'])
const isHost = computed(() => String(store.host?.id) === String(store.user?.id))
const q = computed(() => store.currentQuestion)
// Ставочные вопросы: отвечает один назначенный, неверный ответ закрывает вопрос
const isStake = computed(() => q.value?.stake === 'auction' || q.value?.stake === 'cat')

// --- Аукцион ---
// Сервер клампит ставку в [1, баланс] (при балансе ≤0 — до номинала вопроса) и молча
// игнорит остальное. Повторяем правило на клиенте, чтобы игрок видел предел, а не тишину.
const myScore = computed(() => store.players.find(p => String(p.id) === String(store.user?.id))?.score || 0)
const maxBet = computed(() => (myScore.value <= 0 ? (q.value?.points || 0) : myScore.value))
const myBet = ref(0)
const betValid = computed(() => Number.isFinite(myBet.value) && myBet.value >= 1 && myBet.value <= maxBet.value)
// Дефолт — половина номинала, но не выше того, что игрок реально может поставить
watch([maxBet, () => store.questionStatus], () => {
  if (store.questionStatus !== 'auction_bidding') return
  const suggested = Math.ceil((q.value?.points || 0) / 2)
  if (!myBet.value) myBet.value = Math.max(1, Math.min(suggested, maxBet.value))
}, { immediate: true })
const submitBet = () => { if (betValid.value) emit('submitBet', myBet.value) }

// --- Кот: локальная рулетка-цикл по игрокам (визуал; итог решает сервер).
// rAF с шагом 100мс вместо setInterval: фоновые вкладки не жгут CPU ---
const roulettePlayer = ref(null)
let rouletteRaf = null
let rouletteLast = 0
let rouletteIdx = 0
function rouletteTick(ts) {
  if (store.questionStatus !== 'cat_roulette') { rouletteRaf = null; return }
  if (ts - rouletteLast >= 100) {
    rouletteLast = ts
    const players = store.players
    roulettePlayer.value = players[rouletteIdx % players.length]
    rouletteIdx++
    playSfx('tick', { volume: 0.25 })
  }
  rouletteRaf = requestAnimationFrame(rouletteTick)
}
watch(() => store.questionStatus, (status) => {
  if (status === 'cat_roulette' && !rouletteRaf) {
    rouletteIdx = 0
    rouletteRaf = requestAnimationFrame(rouletteTick)
  }
}, { immediate: true })
onUnmounted(() => { if (rouletteRaf) cancelAnimationFrame(rouletteRaf) })

// --- Фрагмент: для фото раскрытие = снятие блюра по уровням (5 уровней → 0px) ---
const snippetBlur = computed(() => {
  if (!q.value?.snippet || q.value?.mediaType !== 'image') return 0
  return Math.max(0, 20 - (store.snippetLevel || 0) * 5)
})

function revealMore() { emit('action', { name: 'host:revealMore' }) }
</script>
