<template>
  <div class="flex flex-col items-center gap-4 py-3 w-full">
    <p class="text-xl font-bold text-hub-text">🗣 {{ store.currentQuestion.q || 'Ответьте на вопрос' }}</p>

    <!-- Сбор ответов -->
    <template v-if="store.questionStatus === 'whosaid_collecting'">
      <div v-if="!isHost && !store.isSpectator && !submittedAnswer" class="w-full max-w-md flex flex-col gap-3">
        <textarea v-model="myAnswer" rows="2" class="hub-input w-full" placeholder="Ваш ответ (анонимно)…"></textarea>
        <button @click="submitAnswer" class="hub-btn-primary py-3">Отправить</button>
      </div>
      <div v-else-if="submittedAnswer" class="py-4 text-hub-positive font-bold">Ответ принят ✓</div>
      <div v-else class="text-hub-muted">Написали: {{ store.whoSaidCount }} / {{ store.players.length }}</div>
    </template>

    <!-- Угадывание авторов -->
    <template v-else-if="store.questionStatus === 'whosaid_guessing'">
      <div v-if="!isHost && !store.isSpectator && !submittedGuesses" class="w-full max-w-lg flex flex-col gap-3">
        <div v-for="a in store.whoSaidAnswers" :key="a.idx" class="hub-card p-3 flex flex-col gap-2">
          <span class="italic text-hub-text">«{{ a.text }}»</span>
          <select v-model="guesses[a.idx]" class="hub-input text-sm">
            <option :value="undefined" disabled>Кто это сказал?</option>
            <option v-for="p in store.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button @click="submitGuesses" class="hub-btn-primary py-3">Отправить догадки</button>
      </div>
      <div v-else-if="submittedGuesses" class="py-4 text-hub-positive font-bold">Догадки приняты ✓</div>
      <div v-else class="w-full max-w-lg flex flex-col gap-2">
        <p class="text-hub-muted text-center">Угадали: {{ store.whoSaidCount }} / {{ store.players.length }}</p>
        <div v-for="a in store.whoSaidAnswers" :key="a.idx" class="hub-card p-2 italic text-hub-muted text-sm">«{{ a.text }}»</div>
      </div>
    </template>

    <!-- Итоги -->
    <template v-else-if="store.whoSaidResult">
      <div class="w-full max-w-lg flex flex-col gap-2">
        <div v-for="a in store.whoSaidResult.answers" :key="a.idx" class="hub-card p-3 flex justify-between items-center">
          <span class="italic text-hub-text">«{{ a.text }}»</span>
          <span class="font-black text-hub-accent">{{ a.authorName }}</span>
        </div>
      </div>
      <div class="w-full max-w-md mt-2">
        <h4 class="text-sm font-black uppercase tracking-widest text-hub-muted mb-2">Очки</h4>
        <div v-for="s in scoreboard" :key="s.id" class="flex justify-between p-2 rounded-lg bg-hub-deep/50 border border-hub-border">
          <span class="font-bold">{{ s.name }}</span>
          <span class="text-hub-positive font-black">+{{ s.score }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)

const myAnswer = ref('')
const guesses = ref({})
const localSentAnswer = ref(false)
const localSentGuesses = ref(false)

// Факт своего ответа сервер не раскрывает пофамильно, поэтому опираемся на локальный флаг
const submittedAnswer = computed(() => localSentAnswer.value)
const submittedGuesses = computed(() => localSentGuesses.value)

const scoreboard = computed(() => {
  const res = store.whoSaidResult
  if (!res) return []
  return Object.entries(res.scores)
    .map(([id, score]) => ({ id, score, name: store.getPlayerById(id)?.name || id }))
    .sort((a, b) => b.score - a.score)
})

function submitAnswer() {
  const t = myAnswer.value.trim()
  if (!t) return
  emit('action', { name: 'player:submitWhoSaid', payload: { text: t } })
  localSentAnswer.value = true
}
function submitGuesses() {
  emit('action', { name: 'player:guessAuthor', payload: { guesses: guesses.value } })
  localSentGuesses.value = true
}
</script>
