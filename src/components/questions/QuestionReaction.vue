<template>
  <div class="flex flex-col items-center gap-4 py-4 w-full">
    <p class="text-2xl font-black text-hub-text text-center">{{ store.reactionRule }}</p>

    <div class="grid grid-cols-3 gap-3">
      <button v-for="(cell, i) in store.reactionGrid" :key="i"
              @click="tap(i)"
              :disabled="!canTap"
              class="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black text-white shadow-lg transition-all"
              :class="[
                cell.correct ? 'ring-4 ring-white scale-105' : '',
                canTap ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
                store.reactionDone && !cell.correct ? 'opacity-40' : ''
              ]"
              :style="{ backgroundColor: cell.hex }">
        {{ cell.char }}
      </button>
    </div>

    <!-- Статусы -->
    <p v-if="store.reactionDone" class="text-lg font-bold" :class="store.reactionWinnerId ? 'text-hub-positive' : 'text-hub-muted'">
      <template v-if="store.reactionWinnerId">🏆 Первым верно нажал: {{ winnerName }}</template>
      <template v-else>Верная ячейка подсвечена</template>
    </p>
    <p v-else-if="iTapped" class="text-hub-muted italic">Ваш выбор сделан…</p>
    <p v-else-if="isHost || store.isSpectator" class="text-hub-muted text-sm italic">Игроки реагируют…</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)

// Один тап на игрока: дальше локально блокируем (сервер тоже блокирует после ошибки)
const iTapped = ref(false)
watch(() => store.activeCell, () => { iTapped.value = false })

const canTap = computed(() =>
  !isHost.value && !store.isSpectator && !store.reactionDone && !iTapped.value)

const winnerName = computed(() => store.getPlayerById(store.reactionWinnerId)?.name || '—')

function tap(i) {
  if (!canTap.value) return
  iTapped.value = true
  emit('action', { name: 'player:tapTarget', payload: { idx: i } })
}
</script>
