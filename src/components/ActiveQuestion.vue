<template>
  <div v-if="store.activeCell" class="absolute inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-slate-950/90 backdrop-blur-sm rounded-3xl">
    <div class="bg-slate-900 border border-blue-800/50 rounded-2xl p-4 md:p-6 max-w-4xl w-full shadow-2xl flex flex-col text-center relative max-h-[95vh] overflow-y-auto">
      
      <!-- Custom UI Alert -->
      <div v-if="customAlert" class="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 border-2 border-rose-400 text-white font-bold px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(225,29,72,0.8)] animate-pulse transition-all">
          ⚠️ {{ customAlert }}
      </div>
      
      <!-- Confirm Reveal Dialog -->
      <div v-if="confirmRevealDialog" class="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
         <div class="bg-slate-900 border-2 border-rose-500 rounded-3xl p-8 max-w-lg w-full flex flex-col items-center text-center shadow-[0_0_50px_rgba(225,29,72,0.3)]">
            <h3 class="text-3xl font-black text-rose-500 mb-4 uppercase">Еще не все ответили!</h3>
            <p class="text-slate-300 text-lg mb-8">Часть игроков еще не успела отправить свой ответ. Вскрываем, лишая их шанса?</p>
            <div class="flex gap-4 w-full">
               <button @click="confirmRevealDialog = false" class="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition border border-slate-700">Подождать</button>
               <button @click="confirmRevealDialog = false; store.revealTextAnswers()" class="flex-1 py-4 bg-rose-600 hover:bg-rose-500 rounded-xl text-white font-black transition shadow-[0_0_20px_rgba(225,29,72,0.5)] border border-rose-400">Вскрываем!</button>
            </div>
         </div>
      </div>

      <div class="inline-block px-4 py-1.5 rounded-lg bg-blue-950/50 text-blue-400 font-medium text-sm mb-6 border border-blue-800/50 mx-auto">
        {{ store.currentCategoryName }} — 
        <span class="text-yellow-500 font-bold">
          {{ store.activeBet !== null ? store.activeBet : store.currentQuestion.points }}
        </span>
        <span class="ml-2 px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs border border-purple-800" v-if="store.currentQuestion.type === 'cat'">
          Кот в мешке
        </span>
        <span class="ml-2 px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs border border-yellow-800" v-else-if="store.currentQuestion.type === 'auction'">
          Аукцион
        </span>
      </div>

      <!-- Динамический контент по типам вопросов -->
      <component :is="QuestionComponents[store.currentQuestion.type] || QuestionStandard"
                 class="flex-1 w-full"
                 @pokerAction="v => !store.isSpectator && store.pokerAction(v.action, v.amount)"
                 @vote="v => !store.isSpectator && (store.currentQuestion.type === 'sketch' ? store.voteSketch(v) : store.voteAmongUs(v))"
                 @submitSketch="v => !store.isSpectator && store.submitSketch(v)"
                 @submitBet="v => !store.isSpectator && store.submitAuctionBet(v)"
                 @pauseTimer="v => store.pauseAmongUsTimer(v)"
                 @resumeTimer="v => store.resumeAmongUsTimer(v)"
                 @awardWinner="v => store.awardSketchWinner(v)" />      <!-- Обычный блок ввода ответов (text_input / text_inputting / text_judging) -->
      <div v-if="store.currentQuestion.type === 'text_input' || store.questionStatus === 'text_inputting' || store.questionStatus === 'text_judging'" class="w-full flex flex-col items-center">
        <div v-if="store.questionStatus === 'text_inputting'" class="w-full bg-slate-950/50 p-6 rounded-xl border border-slate-800 mb-8 max-w-2xl mx-auto">
          
          <!-- Для Ведущего: список игроков и статус -->
          <div v-if="isHost" class="flex flex-col gap-4">
            <h4 class="text-xl font-bold text-slate-300 mb-4">Ожидание ответов:</h4>
            <div class="flex gap-4 justify-center flex-wrap">
              <div v-for="player in store.players" :key="player.id" class="flex flex-col items-center gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700 w-32 shadow-inner">
                <span class="text-sm font-bold text-slate-300">{{ player.name }}</span>
                <span v-if="store.textAnswers[player.id]" class="text-emerald-400 font-bold text-xs bg-emerald-900/30 border border-emerald-500/50 px-2 py-1 rounded">✔ ОТВЕТИЛ</span>
                <span v-else class="text-slate-500 text-xs font-bold animate-pulse">ПИШЕТ...</span>
              </div>
            </div>
            <button @click="requestRevealTextAnswers" class="mt-8 py-4 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 w-full hover:scale-[1.02]"><Eye class="w-6 h-6" /> ВСКРЫТЬ ОТВЕТЫ</button>
          </div>
          
          <!-- Для Игрока (право ответа) -->
          <div v-else-if="canIAnswer" class="flex flex-col items-center gap-6">
            <p class="text-slate-400 text-lg">Введите ваш ответ на вопрос:</p>
            <div v-if="store.textAnswers[store.user?.id]" class="w-full py-5 bg-emerald-900/40 border-2 border-emerald-500/50 text-emerald-400 rounded-xl text-xl font-bold text-center shadow-inner">
              Ответ отправлен! Ожидание ведущего...
            </div>
            <div v-else class="w-full relative group">
              <input type="text" v-model="myTextAnswer" @keydown.enter="submitMyAnswer" placeholder="Текст ответа..." class="w-full px-6 py-5 bg-slate-900 border-2 border-slate-600 rounded-xl text-white text-xl outline-none focus:border-blue-500 focus:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all font-medium" />
              <button @click="submitMyAnswer" class="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 rounded-lg transition-colors text-lg">Отправить</button>
            </div>
          </div>

          <!-- Для Наблюдателя -->
          <div v-else class="text-slate-400 text-lg font-medium italic py-10 border border-slate-700 rounded-xl bg-slate-900/50 shadow-inner w-full">
            Игроки набирают ответы. Ожидайте...
          </div>

        </div>
        <div v-if="store.questionStatus === 'text_judging'" class="w-full mb-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div v-for="(answer, pId) in store.textAnswers" :key="pId" class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
              <span class="text-slate-400 text-sm mb-2 font-bold">{{ store.players.find(p => p.id == pId)?.name }}</span>
              <span class="text-xl font-bold text-white mb-4">"{{ answer }}"</span>
              <div v-if="isHost" class="flex gap-2 w-full">
                <button @click="store.judgeSingleTextAnswer(pId, true)" class="flex-1 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 rounded-lg"><Check class="w-5 h-5 mx-auto"/></button>
                <button @click="store.judgeSingleTextAnswer(pId, false)" class="flex-1 py-2 bg-rose-600/20 text-rose-400 hover:bg-rose-600 rounded-lg"><X class="w-5 h-5 mx-auto"/></button>
              </div>
            </div>
          </div>
          <div class="mt-8 flex justify-center gap-4">
            <button v-if="isHost && store.currentQuestion.type === 'among_us'" @click="store.startAmongUsTimer" class="py-3 px-8 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-[0_0_15px_rgba(225,29,72,0.5)]">Начать обсуждение (Таймер)</button>
            <button v-else-if="isHost" @click="store.closeQuestion" class="py-3 px-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">Закрыть вопрос</button>
          </div>
        </div>
      </div>
      <!-- Блок баззера / чтения / ответа — рендерится для ЛЮБОГО типа вопроса (включая glitch) -->
      <div v-if="['reading','buzzer_countdown','buzzer_active','buzzer_results','answering'].includes(store.questionStatus)" class="w-full">
        
        <div class="mb-4 h-auto min-h-[48px] flex justify-center items-center w-full">
          <div v-if="store.questionStatus === 'reading'" class="text-slate-400 flex flex-col items-center gap-2 animate-pulse mt-4">
            <Mic class="w-8 h-8 text-blue-400 mb-2" /> 
            <span class="text-xl">Ведущий читает вопрос...</span>
            <span v-if="!isHost" class="text-sm text-slate-500 mt-2">Приготовьтесь! Скоро начнется отсчет.</span>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_countdown'" class="text-center w-full relative h-40 flex items-center justify-center">
             <div :key="countdownNumber" class="text-[12rem] font-black text-amber-500 absolute inset-0 flex items-center justify-center pointer-events-none drop-shadow-[0_0_50px_rgba(245,158,11,0.8)] animate-pulse" style="animation-duration: 1s;">
               {{ countdownNumber > 0 ? countdownNumber : 'ГОУ!' }}
             </div>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_active' && !isHost && !store.isSpectator" @mousedown="handleScreenClick" class="absolute inset-0 z-50 rounded-3xl cursor-pointer flex flex-col justify-end items-center pb-8 group">
            <template v-if="myBuzzerResult">
              <div class="absolute inset-0 rounded-3xl border-4 border-emerald-500/50 bg-emerald-900/40 pointer-events-none"></div>
              <div class="text-3xl font-black text-emerald-400 bg-emerald-950/90 px-12 py-4 rounded-full border border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)] pointer-events-none text-center">
                ОТКЛИК ЗАРЕГИСТРИРОВАН!<br><span class="text-xl text-emerald-300 font-bold opacity-80 mt-2 block">Ваше время: {{ myBuzzerResult.time }} мс. Ожидайте...</span>
              </div>
            </template>
            <template v-else>
              <div class="absolute inset-0 rounded-3xl border-4 border-rose-500/50 animate-pulse bg-rose-900/10 shadow-[inset_0_0_50px_rgba(225,29,72,0.2)] pointer-events-none"></div>
              <div class="text-3xl font-black text-rose-400 bg-rose-950/80 px-12 py-4 rounded-full border border-rose-500 shadow-[0_0_30px_rgba(225,29,72,0.6)] group-hover:scale-105 transition-transform pointer-events-none">
                ВРЕМЯ ПОШЛО — ЖМИТЕ!
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

          <div v-else-if="store.questionStatus === 'cat_target_selection'" class="text-purple-400 flex items-center gap-2">Выбор жертвы для Кота...</div>
          <div v-else-if="store.questionStatus === 'auction_bidding'" class="text-yellow-400 flex items-center gap-2">Идут торги...</div>
          <div v-else-if="store.questionStatus === 'answering'" class="text-emerald-400 text-2xl font-black bg-emerald-900/30 px-6 py-2 rounded-full border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <span v-if="store.answeringPlayerId === store.user?.id">ВЫ ОТВЕЧАЕТЕ</span>
            <span v-else>ОТВЕЧАЕТ: {{ activePlayerName }}</span>
          </div>
        </div>
      </div>

      <!-- Управление ведущего вынесено в докнутую HostPanel (внизу экрана):
           пуск баззера, верно/неверно, вскрытие/рулетка для всех типов, медиа, закрыть. -->

      <Transition name="slide-up">
        <div v-show="store.showAnswer" class="mt-4 p-6 bg-slate-800/80 border-2 border-amber-500/30 rounded-2xl relative shadow-xl">
          <p class="text-xs font-black text-amber-500 uppercase tracking-widest mb-2 opacity-70">Правильный ответ:</p>
          <p class="text-3xl md:text-5xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">{{ store.currentQuestion.a }}</p>
        </div>
      </Transition>

    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { Eye, EyeOff, Check, X, Play, Square, BellRing, Mic } from 'lucide-vue-next'
import QuestionStandard from './questions/QuestionStandard.vue'
import QuestionGlitch from './questions/QuestionGlitch.vue'
import QuestionPoker from './questions/QuestionPoker.vue'
import QuestionAmongUs from './questions/QuestionAmongUs.vue'
import QuestionSketch from './questions/QuestionSketch.vue'
import QuestionAuction from './questions/QuestionAuction.vue'
import QuestionCat from './questions/QuestionCat.vue'

const QuestionComponents = {
  text: QuestionStandard,
  media: QuestionStandard,
  text_input: QuestionStandard,
  glitch: QuestionGlitch,
  poker: QuestionPoker,
  among_us: QuestionAmongUs,
  sketch: QuestionSketch,
  auction: QuestionAuction,
  cat: QuestionCat
}

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)

// Локальное состояние UI
const customAlert = ref('')
const confirmRevealDialog = ref(false)
const manualPlayerId = ref('')
const revealLoading = ref(false)
const myTextAnswer = ref('')

const myBalance = computed(() => {
  return store.players.find(p => p.id === store.user?.id)?.score || 0
})

const activePlayerName = computed(() => {
  if (!store.answeringPlayerId) return ''
  return store.players.find(p => p.id === store.answeringPlayerId)?.name || ''
})

const canIAnswer = computed(() => {
  if (isHost.value) return false;
  if (store.isSpectator) return false;
  if (store.answeringPlayerId && store.answeringPlayerId !== store.user?.id) return false;
  
  // Для шпиона Амогуса (когда идет text_inputting)
  if (store.currentQuestion?.type === 'among_us' && store.questionStatus === 'text_inputting') return true;
  
  // Ограничение для покера и аукциона (отвечают только живые/победители)
  if (store.currentQuestion?.type === 'poker' && store.questionStatus === 'text_inputting' && !store.pokerActivePlayers.includes(store.user?.id)) return false;
  if (store.questionStatus === 'text_inputting' && store.auctionTiePlayers?.length > 0 && !store.auctionTiePlayers.includes(store.user?.id)) return false;
  
  return true;
})

// Логика Баззера
const localBuzzerActiveTime = ref(0)
const countdownNumber = ref(3)
let countdownInterval = null

const myBuzzerResult = computed(() => {
  return store.buzzerResults?.find(r => r.playerId === store.user?.id)
})

watch(() => store.questionStatus, (newStatus) => {
  if (newStatus === 'buzzer_active') {
    localBuzzerActiveTime.value = Date.now()
  }
  
  if (newStatus === 'buzzer_countdown') {
    countdownNumber.value = 3;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      countdownNumber.value--;
      if (countdownNumber.value <= 0) clearInterval(countdownInterval);
    }, 1000);
  } else {
    if (countdownInterval) clearInterval(countdownInterval);
  }

  if (newStatus !== 'auction_bidding') {
    revealLoading.value = false
  }
})

// Методы управления
function requestRevealTextAnswers() {
  const allAnswered = store.players.every(p => store.textAnswers[p.id]);
  if (allAnswered) {
    store.revealTextAnswers();
  } else {
    confirmRevealDialog.value = true;
  }
}

function submitMyAnswer() {
  const text = myTextAnswer.value.trim()
  if (text) {
    store.submitTextAnswer(text)
    myTextAnswer.value = ''
  }
}

function awardManual(isCorrect) {
  if (!manualPlayerId.value) return;
  const pts = store.activeBet !== null ? store.activeBet : store.currentQuestion.points;
  store.adjustScore(manualPlayerId.value, isCorrect ? pts : -pts);
  manualPlayerId.value = '';
}

function showCustomAlert(msg) {
  customAlert.value = msg;
  setTimeout(() => { customAlert.value = '' }, 3000);
}

// Обработка кликов и клавиш (баззер)
const handleScreenClick = () => {
  if (store.isSpectator) return;
  if (store.questionStatus === 'buzzer_active' && !isHost.value && !myBuzzerResult.value) {
    const reactionTime = Date.now() - localBuzzerActiveTime.value;
    store.pressBuzzer(reactionTime);
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
</style>