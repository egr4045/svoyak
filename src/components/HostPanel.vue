<template>
  <!-- «Пульт» ведущего: виден во время открытого вопроса, ведёт по этапам любого типа.
       Группы: [этап + главное действие] · [медиа/таймер] · [ответ/закрыть] -->
  <div v-if="isHost && store.activeCell" class="panel-glass px-2 md:px-4 py-2 md:py-3 flex flex-wrap items-center gap-x-3 gap-y-2 justify-center anim-rise-in">
    <!-- Группа: этап + контекстное главное действие -->
    <div class="flex items-center gap-2">
      <span class="text-[10px] uppercase tracking-widest text-party-cyan font-black hidden sm:inline">{{ statusLabel }}</span>
      <button v-if="primary" @click="primary.run"
              class="hub-btn-primary px-5 md:px-6 py-2.5 text-sm uppercase tracking-wide"
              :class="primary.tone === 'danger' ? '!bg-hub-negative' : primary.tone === 'positive' ? '!bg-hub-positive' : ''">
        {{ primary.label }}
      </button>

      <!-- Верно / Неверно в состоянии ответа -->
      <template v-if="store.questionStatus === 'answering'">
        <button @click="store.correctAnswer" class="hub-btn-primary !bg-hub-positive px-5 md:px-6 py-2.5 text-sm">✓ Верно</button>
        <button @click="store.wrongAnswer" class="hub-btn-primary !bg-hub-negative px-5 md:px-6 py-2.5 text-sm">✗ Неверно</button>
      </template>
    </div>

    <!-- Группа: медиа + таймер амогуса -->
    <div v-if="hasMedia || (store.questionStatus === 'among_us_voting' && store.amongUsTimerState)"
         class="flex items-center gap-2 border-l border-hub-border pl-3">
      <button v-if="hasMedia"
              @click="store.controlMedia({ status: store.mediaState?.status === 'playing' ? 'stopped' : 'playing' })"
              class="hub-btn px-4 py-2.5 text-sm"
              :class="store.mediaState?.status === 'playing' ? '!border-party-cyan !text-party-cyan' : ''">
        {{ store.mediaState?.status === 'playing' ? '⏹ Стоп медиа' : '▶ Старт медиа' }}
      </button>
      <template v-if="store.questionStatus === 'among_us_voting' && store.amongUsTimerState">
        <button v-if="store.amongUsTimerState.status === 'running'"
                @click="store.pauseAmongUsTimer(store.amongUsTimerState.timeLeft)" class="hub-btn px-4 py-2.5 text-sm">⏸ Пауза</button>
        <button v-else @click="store.resumeAmongUsTimer(store.amongUsTimerState.timeLeft)" class="hub-btn px-4 py-2.5 text-sm">▶ Продолжить</button>
      </template>
    </div>

    <!-- Группа: локальный просмотр ответа + закрыть.
         «Ответ» прячем, когда его нет в broadcast (в числе/шоу сервер затирает q.a) -->
    <div class="flex items-center gap-2 border-l border-hub-border pl-3">
      <button v-if="hasRevealableAnswer" @click="store.showAnswer = !store.showAnswer" class="hub-btn px-4 py-2.5 text-sm">
        {{ store.showAnswer ? '🙈 Скрыть ответ' : '👁 Ответ' }}
      </button>
      <button @click="store.closeQuestion" class="hub-btn px-4 py-2.5 text-sm !text-hub-negative">✕ Закрыть</button>
    </div>
  </div>

  <!-- Подтверждение вскрытия, когда ответили не все (единственное место — пульт) -->
  <div v-if="confirmReveal" class="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4" @click.self="confirmReveal = null">
    <div class="panel-glass border-hub-negative/60 p-8 max-w-lg w-full flex flex-col items-center text-center anim-pop-in">
      <h3 class="text-2xl md:text-3xl font-black text-hub-negative mb-4 uppercase font-display">Ещё не все ответили!</h3>
      <p class="text-hub-muted text-base md:text-lg mb-8">Часть игроков ещё не успела отправить ответ. Вскрываем, лишая их шанса?</p>
      <div class="flex gap-4 w-full">
        <button @click="confirmReveal = null" class="hub-btn flex-1 py-4">Подождать</button>
        <button @click="doConfirmedReveal" class="hub-btn-primary flex-1 py-4 !bg-hub-negative">Вскрываем!</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game'

const store = useGameStore()
const isHost = computed(() => store.host && store.user && String(store.host.id) === String(store.user.id))

const hasMedia = computed(() => ['audio', 'video'].includes(store.currentQuestion?.mediaType))
// В «числе» и «шоу» сервер затирает q.a из broadcast — кнопка показала бы пустоту
const hasRevealableAnswer = computed(() => !!String(store.currentQuestion?.a || '').trim())

const STATUS_LABELS = {
  reading: 'Чтение вопроса',
  buzzer_countdown: 'Отсчёт',
  buzzer_active: 'Баззер активен',
  buzzer_results: 'Результаты',
  answering: 'Ответ игрока',
  text_inputting: 'Игроки пишут',
  text_judging: 'Проверка ответов',
  auction_bidding: 'Торги',
  cat_target_selection: 'Кот в мешке',
  cat_roulette: 'Рулетка крутится',
  among_us_voting: 'Голосование',
  sketch_drawing: 'Игроки рисуют',
  sketch_judging: 'Оценка рисунков',
  performer_select: 'Выбор исполнителя',
  performing: 'Идёт показ',
  alias_playing: 'Алиас: объясняют',
  number_inputting: 'Игроки вводят число',
  number_results: 'Итоги (число)',
  tier_rating: 'Оценка объектов',
  tier_results: 'Итоги тир-листа',
  potato_playing: 'Горячая картошка',
  reaction_active: 'Реакция!',
  whosaid_collecting: 'Пишут ответы',
  whosaid_guessing: 'Угадывают авторов',
  whosaid_results: 'Итоги (кто сказал)',
  rps_picking: 'Камень-ножницы',
  snippet_playing: 'Фрагмент',
}
const statusLabel = computed(() => STATUS_LABELS[store.questionStatus] || '')

// Вопрос отыгран: очки начислены, показывать больше нечего — нужна одна кнопка «дальше».
// Общее правило: статус вернулся в 'idle', но ячейка ещё открыта (так завершаются quiz,
// шоу, скетч, картошка). Плюс явные «экраны итогов», которые остаются в своём статусе.
const isResolved = computed(() => {
  const s = store.questionStatus
  if (!store.activeCell) return false
  if (s === 'idle') return true
  if (s === 'number_results' || s === 'tier_results' || s === 'whosaid_results') return true
  if (s === 'reaction_active' && store.reactionDone) return true
  if (s === 'among_us_voting' && store.amongUsResult) return true
  if (s === 'rps_picking' && store.duelState?.revealed) return true
  return false
})

// Следующий в кольце картошки — подписываем прямо на кнопке паса
const nextPotatoName = computed(() => {
  const ring = store.potatoRing || []
  if (ring.length < 2) return ''
  const idx = ring.findIndex(id => String(id) === String(store.potatoTurnId))
  if (idx === -1) return ''
  return store.getPlayerById(ring[(idx + 1) % ring.length])?.name || ''
})

// Вскрытие письменных ответов: если ответили не все — сначала подтверждение
const confirmReveal = ref(null) // null | 'text' | 'whosaid'
function requestReveal(kind) {
  const total = store.players.length
  const done = kind === 'text' ? Object.keys(store.textAnswers || {}).length : (store.whoSaidCount || 0)
  if (done >= total) doReveal(kind)
  else confirmReveal.value = kind
}
function doReveal(kind) {
  if (kind === 'text') store.revealTextAnswers()
  else store.emitAction('host:revealWhoSaid')
}
function doConfirmedReveal() {
  const kind = confirmReveal.value
  confirmReveal.value = null
  if (kind) doReveal(kind)
}

// Главное контекстное действие для каждого этапа — закрывает «тупики» всех типов
const primary = computed(() => {
  // Отыгранный вопрос: одна очевидная кнопка вместо «залипших» действий
  if (isResolved.value) {
    return { label: 'Далее ▶', tone: 'positive', run: () => store.closeQuestion() }
  }
  switch (store.questionStatus) {
    case 'reading':
      return { label: '▶ Пуск баззера', run: () => store.startBuzzer() }
    case 'buzzer_active':
      // Выход из зависшего баззера, если никто не нажал
      return { label: 'Никто не ответил', tone: 'danger', run: () => store.closeQuestion() }
    case 'text_inputting':
      // У шпиона нет фазы проверки: ответы вскрываются сразу в обсуждение.
      // Кнопка нужна только чтобы не ждать зависшего игрока — обычно переход автоматический.
      return store.currentQuestion?.type === 'among_us'
        ? { label: '🕵 К обсуждению', run: () => requestReveal('text') }
        : { label: 'Вскрыть ответы', run: () => requestReveal('text') }
    case 'auction_bidding':
      return { label: 'Вскрыть ставки', run: () => store.revealAuctionBets() }
    case 'cat_target_selection':
      return { label: '🎰 Крутить рулетку', run: () => store.rouletteCatPlayer() }
    case 'among_us_voting':
      return { label: 'Вскрыть шпиона', tone: 'danger', run: () => store.revealAmongUs() }
    case 'sketch_drawing':
      return { label: 'Завершить рисование', run: () => store.revealSketches() }
    case 'text_judging':
      // Только письменная викторина: шпион в этот статус больше не заходит
      return { label: 'Далее ▶', tone: 'positive', run: () => store.closeQuestion() }
    // --- Типы-мини-игры ---
    case 'performer_select':
      return { label: '🎲 Случайный исполнитель', run: () => store.emitAction('host:setPerformer', null) }
    case 'performing':
      return { label: 'Никто не угадал (пас)', tone: 'danger', run: () => store.emitAction('host:passQuestion') }
    case 'alias_playing':
      return { label: '⏭ Пропустить слово', run: () => store.emitAction('host:aliasSkip') }
    case 'number_inputting':
      return { label: 'Показать, кто ближе', run: () => store.emitAction('host:revealNumber') }
    case 'tier_rating':
      return { label: 'Подвести итоги', run: () => store.emitAction('host:revealTier') }
    case 'whosaid_collecting':
      return { label: 'Вскрыть ответы', run: () => requestReveal('whosaid') }
    case 'whosaid_guessing':
      return { label: 'Показать авторов', run: () => store.emitAction('host:scoreWhoSaid') }
    case 'snippet_playing':
      return { label: '▶ Пуск баззера', run: () => store.startBuzzer() }
    case 'potato_playing': {
      // Пасует ведущий: он слышит ответ игрока. В шипении — та же кнопка, но «горит».
      // Имени может не быть (в кольце один игрок) — тогда без стрелки в пустоту.
      const to = nextPotatoName.value ? ` ➡ ${nextPotatoName.value}` : ' дальше'
      return store.potatoFizzing
        ? { label: `🔥 Горит! Передать${to}`, tone: 'danger', run: () => store.emitAction('host:passPotato') }
        : { label: `Передать${to}`, run: () => store.emitAction('host:passPotato') }
    }
    case 'reaction_active':
      return { label: 'Показать ответ', tone: 'danger', run: () => store.emitAction('host:endReaction') }
    default:
      return null
  }
})
</script>
