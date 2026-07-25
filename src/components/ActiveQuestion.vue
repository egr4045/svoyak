<template>
  <div v-if="store.activeCell" class="absolute inset-0 z-50 flex items-center justify-center p-0 sm:p-2 md:p-4 bg-black/85 sm:rounded-3xl anim-fade-in">
    <div class="panel-glass border-hub-accent/40 p-3 sm:p-4 md:p-6 max-w-4xl w-full shadow-2xl flex flex-col text-center relative max-h-full sm:max-h-[92dvh] h-full sm:h-auto overflow-y-auto rounded-none sm:rounded-[14px] anim-pop-in">
      
      <!-- Управление ведущего целиком живёт в HostPanel (пульт внизу) — здесь только контент -->
      <div class="inline-block px-4 py-1.5 rounded-lg bg-hub-deep text-hub-accent font-medium text-sm mb-6 border border-hub-border mx-auto">
        {{ store.currentCategoryName }} —
        <span class="text-hub-warning font-bold">
          {{ store.activeBet !== null ? store.activeBet : store.currentQuestion.points }}
        </span>
        <span class="ml-2 px-2 py-0.5 bg-hub-warning/15 text-hub-warning rounded text-xs border border-hub-warning/30" v-if="store.currentQuestion.stake === 'cat'">
          Кот в мешке
        </span>
        <span class="ml-2 px-2 py-0.5 bg-hub-warning/15 text-hub-warning rounded text-xs border border-hub-warning/30" v-else-if="store.currentQuestion.stake === 'auction'">
          Аукцион
        </span>
        <span class="ml-2 px-2 py-0.5 bg-hub-warning/15 text-hub-warning rounded text-xs border border-hub-warning/30" v-if="store.currentQuestion.glitch">
          Глитч
        </span>
        <span class="ml-2 px-2 py-0.5 bg-hub-warning/15 text-hub-warning rounded text-xs border border-hub-warning/30" v-if="store.currentQuestion.snippet">
          Фрагмент
        </span>
        <span class="ml-2 px-2 py-0.5 bg-hub-warning/15 text-hub-warning rounded text-xs border border-hub-warning/30" v-if="store.currentQuestion.answerMode === 'written'">
          Письменно
        </span>
      </div>

      <!-- Динамический контент по типам вопросов -->
      <component :is="QuestionComponents[store.currentQuestion.type] || QuestionQuiz"
                 class="flex-1 w-full"
                 @vote="v => !store.isSpectator && (store.currentQuestion.type === 'sketch' ? store.voteSketch(v) : store.voteAmongUs(v))"
                 @submitSketch="v => !store.isSpectator && store.submitSketch(v)"
                 @submitBet="v => !store.isSpectator && store.submitAuctionBet(v)"
                 @pauseTimer="v => store.pauseAmongUsTimer(v)"
                 @resumeTimer="v => store.resumeAmongUsTimer(v)"
                 @awardWinner="v => store.awardSketchWinner(v)"
                 @action="onAction" />      <!-- Обычный блок ввода ответов (письменный режим / ничья аукциона / амогус) -->
      <div v-if="store.questionStatus === 'text_inputting' || store.questionStatus === 'text_judging'" class="w-full flex flex-col items-center">
        <div v-if="store.questionStatus === 'text_inputting'" class="w-full bg-hub-deep/50 p-6 rounded-xl border border-hub-border mb-8 max-w-2xl mx-auto">

          <!-- Для Ведущего: список игроков и статус -->
          <div v-if="isHost" class="flex flex-col gap-4">
            <h4 class="text-xl font-bold text-hub-text mb-4">Ожидание ответов:</h4>
            <div class="flex gap-4 justify-center flex-wrap">
              <div v-for="player in store.players" :key="player.id" class="flex flex-col items-center gap-2 hub-card p-3 w-32">
                <span class="text-sm font-bold text-hub-text">{{ player.name }}</span>
                <span v-if="store.textAnswers[player.id]" class="text-hub-positive font-bold text-xs bg-hub-positive/15 border border-hub-positive/40 px-2 py-1 rounded">✔ ОТВЕТИЛ</span>
                <span v-else class="text-hub-muted text-xs font-bold animate-pulse">ПИШЕТ…</span>
              </div>
            </div>
            <p class="text-xs text-hub-muted text-center mt-2">Вскрыть ответы — кнопкой на пульте внизу</p>
          </div>

          <!-- Для Игрока (право ответа) -->
          <div v-else-if="canIAnswer" class="flex flex-col items-center gap-6">
            <p class="text-hub-muted text-lg">Введите ваш ответ на вопрос:</p>
            <div v-if="store.textAnswers[store.user?.id]" class="w-full py-5 bg-hub-positive/15 border-2 border-hub-positive/50 text-hub-positive rounded-xl text-xl font-bold text-center">
              Ответ отправлен! Ожидание ведущего…
            </div>
            <div v-else class="w-full relative group">
              <input type="text" v-model="myTextAnswer" @keydown.enter="submitMyAnswer" placeholder="Текст ответа…" class="w-full px-6 py-5 bg-hub-deep border-2 border-hub-border rounded-xl text-hub-text text-xl outline-none focus:border-hub-accent transition-all font-medium" />
              <button @click="submitMyAnswer" class="absolute right-2 top-2 bottom-2 hub-btn-primary px-8 text-lg">Отправить</button>
            </div>
          </div>

          <!-- Для Наблюдателя -->
          <div v-else class="text-hub-muted text-lg font-medium italic py-10 border border-hub-border rounded-xl bg-hub-deep/50 w-full">
            Игроки набирают ответы. Ожидайте…
          </div>

        </div>
        <div v-if="store.questionStatus === 'text_judging'" class="w-full mb-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div v-for="(answer, pId) in store.textAnswers" :key="pId" class="hub-card p-4 flex flex-col items-center">
              <span class="text-hub-muted text-sm mb-2 font-bold">{{ store.players.find(p => p.id == pId)?.name }}</span>
              <span class="text-xl font-bold text-hub-text mb-4">"{{ answer }}"</span>
              <div v-if="isHost" class="flex gap-2 w-full">
                <button @click="store.judgeSingleTextAnswer(pId, true)" class="flex-1 py-2 bg-hub-positive/20 text-hub-positive hover:bg-hub-positive hover:text-white rounded-lg"><Check class="w-5 h-5 mx-auto"/></button>
                <button @click="store.judgeSingleTextAnswer(pId, false)" class="flex-1 py-2 bg-hub-negative/20 text-hub-negative hover:bg-hub-negative hover:text-white rounded-lg"><X class="w-5 h-5 mx-auto"/></button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Блок баззера / чтения / ответа — рендерится для ЛЮБОГО типа вопроса (включая glitch) -->
      <div v-if="['reading','buzzer_countdown','buzzer_active','buzzer_results','answering'].includes(store.questionStatus)" class="w-full">
        
        <div class="mb-4 h-auto min-h-[48px] flex justify-center items-center w-full">
          <div v-if="store.questionStatus === 'reading'" class="text-hub-muted flex flex-col items-center gap-2 animate-pulse mt-4">
            <Mic class="w-8 h-8 text-hub-accent mb-2" />
            <span class="text-xl">Ведущий читает вопрос…</span>
            <span v-if="!isHost" class="text-sm text-hub-muted mt-2">Приготовьтесь! Скоро начнётся отсчёт.</span>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_countdown'" class="text-center w-full relative h-32 md:h-40 flex items-center justify-center">
             <div :key="countdownNumber" class="text-[8rem] md:text-[12rem] font-black font-display text-hub-warning absolute inset-0 flex items-center justify-center pointer-events-none text-glow-amber anim-countdown">
               {{ countdownNumber > 0 ? countdownNumber : 'ГОУ!' }}
             </div>
          </div>

          <!-- Баззер: pointerdown (тач/мышь/перо без задержки), вся площадь — кнопка,
               визуальная пилюля прижата вниз под большой палец на телефоне -->
          <div v-else-if="store.questionStatus === 'buzzer_active' && !isHost && !store.isSpectator" @pointerdown="handleScreenClick" class="absolute inset-0 z-50 sm:rounded-3xl cursor-pointer flex flex-col justify-end items-center pb-[12dvh] sm:pb-8 group touch-none select-none">
            <template v-if="myBuzzerResult">
              <div class="absolute inset-0 sm:rounded-3xl border-4 border-emerald-500/50 bg-emerald-900/40 pointer-events-none"></div>
              <div class="text-xl md:text-3xl font-black text-emerald-400 bg-emerald-950/90 px-6 md:px-12 py-4 rounded-3xl border border-emerald-500 glow-accent pointer-events-none text-center anim-pop-in">
                ОТКЛИК ЗАРЕГИСТРИРОВАН!<br><span class="text-base md:text-xl text-emerald-300 font-bold opacity-80 mt-2 block">Ваше время: {{ myBuzzerResult.time }} мс. Ожидайте...</span>
              </div>
            </template>
            <template v-else>
              <div class="absolute inset-0 sm:rounded-3xl border-4 border-party-pink/60 buzzer-frame pointer-events-none"></div>
              <!-- Глитч: жать надо не рефлекторно, а когда расшифровал — иначе запрёшь себя
                   в ответе, не прочитав вопрос. Поэтому другая надпись + инструкция. -->
              <div class="flex flex-col items-center gap-2 pointer-events-none">
                <p v-if="isGlitch" class="text-sm md:text-base font-bold text-hub-text bg-hub-deep/80 px-4 py-1.5 rounded-full border border-hub-border">
                  Расшифруй текст и жми, когда узнаешь ответ
                </p>
                <div class="text-2xl md:text-3xl font-black font-display text-party-pink bg-hub-deep/90 px-8 md:px-12 py-4 rounded-full border-2 border-party-pink glow-pink group-hover:scale-105 transition-transform">
                  {{ isGlitch ? '🧬 Я УЗНАЛ!' : 'ЖМИТЕ!' }}
                </div>
              </div>
            </template>
          </div>
          
          <div v-else-if="store.questionStatus === 'buzzer_active' && (isHost || store.isSpectator)" class="flex flex-col items-center gap-2 py-4">
             <div class="px-6 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 font-black animate-pulse flex items-center gap-2">
                <BellRing class="w-5 h-5" /> 🚨 БАЗЗЕР АКТИВЕН — ЖДЕМ ОТКЛИКА
             </div>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_results'" class="w-full flex flex-col items-center">
            <h4 class="text-3xl font-black text-emerald-400 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">Результаты реакции</h4>
            <div class="flex flex-col gap-3 w-full max-w-sm">
              <div v-for="(res, idx) in store.buzzerResults" :key="res.playerId" class="flex justify-between items-center p-3 rounded-xl border bg-slate-800" :class="idx === 0 ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-900/40' : 'border-slate-700'">
                <div class="flex items-center gap-3">
                  <span class="text-2xl font-black" :class="idx === 0 ? 'text-emerald-400' : 'text-slate-500'">#{{ idx + 1 }}</span>
                  <span class="font-bold text-lg text-white">{{ store.players.find(p => p.id === res.playerId)?.name }}</span>
                </div>
                <span class="font-mono font-bold text-yellow-400 text-xl">{{ res.time }} мс</span>
              </div>
            </div>
          </div>

          <div v-else-if="store.questionStatus === 'answering'" class="text-emerald-400 text-2xl font-black bg-emerald-900/30 px-6 py-2 rounded-full border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <span v-if="store.answeringPlayerId === store.user?.id">ВЫ ОТВЕЧАЕТЕ</span>
            <span v-else>ОТВЕЧАЕТ: {{ activePlayerName }}</span>
          </div>
        </div>
      </div>

      <!-- Управление ведущего вынесено в докнутую HostPanel (внизу экрана):
           пуск баззера, верно/неверно, вскрытие/рулетка для всех типов, медиа, закрыть. -->

      <Transition name="slide-up">
        <div v-show="store.showAnswer" class="mt-4 p-6 bg-hub-deep/80 border-2 border-hub-accent/30 rounded-2xl relative shadow-xl">
          <p class="text-xs font-black text-hub-accent uppercase tracking-widest mb-2 opacity-70">Правильный ответ:</p>
          <p class="text-3xl md:text-5xl font-black text-hub-accent drop-shadow-[0_0_10px_rgba(73,160,90,0.5)]">{{ store.currentQuestion.a }}</p>
        </div>
      </Transition>

    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { playSfx } from '../lib/sfx'
import { Check, X, BellRing, Mic } from 'lucide-vue-next'
import QuestionQuiz from './questions/QuestionQuiz.vue'
import QuestionShow from './questions/QuestionShow.vue'
import QuestionEveryone from './questions/QuestionEveryone.vue'
import QuestionAmongUs from './questions/QuestionAmongUs.vue'
import QuestionSketch from './questions/QuestionSketch.vue'
import QuestionRps from './questions/QuestionRps.vue'
import QuestionPotato from './questions/QuestionPotato.vue'
import QuestionReaction from './questions/QuestionReaction.vue'

// 8 типов ядра + легаси-алиасы (страховка: миграция паков на сервере — основной механизм)
const QuestionComponents = {
  quiz: QuestionQuiz,
  show: QuestionShow,
  everyone: QuestionEveryone,
  among_us: QuestionAmongUs,
  sketch: QuestionSketch,
  rps: QuestionRps,
  potato: QuestionPotato,
  reaction: QuestionReaction,
  // легаси-id → новые компоненты
  text: QuestionQuiz, media: QuestionQuiz, text_input: QuestionQuiz, glitch: QuestionQuiz,
  snippet: QuestionQuiz, auction: QuestionQuiz, cat: QuestionQuiz, poker: QuestionQuiz,
  charades: QuestionShow, karaoke: QuestionShow, alias: QuestionShow,
  number: QuestionEveryone, tierlist: QuestionEveryone, whosaid: QuestionEveryone
}

const store = useGameStore()
const isHost = computed(() => String(store.host?.id) === String(store.user?.id))
// Глитч меняет смысл баззера: не «жми первым», а «жми, когда расшифровал»
const isGlitch = computed(() => !!store.currentQuestion?.glitch)

// Универсальный мост эмитов новых типов: компонент шлёт {name, payload}.
// player:* режем для наблюдателя; host:* сервер и так вешает только на сокет ведущего.
function onAction({ name, payload } = {}) {
  if (!name) return
  if (name.startsWith('player:') && store.isSpectator) return
  store.emitAction(name, payload)
}

// Локальное состояние UI
const myTextAnswer = ref('')

const activePlayerName = computed(() => {
  if (!store.answeringPlayerId) return ''
  return store.players.find(p => String(p.id) === String(store.answeringPlayerId))?.name || ''
})

const canIAnswer = computed(() => {
  if (isHost.value) return false;
  if (store.isSpectator) return false;
  if (store.answeringPlayerId && String(store.answeringPlayerId) !== String(store.user?.id)) return false;

  // Для шпиона Амогуса (когда идет text_inputting)
  if (store.currentQuestion?.type === 'among_us' && store.questionStatus === 'text_inputting') return true;

  // Ничья аукциона: отвечают текстом только победители ставки (String — id могли пройти через ключи объектов)
  if (store.questionStatus === 'text_inputting' && store.auctionTiePlayers?.length > 0
      && !store.auctionTiePlayers.some(id => String(id) === String(store.user?.id))) return false;

  return true;
})

// Логика Баззера
const localBuzzerActiveTime = ref(0)
const countdownNumber = ref(3)
let countdownInterval = null

const myBuzzerResult = computed(() => {
  return store.buzzerResults?.find(r => r.playerId === store.user?.id)
})

// Снимок счёта отвечающего при входе в answering — чтобы по выходу понять «верно/неверно»
// (сервер не шлёт отдельного события; знак дельты очков различает исходы для sfx)
let answeringSnapshot = null

watch(() => store.questionStatus, (newStatus, oldStatus) => {
  if (newStatus === 'buzzer_active') {
    localBuzzerActiveTime.value = Date.now()
    playSfx('buzzer', { volume: 0.7 })
  }

  if (newStatus === 'answering' && store.answeringPlayerId) {
    const p = store.players.find(x => String(x.id) === String(store.answeringPlayerId))
    answeringSnapshot = p ? { id: p.id, score: p.score } : null
  }
  if (oldStatus === 'answering' && answeringSnapshot) {
    const p = store.players.find(x => String(x.id) === String(answeringSnapshot.id))
    if (p && p.score > answeringSnapshot.score) playSfx('correct')
    else if (p && p.score < answeringSnapshot.score) playSfx('wrong', { volume: 0.8 })
    answeringSnapshot = null
  }

  if (newStatus === 'buzzer_countdown') {
    countdownNumber.value = 3;
    playSfx('tick', { volume: 0.5 })
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      countdownNumber.value--;
      playSfx(countdownNumber.value > 0 ? 'tick' : 'pop', { volume: 0.5 })
      if (countdownNumber.value <= 0) clearInterval(countdownInterval);
    }, 1000);
  } else {
    if (countdownInterval) clearInterval(countdownInterval);
  }
})

function submitMyAnswer() {
  const text = myTextAnswer.value.trim()
  if (text) {
    store.submitTextAnswer(text)
    myTextAnswer.value = ''
  }
}

// Обработка нажатий (баззер): pointerdown/Space
const handleScreenClick = () => {
  if (store.isSpectator) return;
  if (store.questionStatus === 'buzzer_active' && !isHost.value && !myBuzzerResult.value) {
    const reactionTime = Date.now() - localBuzzerActiveTime.value;
    store.pressBuzzer(reactionTime);
    playSfx('pop');
  }
}

const handleKeydown = (e) => {
  if (store.isSpectator) return;
  if (!isHost.value && e.code === 'Space' && store.questionStatus === 'buzzer_active' && !myBuzzerResult.value) {
    e.preventDefault();
    handleScreenClick();
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
/* Прячем стрелочки в input type="number" */
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* Рамка активного баззера: пульс opacity (не box-shadow) — дёшево для компоузера */
.buzzer-frame {
  background: color-mix(in srgb, var(--c-pink) 7%, transparent);
  box-shadow: inset 0 0 50px color-mix(in srgb, var(--c-pink) 25%, transparent);
  animation: kf-pulse-opacity 1s ease-in-out infinite;
}
</style>