<template>
  <div class="flex flex-col items-center gap-4 py-4 w-full">
    <!-- Правило: всегда крупно и первым -->
    <p class="text-2xl md:text-3xl font-black text-hub-text text-center font-display anim-pop-in">⚡ {{ store.reactionRule }}</p>

    <!-- Ставки: понятно, что на кону -->
    <p class="text-xs text-hub-muted -mt-2">
      Верный тап: <b class="text-party-lime">+{{ pts }}</b> · промах: <b class="text-hub-negative">−{{ Math.round(pts / 2) }}</b> и вылет · попытка одна
    </p>

    <!-- Фаза 1: сетка скрыта — читаем правило -->
    <div v-if="!store.reactionGrid" class="flex flex-col items-center gap-3 py-6">
      <div class="text-5xl animate-pulse">👀</div>
      <p class="text-lg font-bold text-party-amber text-glow-amber">Запомните правило — сетка вот-вот появится!</p>
    </div>

    <!-- Фаза 2: сетка + дедлайн -->
    <template v-else>
      <!-- Полоса времени до авто-финиша -->
      <div v-if="!store.reactionDone && store.reactionEndsAt" class="w-full max-w-xs h-1.5 rounded-full bg-hub-deep overflow-hidden">
        <div class="h-full bg-party-pink transition-[width] duration-500 ease-linear" :style="{ width: timePct + '%' }"></div>
      </div>

      <div class="grid grid-cols-3 gap-2 md:gap-3 anim-pop-in">
        <button v-for="(cell, i) in store.reactionGrid" :key="i"
                @pointerdown="tap(i)"
                :disabled="!canTap"
                class="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-black text-white shadow-lg transition-all relative select-none"
                :class="[
                  cell.correct ? 'ring-4 ring-white scale-110 glow-accent' : '',
                  canTap ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default',
                  store.reactionDone && !cell.correct ? 'opacity-30' : ''
                ]"
                :style="{ backgroundColor: cell.hex }">
          {{ cell.char }}
          <!-- Публичные промахи: кто куда мазанул -->
          <span v-if="missNames(i).length" class="absolute -top-2 -right-2 bg-hub-negative text-white text-[10px] font-black rounded-full px-1.5 py-0.5 shadow"
                :title="'Промахнулись: ' + missNames(i).join(', ')">✖ {{ missNames(i).length }}</span>
        </button>
      </div>

      <!-- Статусы: каждому ясно, что происходит -->
      <p v-if="store.reactionDone" class="text-lg font-bold anim-pop-in" :class="store.reactionWinnerId ? 'text-hub-positive' : 'text-hub-muted'">
        <template v-if="store.reactionWinnerId">🏆 Первым верно нажал: {{ winnerName }}</template>
        <template v-else>Никто не успел — верная ячейка подсвечена</template>
      </p>
      <p v-else-if="iMissed" class="text-hub-negative font-black anim-shake">💥 Мимо! −{{ Math.round(pts / 2) }}. Вы выбыли из этого раунда.</p>
      <p v-else-if="isHost || store.isSpectator" class="text-hub-muted text-sm italic">Игроки реагируют…</p>
      <p v-else class="text-party-pink text-sm font-bold animate-pulse">Жмите — но только наверняка!</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onUnmounted, watch } from 'vue'
import { useGameStore } from '../../stores/game'
import { playSfx } from '../../lib/sfx'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const pts = computed(() => store.currentQuestion?.points || 0)

// Промахнулся ли я (по публичным меткам сервера — переживает реконнект)
const iMissed = computed(() => store.reactionMisses && String(store.user?.id) in store.reactionMisses)
const canTap = computed(() =>
  !isHost.value && !store.isSpectator && !store.reactionDone && !iMissed.value && !!store.reactionGrid)

const winnerName = computed(() => store.getPlayerById(store.reactionWinnerId)?.name || '—')

// Кто промахнулся в конкретную ячейку (весёлая публичная статистика)
function missNames(idx) {
  const m = store.reactionMisses || {}
  return Object.entries(m).filter(([, i]) => i === idx).map(([uid]) => store.getPlayerById(uid)?.name || '?')
}

// Полоса времени до дедлайна
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 500)
onUnmounted(() => clearInterval(clock))
const timePct = computed(() => {
  const e = store.reactionEndsAt
  if (!e) return 100
  return Math.max(0, Math.min(100, ((e - now.value) / 12000) * 100))
})

// Появление сетки — звуковой сигнал старта
watch(() => !!store.reactionGrid, (shown) => { if (shown && !store.reactionDone) playSfx('pop') })

function tap(i) {
  if (!canTap.value) return
  emit('action', { name: 'player:tapTarget', payload: { idx: i } })
}
</script>
