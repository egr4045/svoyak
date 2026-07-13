<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <p class="text-xl font-bold text-hub-text">🥔 {{ store.currentQuestion.q || 'Называйте по очереди!' }}</p>

    <template v-if="store.questionStatus === 'potato_playing'">
      <!-- Держатель -->
      <div v-if="amHolder" class="flex flex-col items-center gap-4">
        <div class="text-7xl animate-bounce">🥔</div>
        <p class="text-2xl font-black text-hub-negative">У ВАС! Назовите вариант и передайте!</p>
        <button @click="pass" class="hub-btn-primary text-lg px-8 py-4">Передать ➡</button>
      </div>
      <!-- Остальные -->
      <div v-else class="flex flex-col items-center gap-3">
        <div class="text-6xl" :class="{ 'animate-pulse': true }">🥔</div>
        <p class="text-xl font-bold text-hub-text">Картошка у: {{ holderName }}</p>
        <p class="text-hub-muted text-sm">Она вот-вот «взорвётся»…</p>
      </div>
    </template>

    <!-- Взрыв -->
    <template v-else-if="store.potatoResult">
      <div class="text-7xl">💥</div>
      <p class="text-2xl font-black text-hub-negative">Взорвалась у {{ loserName }}!</p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['action'])
const amHolder = computed(() => String(store.potatoTurnId) === String(store.user?.id) && !store.isSpectator)
const holderName = computed(() => store.getPlayerById(store.potatoTurnId)?.name || '—')
const loserName = computed(() => store.getPlayerById(store.potatoResult?.loserId)?.name || '—')

function pass() { emit('action', { name: 'player:passPotato' }) }
</script>
