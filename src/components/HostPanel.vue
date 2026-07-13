<template>
  <!-- Панель ведущего: видна во время открытого вопроса, ведёт по этапам любого типа -->
  <div v-if="isHost && store.activeCell" class="panel-glass px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
    <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black mr-1">{{ statusLabel }}</span>

    <!-- Контекстное главное действие (в т.ч. вскрытие/рулетка для «залипающих» типов) -->
    <button v-if="primary" @click="primary.run"
            class="hub-btn-primary px-6 py-2 text-sm uppercase tracking-wide"
            :class="primary.tone === 'danger' ? '!bg-hub-negative' : primary.tone === 'positive' ? '!bg-hub-positive' : ''">
      {{ primary.label }}
    </button>

    <!-- Верно / Неверно в состоянии ответа -->
    <template v-if="store.questionStatus === 'answering'">
      <button @click="store.correctAnswer" class="hub-btn-primary !bg-hub-positive px-6 py-2 text-sm">✓ Верно</button>
      <button @click="store.wrongAnswer" class="hub-btn-primary !bg-hub-negative px-6 py-2 text-sm">✗ Неверно</button>
    </template>

    <!-- Пауза/продолжение таймера Амогуса -->
    <template v-if="store.questionStatus === 'among_us_voting' && store.amongUsTimerState">
      <button v-if="store.amongUsTimerState.status === 'running'"
              @click="store.pauseAmongUsTimer(store.amongUsTimerState.timeLeft)" class="hub-btn px-4 py-2 text-sm">⏸ Пауза</button>
      <button v-else @click="store.resumeAmongUsTimer(store.amongUsTimerState.timeLeft)" class="hub-btn px-4 py-2 text-sm">▶ Продолжить</button>
    </template>

    <!-- Медиа (аудио/видео) -->
    <button v-if="hasMedia"
            @click="store.controlMedia({ status: store.mediaState?.status === 'playing' ? 'stopped' : 'playing' })"
            class="hub-btn px-4 py-2 text-sm">
      {{ store.mediaState?.status === 'playing' ? '⏹ Стоп медиа' : '▶ Старт медиа' }}
    </button>

    <!-- Показать ответ (локальный просмотр ведущего) -->
    <button @click="store.showAnswer = !store.showAnswer" class="hub-btn px-4 py-2 text-sm">
      {{ store.showAnswer ? '🙈 Скрыть ответ' : '👁 Ответ' }}
    </button>

    <!-- Закрыть вопрос -->
    <button @click="store.closeQuestion" class="hub-btn px-4 py-2 text-sm !text-hub-negative">✕ Закрыть</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const store = useGameStore()
const isHost = computed(() => store.host && store.user && String(store.host.id) === String(store.user.id))

const hasMedia = computed(() => ['audio', 'video'].includes(store.currentQuestion?.mediaType))

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
  poker_bidding: 'Покер-ставки',
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

// Главное контекстное действие для каждого этапа — закрывает «тупики» всех типов
const primary = computed(() => {
  switch (store.questionStatus) {
    case 'reading':
      return { label: '▶ Пуск баззера', run: () => store.startBuzzer() }
    case 'buzzer_active':
      // Выход из зависшего баззера, если никто не нажал
      return { label: 'Никто не ответил', tone: 'danger', run: () => store.closeQuestion() }
    case 'text_inputting':
      return { label: 'Вскрыть ответы', run: () => store.revealTextAnswers() }
    case 'auction_bidding':
      return { label: 'Вскрыть ставки', run: () => store.revealAuctionBets() }
    case 'cat_target_selection':
      return { label: '🎰 Крутить рулетку', run: () => store.rouletteCatPlayer() }
    case 'among_us_voting':
      return { label: 'Вскрыть шпиона', tone: 'danger', run: () => store.revealAmongUs() }
    case 'sketch_drawing':
      return { label: 'Завершить рисование', run: () => store.revealSketches() }
    case 'text_judging':
      // Для Амогуса после проверки — запуск голосования; иначе просто закрыть
      return store.currentQuestion?.type === 'among_us'
        ? { label: '🕵 Начать голосование', run: () => store.startAmongUsTimer() }
        : null
    // --- Новые типы-мини-игры ---
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
      return { label: 'Вскрыть ответы', run: () => store.emitAction('host:revealWhoSaid') }
    case 'whosaid_guessing':
      return { label: 'Показать авторов', run: () => store.emitAction('host:scoreWhoSaid') }
    case 'snippet_playing':
      return { label: '▶ Пуск баззера', run: () => store.startBuzzer() }
    case 'reaction_active':
      return { label: 'Показать ответ', tone: 'danger', run: () => store.emitAction('host:endReaction') }
    default:
      return null
  }
})
</script>
