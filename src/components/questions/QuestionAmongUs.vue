<template>
  <div class="flex-1 flex flex-col items-center">
    <!-- Фаза ответов: вопрос видят все, КРОМЕ шпиона (механика «Хамелеона») -->
    <div v-if="store.questionStatus === 'text_inputting'" class="w-full max-w-3xl mx-auto mb-4">
      <!-- Я — шпион: задание сразу, без промежуточных экранов -->
      <div v-if="amImposter" class="bg-hub-negative/10 border-2 border-hub-negative/50 rounded-2xl p-5 text-center anim-pop-in">
        <p class="text-4xl mb-1">🕵️</p>
        <p class="text-2xl font-black text-hub-negative mb-2 font-display">ВЫ — ШПИОН</p>
        <p class="text-xs uppercase tracking-widest text-hub-muted mb-1">Ваше задание</p>
        <p class="text-base text-hub-text mb-3">
          Вопроса вы не видите. Напишите <b>правдоподобный</b> ответ и не спалитесь на обсуждении.
        </p>
        <div v-if="topic" class="inline-block rounded-xl bg-hub-deep/70 border border-hub-negative/40 px-4 py-2">
          <span class="text-[10px] uppercase tracking-widest text-hub-muted block">Тема категории</span>
          <span class="font-black text-hub-text">{{ topic }}</span>
        </div>
      </div>
      <!-- Мирные (и ведущий) -->
      <template v-else>
        <h3 class="text-xl md:text-3xl font-black text-hub-text text-center mb-2">{{ store.currentQuestion.q }}</h3>
        <p class="text-xs text-hub-muted text-center">🕵️ Среди вас шпион — он <b>не видит</b> вопрос. Отвечайте честно, потом вычислите блефующего.</p>
        <p v-if="isHost && hostReveal" class="text-xs text-center mt-1 text-hub-warning">👁 Для ведущего: шпион — <b>{{ hostReveal.imposterName }}</b></p>
      </template>
    </div>

    <!-- Обсуждение и голосование: ответы всех на виду, «верно/неверно» тут не существует -->
    <div v-if="store.questionStatus === 'among_us_voting'" class="w-full max-w-5xl mx-auto space-y-5 mb-8">
      <div class="text-center">
        <p class="text-sm text-hub-muted mb-1">Вопрос был: <b class="text-hub-text">{{ store.currentQuestion.q }}</b></p>
        <p class="text-lg font-black text-hub-text">Один из этих ответов написан вслепую. Кто блефовал?</p>
        <p class="text-xs text-hub-muted mt-1">
          Толпа угадала: голосовавшим верно <b class="text-party-lime">+{{ pts }}</b>, шпиону <b class="text-hub-negative">−{{ pts * 2 }}</b> ·
          Не угадала: шпиону <b class="text-party-lime">+{{ pts * 2 }}</b>, остальным <b class="text-hub-negative">−{{ pts }}</b>
        </p>
      </div>

      <!-- Карточка = ОТВЕТ (он главный), автор подписан снизу; клик = голос -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div v-for="player in store.players" :key="player.id"
             @click="vote(player.id)"
             class="group relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all"
             :class="[
               myVote === String(player.id) ? 'bg-hub-negative/20 border-hub-negative glow-pink' : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10',
               isMe(player.id) || store.isSpectator || store.amongUsResult ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
             ]">
          <!-- Ответ -->
          <div class="flex-1 flex items-center justify-center text-center px-4 py-6 min-h-[92px]">
            <span v-if="answerOf(player.id)" class="text-lg md:text-xl font-black text-hub-text break-words">«{{ answerOf(player.id) }}»</span>
            <span v-else class="text-sm text-hub-muted italic">не успел ответить</span>
          </div>
          <!-- Автор + голоса -->
          <div class="flex items-center gap-2 px-3 py-2 bg-hub-deep/70 border-t border-white/5">
            <img v-if="player.avatar && store.avatarIsImage(player.avatar)" :src="store.getAvatarUrl(player.avatar)" class="w-7 h-7 rounded-lg object-cover shrink-0" />
            <div v-else class="w-7 h-7 rounded-lg bg-hub-solid flex items-center justify-center text-sm shrink-0">{{ player.avatar || (player.name || '?').charAt(0).toUpperCase() }}</div>
            <span class="font-bold text-xs truncate flex-1">{{ player.name }}<span v-if="isMe(player.id)" class="text-hub-muted"> (вы)</span></span>
            <div class="flex -space-x-1 shrink-0">
              <div v-for="v in votesFor(player.id)" :key="v" class="w-2.5 h-2.5 rounded-full bg-hub-negative border border-black/60" />
            </div>
          </div>

          <div v-if="store.amongUsResult && String(player.id) === String(store.imposterId)"
               class="absolute inset-0 bg-hub-negative/40 flex items-center justify-center anim-pop-in">
            <span class="font-black text-white rotate-12 text-base uppercase tracking-widest border-2 border-white px-3 py-1">Шпион</span>
          </div>
        </div>
      </div>

      <p v-if="!store.amongUsResult && !store.isSpectator && !isHost && !myVote" class="text-center text-xs text-hub-muted animate-pulse">
        Обсуждайте вслух, потом ткните в подозрительный ответ
      </p>

      <div v-if="store.amongUsTimerState" class="p-4 rounded-2xl bg-hub-deep/60 border border-white/5 flex flex-col items-center gap-2">
        <span class="text-[10px] font-black uppercase tracking-[0.3em] text-hub-muted">Время на обсуждение</span>
        <div class="text-3xl font-mono font-black" :class="displayTimeLeft < 10 ? 'text-hub-negative animate-pulse' : 'text-hub-text'">
          {{ formatTime(displayTimeLeft) }}
        </div>
        <!-- Пауза/продолжение и вскрытие — на пульте ведущего внизу (единое место управления) -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['vote'])
const isHost = computed(() => String(store.host?.id) === String(store.user?.id))
const pts = computed(() => store.currentQuestion?.points || 0)

// Приватная роль из privateReveal (вне broadcast): шпион узнаёт себя, ведущий — имя шпиона
const amImposter = computed(() => !isHost.value && store.privateReveal?.kind === 'imposter')
const hostReveal = computed(() => store.privateReveal?.kind === 'imposter_host' ? store.privateReveal : null)
const topic = computed(() => store.privateReveal?.topic || null)

// Ключи textAnswers/amongUsVotes — строки (объект), id игрока — число из БД
const isMe = (id) => String(id) === String(store.user?.id)
const answerOf = (id) => store.textAnswers?.[id] ?? store.textAnswers?.[String(id)] ?? null
const myVote = computed(() => {
  const v = store.amongUsVotes?.[store.user?.id]
  return v == null ? null : String(v)
})
const votesFor = (id) => Object.values(store.amongUsVotes || {}).filter(v => String(v) === String(id)).length

// Живой отсчёт: пока таймер «running», считаем остаток от endsAt (сервер тикает не сам);
// на паузе показываем сохранённый timeLeft
const now = ref(Date.now())
let ticker = null
onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 500) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

const displayTimeLeft = computed(() => {
  const t = store.amongUsTimerState
  if (!t) return 0
  if (t.status === 'running' && t.endsAt) return Math.max(0, Math.ceil((t.endsAt - now.value) / 1000))
  return t.timeLeft ?? 0
})

const vote = (targetId) => {
  if (store.isSpectator || isMe(targetId) || store.amongUsResult) return
  if (store.questionStatus === 'among_us_voting') emit('vote', targetId)
}

const formatTime = (s) => {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}
</script>
