<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <!-- Выбор исполнителя -->
    <template v-if="store.questionStatus === 'performer_select'">
      <p class="text-lg text-hub-text font-bold">{{ store.currentQuestion.q || 'Объясни слово, не называя его' }}</p>
      <PlayerPicker v-if="isHost" label="Кто показывает?" @pick="setPerformer" />
      <p v-else class="text-hub-muted italic">Ведущий выбирает исполнителя…</p>
    </template>

    <!-- Идёт показ -->
    <template v-else-if="store.questionStatus === 'performing'">
      <!-- Приватное слово: видят только исполнитель и ведущий (privateReveal вне общего стейта) -->
      <div v-if="secretWord" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/50 rounded-2xl p-6 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-2">
          {{ amPerformer ? '🎭 Показывайте — не называйте!' : '👁 Слово (для ведущего)' }}
        </p>
        <p class="text-4xl font-black text-hub-accent break-words">{{ secretWord }}</p>
      </div>
      <p v-else class="text-2xl text-hub-text font-black">🎭 Отгадывайте вслух!</p>
      <p v-if="!isHost && !amPerformer" class="text-hub-muted text-sm">Ведущий отметит того, кто угадает.</p>

      <PlayerPicker v-if="isHost" label="Кто угадал?" @pick="awardGuess" />
    </template>

    <!-- Итог (кто угадал / пас) — после начисления, до закрытия -->
    <template v-else-if="store.performResult">
      <p v-if="store.performResult.pass" class="text-hub-muted text-lg">Никто не угадал 🤷</p>
      <p v-else class="text-hub-positive text-lg font-bold">
        Угадал: {{ store.getPlayerById(store.performResult.guesserId)?.name }} 🎉
      </p>
      <p v-if="store.performResult.answer" class="text-2xl font-black text-hub-accent">Слово: {{ store.performResult.answer }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import PlayerPicker from './PlayerPicker.vue'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const amPerformer = computed(() => String(store.performerId) === String(store.user?.id))
const secretWord = computed(() => store.privateReveal?.text || null)

function setPerformer(pId) { emit('action', { name: 'host:setPerformer', payload: pId }) }
function awardGuess(pId) { emit('action', { name: 'host:awardGuess', payload: pId }) }
</script>
