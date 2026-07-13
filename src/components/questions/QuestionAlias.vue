<template>
  <div class="flex flex-col items-center gap-4 py-4 w-full">
    <!-- Выбор объясняющего -->
    <template v-if="store.questionStatus === 'performer_select'">
      <p class="text-lg text-hub-text font-bold">🗣 {{ store.currentQuestion.q || 'Объясни слова всем, не называя их' }}</p>
      <PlayerPicker v-if="isHost" label="Кто объясняет?" @pick="setPerformer" />
      <p v-else class="text-hub-muted italic">Ведущий выбирает…</p>
    </template>

    <!-- Идёт объяснение -->
    <template v-else-if="store.questionStatus === 'alias_playing'">
      <div class="flex items-center gap-4">
        <span class="text-hub-muted text-sm font-bold">Слово {{ (st?.index ?? 0) + 1 }} / {{ st?.total ?? 0 }}</span>
        <span class="text-2xl font-black tabular-nums" :class="secondsLeft <= 10 ? 'text-hub-negative' : 'text-hub-accent'">⏱ {{ secondsLeft }}</span>
        <span class="text-hub-positive text-sm font-bold">✔ {{ st?.guessedCount ?? 0 }}</span>
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

    <!-- Итог -->
    <template v-else-if="store.aliasResult">
      <p class="text-hub-positive text-xl font-black">Угадано {{ store.aliasResult.guessed }} из {{ store.aliasResult.total }} 🎉</p>
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
const st = computed(() => store.aliasState)
const secretWord = computed(() => store.privateReveal?.text || null)

// Локальный тик из endsAt (сервер хранит только endsAt, как в Амогусе)
const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => (now.value = Date.now()), 500) })
onUnmounted(() => { if (timer) clearInterval(timer) })
const secondsLeft = computed(() => {
  const e = st.value?.endsAt
  return e ? Math.max(0, Math.ceil((e - now.value) / 1000)) : 0
})

function setPerformer(pId) { emit('action', { name: 'host:setPerformer', payload: pId }) }
function aliasGuessed(pId) { emit('action', { name: 'host:aliasGuessed', payload: pId }) }
</script>
