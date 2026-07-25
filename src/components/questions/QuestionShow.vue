<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <!-- Выбор исполнителя -->
    <template v-if="store.questionStatus === 'performer_select'">
      <p class="text-lg text-hub-text font-bold">{{ icon }} {{ store.currentQuestion.q || selectPrompt }}</p>
      <PlayerPicker v-if="isHost" :label="pickerLabel" @pick="setPerformer" />
      <p v-else class="text-hub-muted italic">Ведущий выбирает исполнителя…</p>
    </template>

    <!-- Показ / исполнение (крокодил и караоке) -->
    <template v-else-if="store.questionStatus === 'performing'">
      <!-- Караоке-исполнитель: приватный аудио-реф + название (в наушник) -->
      <div v-if="mode === 'karaoke' && amPerformer && reveal" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/50 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black">🎧 Только вы это слышите — напевайте!</p>
        <p class="text-2xl font-black text-hub-accent break-words">{{ reveal.text }}</p>
        <button v-if="reveal.mediaSrc" @click="playRef" class="hub-btn-primary text-sm">▶ {{ played ? 'Переслушать реф' : 'Слушать реф' }}</button>
        <p class="text-[11px] text-hub-warning">Наденьте наушники, иначе оригинал попадёт в микрофон.</p>
        <audio ref="audioEl" :src="refUrl" preload="auto"></audio>
      </div>
      <!-- Секрет (слово/название): исполнитель и ведущий -->
      <div v-else-if="secretWord" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/50 rounded-2xl p-6 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-2">
          {{ amPerformer ? performerHint : secretLabel }}
        </p>
        <p class="text-4xl font-black text-hub-accent break-words">{{ secretWord }}</p>
      </div>
      <!-- Остальные угадывают -->
      <p v-else class="text-2xl text-hub-text font-black">{{ mode === 'karaoke' ? '🎤 Угадывайте песню вслух!' : '🎭 Отгадывайте вслух!' }}</p>
      <p v-if="!isHost && !amPerformer" class="text-hub-muted text-sm">Ведущий отметит того, кто угадает.</p>

      <PlayerPicker v-if="isHost" label="Кто угадал?" @pick="awardGuess" />
    </template>

    <!-- Алиас: объяснение слов на таймере -->
    <template v-else-if="store.questionStatus === 'alias_playing'">
      <div class="flex items-center gap-4">
        <span class="text-hub-muted text-sm font-bold">Слово {{ (aliasSt?.index ?? 0) + 1 }} / {{ aliasSt?.total ?? 0 }}</span>
        <span class="text-2xl font-black tabular-nums" :class="secondsLeft <= 10 ? 'text-hub-negative' : 'text-hub-accent'">⏱ {{ secondsLeft }}</span>
        <span class="text-hub-positive text-sm font-bold">✔ {{ aliasSt?.guessedCount ?? 0 }}</span>
      </div>

      <!-- Приватное слово: объясняющий и ведущий -->
      <div v-if="secretWord" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/50 rounded-2xl p-6 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-2">
          {{ amPerformer ? '🗣 Объясняйте — не называйте!' : '👁 Слово (для ведущего)' }}
        </p>
        <p class="text-4xl font-black text-hub-accent break-words">{{ secretWord }}</p>
      </div>
      <p v-else class="text-2xl text-hub-text font-black">🗣 Выкрикивайте варианты!</p>

      <PlayerPicker v-if="isHost" label="Кто угадал это слово?" @pick="aliasGuessed" />
    </template>

    <!-- Итог алиаса -->
    <template v-else-if="mode === 'alias' && store.aliasResult">
      <p class="text-hub-positive text-xl font-black">Угадано {{ store.aliasResult.guessed }} из {{ store.aliasResult.total }} 🎉</p>
    </template>

    <!-- Итог крокодила/караоке (кто угадал / пас) — после начисления, до закрытия -->
    <template v-else-if="store.performResult">
      <p v-if="store.performResult.pass" class="text-hub-muted text-lg">Никто не угадал 🤷</p>
      <p v-else class="text-hub-positive text-lg font-bold">
        Угадал: {{ store.getPlayerById(store.performResult.guesserId)?.name }} 🎉
      </p>
      <p v-if="store.performResult.answer" class="text-2xl font-black text-hub-accent">
        {{ mode === 'karaoke' ? '🎵' : 'Слово:' }} {{ store.performResult.answer }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'
import PlayerPicker from './PlayerPicker.vue'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const amPerformer = computed(() => String(store.performerId) === String(store.user?.id))

// Режим шоу задаёт вопрос (charades — дефолт)
const mode = computed(() => {
  const m = store.currentQuestion?.showMode
  return m === 'karaoke' || m === 'alias' ? m : 'charades'
})

const icon = computed(() => ({ charades: '🎭', karaoke: '🎤', alias: '🗣' }[mode.value]))
const selectPrompt = computed(() => ({
  charades: 'Объясни слово, не называя его',
  karaoke: 'Напой песню — остальные угадывают',
  alias: 'Объясни слова всем, не называя их'
}[mode.value]))
const pickerLabel = computed(() => ({
  charades: 'Кто показывает?', karaoke: 'Кто напевает?', alias: 'Кто объясняет?'
}[mode.value]))
const performerHint = computed(() => mode.value === 'karaoke' ? '🎧 Напевайте!' : '🎭 Показывайте — не называйте!')
const secretLabel = computed(() => mode.value === 'karaoke' ? '👁 Песня (для ведущего)' : '👁 Слово (для ведущего)')

// Приватный показ (privateReveal вне общего стейта — видят только исполнитель и ведущий)
const reveal = computed(() => store.privateReveal || null)
const secretWord = computed(() => store.privateReveal?.text || null)

// --- Караоке: реф-аудио по клику исполнителя (жест пользователя обходит autoplay-политику) ---
const refUrl = computed(() => reveal.value?.mediaSrc ? store.getAssetUrl(reveal.value.mediaSrc) : '')
const audioEl = ref(null)
const played = ref(false)
function playRef() {
  if (!audioEl.value) return
  audioEl.value.currentTime = 0
  audioEl.value.play().catch(() => {})
  played.value = true
}

// --- Алиас: локальный тик из endsAt (сервер хранит только endsAt, как в Амогусе) ---
const aliasSt = computed(() => store.aliasState)
const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => (now.value = Date.now()), 500) })
onUnmounted(() => { if (timer) clearInterval(timer) })
const secondsLeft = computed(() => {
  const e = aliasSt.value?.endsAt
  return e ? Math.max(0, Math.ceil((e - now.value) / 1000)) : 0
})

function setPerformer(pId) { emit('action', { name: 'host:setPerformer', payload: pId }) }
function awardGuess(pId) { emit('action', { name: 'host:awardGuess', payload: pId }) }
function aliasGuessed(pId) { emit('action', { name: 'host:aliasGuessed', payload: pId }) }
</script>
