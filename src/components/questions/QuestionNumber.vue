<template>
  <div class="flex flex-col items-center gap-4 py-4 w-full">
    <p class="text-xl font-bold text-hub-text">{{ store.currentQuestion.q || 'Назовите число' }}</p>

    <!-- Ввод -->
    <template v-if="store.questionStatus === 'number_inputting'">
      <div v-if="!isHost && !store.isSpectator" class="flex flex-col items-center gap-3 w-full max-w-sm">
        <div v-if="submitted" class="w-full py-4 bg-hub-positive/15 border-2 border-hub-positive/50 text-hub-positive rounded-xl text-lg font-bold text-center">
          Ответ принят ✓
        </div>
        <template v-else>
          <input v-model="val" :type="inputType" :placeholder="placeholder"
                 @keydown.enter="submit"
                 class="w-full px-5 py-4 bg-hub-deep border-2 border-hub-border rounded-xl text-hub-text text-xl outline-none focus:border-hub-accent text-center" />
          <button @click="submit" class="hub-btn-primary w-full py-3">Отправить</button>
        </template>
      </div>
      <div v-else class="text-hub-muted">
        Ответили: {{ submittedCount }} / {{ store.players.length }}
      </div>
    </template>

    <!-- Итоги -->
    <template v-else-if="store.questionStatus === 'number_results' && store.numberReveal">
      <div class="bg-hub-deep/70 border-2 border-hub-accent/40 rounded-2xl px-8 py-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-1">Правильный ответ</p>
        <p class="text-3xl font-black text-hub-accent">{{ store.numberReveal.answer }}</p>
      </div>
      <div class="flex flex-col gap-2 w-full max-w-md">
        <div v-for="(r, idx) in store.numberReveal.ranked" :key="r.id"
             class="flex justify-between items-center p-3 rounded-xl border"
             :class="r.id === store.numberReveal.winnerId ? 'border-hub-positive bg-hub-positive/10' : 'border-hub-border bg-hub-deep/50'">
          <span class="font-bold">{{ idx + 1 }}. {{ r.name }}</span>
          <span class="text-hub-text">{{ r.raw }}</span>
        </div>
        <p v-if="!store.numberReveal.ranked.length" class="text-hub-muted italic text-center">Никто не ответил</p>
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
const kind = computed(() => store.currentQuestion?.numberKind || 'number')
const inputType = computed(() => kind.value === 'date' ? 'date' : 'number')
const placeholder = computed(() => kind.value === 'date' ? 'ГГГГ-ММ-ДД' : kind.value === 'year' ? 'Год' : 'Число')

const val = ref('')
const submitted = computed(() => !!store.numberGuesses?.[String(store.user?.id)])
const submittedCount = computed(() => Object.keys(store.numberGuesses || {}).length)

function submit() {
  const v = String(val.value).trim()
  if (!v) return
  emit('action', { name: 'player:submitNumber', payload: { value: v } })
}
</script>
