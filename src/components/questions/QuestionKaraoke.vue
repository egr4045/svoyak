<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <!-- Выбор исполнителя -->
    <template v-if="store.questionStatus === 'performer_select'">
      <p class="text-lg text-hub-text font-bold">🎤 {{ store.currentQuestion.q || 'Напой песню — остальные угадывают' }}</p>
      <PlayerPicker v-if="isHost" label="Кто напевает?" @pick="setPerformer" />
      <p v-else class="text-hub-muted italic">Ведущий выбирает исполнителя…</p>
    </template>

    <!-- Идёт исполнение -->
    <template v-else-if="store.questionStatus === 'performing'">
      <!-- Исполнитель: приватный аудио-реф + название (в наушник) -->
      <div v-if="amPerformer && reveal" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/50 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black">🎧 Только вы это слышите — напевайте!</p>
        <p class="text-2xl font-black text-hub-accent break-words">{{ reveal.text }}</p>
        <button v-if="reveal.mediaSrc" @click="playRef" class="hub-btn-primary text-sm">▶ {{ played ? 'Переслушать реф' : 'Слушать реф' }}</button>
        <p class="text-[11px] text-hub-warning">Наденьте наушники, иначе оригинал попадёт в микрофон.</p>
        <audio ref="audioEl" :src="refUrl" preload="auto"></audio>
      </div>
      <!-- Ведущий: название для судейства -->
      <div v-else-if="isHost && reveal" class="w-full max-w-lg bg-hub-deep/70 border-2 border-hub-accent/40 rounded-2xl p-5 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-1">👁 Песня (для ведущего)</p>
        <p class="text-2xl font-black text-hub-accent break-words">{{ reveal.text }}</p>
      </div>
      <!-- Остальные -->
      <p v-else class="text-2xl text-hub-text font-black">🎤 Угадывайте песню вслух!</p>
      <p v-if="!isHost && !amPerformer" class="text-hub-muted text-sm">Ведущий отметит того, кто угадает.</p>

      <PlayerPicker v-if="isHost" label="Кто угадал?" @pick="awardGuess" />
    </template>

    <!-- Итог -->
    <template v-else-if="store.performResult">
      <p v-if="store.performResult.pass" class="text-hub-muted text-lg">Никто не угадал 🤷</p>
      <p v-else class="text-hub-positive text-lg font-bold">Угадал: {{ store.getPlayerById(store.performResult.guesserId)?.name }} 🎉</p>
      <p v-if="store.performResult.answer" class="text-2xl font-black text-hub-accent">🎵 {{ store.performResult.answer }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import PlayerPicker from './PlayerPicker.vue'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const amPerformer = computed(() => String(store.performerId) === String(store.user?.id))
const reveal = computed(() => store.privateReveal || null)
const refUrl = computed(() => reveal.value?.mediaSrc ? store.getAssetUrl(reveal.value.mediaSrc) : '')
const audioEl = ref(null)
const played = ref(false)

// Проигрывание — по клику исполнителя (жест пользователя обходит autoplay-политику браузера)
function playRef() {
  if (!audioEl.value) return
  audioEl.value.currentTime = 0
  audioEl.value.play().catch(() => {})
  played.value = true
}
function setPerformer(pId) { emit('action', { name: 'host:setPerformer', payload: pId }) }
function awardGuess(pId) { emit('action', { name: 'host:awardGuess', payload: pId }) }
</script>
