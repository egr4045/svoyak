<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <template v-if="ds">
      <!-- Выбор дуэлянтов ведущим -->
      <template v-if="!bothChosen && !ds.revealed">
        <p class="text-lg text-hub-text font-bold">✊✋✌ Дуэль: выберите двух игроков</p>
        <p class="text-hub-muted text-sm">
          A: <b :class="ds.aId ? 'text-hub-accent' : ''">{{ nameOf(ds.aId) || '—' }}</b>
          &nbsp;vs&nbsp;
          B: <b :class="ds.bId ? 'text-hub-accent' : ''">{{ nameOf(ds.bId) || '—' }}</b>
        </p>
        <PlayerPicker v-if="isHost" label="Кто дуэлянт?" :selectedIds="selected" :disabledIds="selected" @pick="setDuel" />
        <button v-if="isHost && (ds.aId || ds.bId)" @click="resetDuel" class="hub-btn text-xs !text-hub-negative">Сбросить</button>
        <p v-else-if="!isHost" class="text-hub-muted italic">Ведущий выбирает дуэлянтов…</p>
      </template>

      <!-- Оба выбраны, выборы идут -->
      <template v-else-if="!ds.revealed">
        <p class="text-xl font-black text-hub-text">{{ nameOf(ds.aId) }} <span class="text-hub-muted">vs</span> {{ nameOf(ds.bId) }}</p>
        <p v-if="ds.tie" class="text-hub-warning font-bold">Ничья! Выбираем заново ✊✋✌</p>

        <!-- Я дуэлянт и ещё не выбрал -->
        <div v-if="amDuelist && !myReady" class="flex gap-3">
          <button v-for="c in choices" :key="c.k" @click="pick(c.k)"
                  class="w-20 h-20 rounded-2xl bg-hub-deep border-2 border-hub-border hover:border-hub-accent text-4xl transition-all hover:scale-105">
            {{ c.e }}
          </button>
        </div>
        <p v-else-if="amDuelist" class="text-hub-positive font-bold">Вы выбрали ✓ Ждём соперника…</p>

        <!-- Наблюдающие/ведущий: статус готовности -->
        <p v-if="!amDuelist" class="text-hub-muted">
          {{ ds.aReady ? '✓' : '…' }} {{ nameOf(ds.aId) }} &nbsp;•&nbsp; {{ ds.bReady ? '✓' : '…' }} {{ nameOf(ds.bId) }}
        </p>
      </template>

      <!-- Вскрытие -->
      <template v-else>
        <div class="flex items-center gap-6">
          <div class="flex flex-col items-center gap-1">
            <span class="text-5xl">{{ emoji(ds.aPick) }}</span>
            <span class="font-bold" :class="ds.winnerId === ds.aId ? 'text-hub-positive' : 'text-hub-muted'">{{ nameOf(ds.aId) }}</span>
          </div>
          <span class="text-2xl text-hub-muted">vs</span>
          <div class="flex flex-col items-center gap-1">
            <span class="text-5xl">{{ emoji(ds.bPick) }}</span>
            <span class="font-bold" :class="ds.winnerId === ds.bId ? 'text-hub-positive' : 'text-hub-muted'">{{ nameOf(ds.bId) }}</span>
          </div>
        </div>
        <p class="text-hub-positive text-xl font-black">🏆 Победил: {{ nameOf(ds.winnerId) }}</p>
      </template>
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
const ds = computed(() => store.duelState)

const choices = [{ k: 'rock', e: '🪨' }, { k: 'paper', e: '📄' }, { k: 'scissors', e: '✂️' }]
const EMO = { rock: '🪨', paper: '📄', scissors: '✂️' }
function emoji(k) { return EMO[k] || '❔' }

const bothChosen = computed(() => !!(ds.value?.aId && ds.value?.bId))
const selected = computed(() => [ds.value?.aId, ds.value?.bId].filter(Boolean))
const amDuelist = computed(() => {
  const me = String(store.user?.id)
  return me === String(ds.value?.aId) || me === String(ds.value?.bId)
})
const myReady = computed(() => {
  const me = String(store.user?.id)
  if (me === String(ds.value?.aId)) return ds.value?.aReady
  if (me === String(ds.value?.bId)) return ds.value?.bReady
  return false
})
function nameOf(id) { return id ? store.getPlayerById(id)?.name : null }

function setDuel(pId) { emit('action', { name: 'host:setDuel', payload: pId }) }
function resetDuel() { emit('action', { name: 'host:setDuel', payload: null }) }
function pick(choice) { emit('action', { name: 'player:rpsPick', payload: { choice } }) }
</script>
