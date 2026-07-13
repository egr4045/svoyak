<template>
  <div class="flex flex-col items-center gap-4 py-3 w-full">
    <p class="text-lg font-bold text-hub-text">{{ store.currentQuestion.q || 'Оцените каждый объект 1–10' }}</p>

    <!-- Оценка -->
    <template v-if="store.questionStatus === 'tier_rating'">
      <div v-if="!isHost && !store.isSpectator && !submitted" class="w-full max-w-lg flex flex-col gap-3">
        <div v-for="(it, i) in items" :key="i" class="hub-card p-3 flex items-center gap-3">
          <img v-if="it.mediaSrc" :src="store.getAssetUrl(it.mediaSrc)" class="w-12 h-12 rounded object-cover" />
          <div class="flex-1">
            <div class="flex justify-between mb-1">
              <span class="font-bold text-sm">{{ it.label || `Объект ${i + 1}` }}</span>
              <span class="text-hub-accent font-black">{{ ratings[i] }}</span>
            </div>
            <input type="range" min="1" max="10" v-model.number="ratings[i]" class="w-full accent-hub-accent" />
          </div>
        </div>
        <button @click="submit" class="hub-btn-primary py-3">Отправить оценки</button>
      </div>
      <div v-else-if="submitted" class="py-6 text-hub-positive font-bold text-lg">Оценки приняты ✓</div>
      <div v-else class="text-hub-muted">
        Оценили: {{ store.tierSubmitted?.length || 0 }} / {{ store.players.length }}
        <ul class="mt-3 text-sm text-hub-muted/80 list-disc list-inside">
          <li v-for="(it, i) in items" :key="i">{{ it.label || `Объект ${i + 1}` }}</li>
        </ul>
      </div>
    </template>

    <!-- Итоги: медиана по объекту + очки -->
    <template v-else-if="store.questionStatus === 'tier_results' && store.tierResults">
      <div class="w-full max-w-2xl flex flex-col gap-2">
        <div v-for="(it, i) in store.tierResults.items" :key="i" class="hub-card p-3 flex items-center gap-3">
          <img v-if="it.mediaSrc" :src="store.getAssetUrl(it.mediaSrc)" class="w-10 h-10 rounded object-cover" />
          <span class="flex-1 font-bold">{{ it.label }}</span>
          <span class="text-hub-muted text-sm">медиана</span>
          <span class="text-2xl font-black text-hub-accent w-10 text-center">{{ fmt(it.median) }}</span>
        </div>
      </div>
      <div class="w-full max-w-md mt-2">
        <h4 class="text-sm font-black uppercase tracking-widest text-hub-muted mb-2">Очки за консенсус</h4>
        <div class="flex flex-col gap-1">
          <div v-for="s in scoreboard" :key="s.id" class="flex justify-between p-2 rounded-lg bg-hub-deep/50 border border-hub-border">
            <span class="font-bold">{{ s.name }}</span>
            <span class="text-hub-positive font-black">+{{ s.score }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const items = computed(() => store.currentQuestion?.items || [])

// Локальные оценки — по умолчанию 5
const ratings = ref({})
watch(items, (list) => {
  const r = {}; list.forEach((_, i) => { r[i] = ratings.value[i] ?? 5 })
  ratings.value = r
}, { immediate: true })

const submitted = computed(() => (store.tierSubmitted || []).includes(String(store.user?.id)))

const scoreboard = computed(() => {
  const res = store.tierResults
  if (!res) return []
  return Object.entries(res.scores)
    .map(([id, score]) => ({ id, score, name: store.getPlayerById(id)?.name || id }))
    .sort((a, b) => b.score - a.score)
})

function fmt(v) { return v == null ? '—' : (Math.round(v * 10) / 10) }
function submit() { emit('action', { name: 'player:submitTier', payload: { ratings: ratings.value } }) }
</script>
