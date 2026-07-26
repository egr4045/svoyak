<template>
  <div class="flex flex-col items-center gap-5 py-4 w-full">
    <p class="text-xl font-bold text-hub-text">🥔 {{ store.currentQuestion.q || 'Называйте по очереди!' }}</p>
    <!-- Ставки: понятно, чем рискуем -->
    <p class="text-xs text-hub-muted -mt-3">Назовите вариант вслух — ведущий передаст дальше. На ком «взорвётся» — <b class="text-hub-negative">−{{ pts }}</b></p>

    <template v-if="store.questionStatus === 'potato_playing'">
      <!-- Только ведущему: до взрыва столько-то. Он ведёт темп и подгоняет к развязке.
           Игрокам таймер не приходит вовсе — в этом вся соль механики. -->
      <div v-if="isHost && bombIn !== null"
           class="flex items-center gap-3 rounded-2xl border-2 px-5 py-2"
           :class="bombIn <= 5 ? 'border-hub-negative bg-hub-negative/15 anim-shake' : 'border-party-amber/50 bg-party-amber/10'">
        <span class="text-[10px] uppercase tracking-widest text-hub-muted">👁 Только вам · до взрыва</span>
        <span class="font-mono font-black text-3xl" :class="bombIn <= 5 ? 'text-hub-negative' : 'text-party-amber'">{{ bombIn }}</span>
      </div>

      <!-- Держатель -->
      <div v-if="amHolder" class="flex flex-col items-center gap-3">
        <div class="text-7xl" :class="store.potatoFizzing ? 'anim-shake' : 'animate-bounce'">🥔</div>
        <p v-if="store.potatoFizzing" class="text-3xl font-black text-hub-negative anim-shake">🔥 ВОТ-ВОТ РВАНЁТ!</p>
        <p v-else class="text-2xl font-black text-hub-negative anim-pop-in">У ВАС! Называйте вариант!</p>
        <p class="text-hub-muted text-sm">Ведущий услышит и передаст дальше</p>
      </div>
      <!-- Остальные -->
      <div v-else class="flex flex-col items-center gap-3">
        <div class="text-6xl" :class="store.potatoFizzing ? 'anim-shake' : 'animate-pulse'">🥔</div>
        <p class="text-xl font-bold text-hub-text">Картошка у: <b class="text-party-amber">{{ holderName }}</b></p>
        <p v-if="store.potatoFizzing" class="text-lg font-black text-hub-negative anim-shake">🔥 Вот-вот рванёт!</p>
        <p v-else class="text-hub-muted text-sm">Она вот-вот «взорвётся»…</p>
        <!-- Очередь: кто следующий (готовиться заранее — веселее) -->
        <p v-if="myTurnIn !== null" class="text-xs text-party-cyan font-bold">До вас: {{ myTurnIn }} {{ passWord(myTurnIn) }}</p>
      </div>
    </template>

    <!-- Взрыв -->
    <template v-else-if="store.potatoResult">
      <div class="text-7xl anim-pop-in">💥</div>
      <p class="text-2xl font-black text-hub-negative anim-shake">Взорвалась у {{ loserName }}! −{{ pts }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'
import { playSfx } from '../../lib/sfx'

const store = useGameStore()
const pts = computed(() => store.currentQuestion?.points || 0)
const isHost = computed(() => String(store.host?.id) === String(store.user?.id))

// Дедлайн бомбы приходит адресно ведущему (privateReveal), в общий стейт не попадает.
// Тикаем локально: сервер отсчёт не транслирует.
const now = ref(Date.now())
let clock = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 250) })
onUnmounted(() => clearInterval(clock))
const bombIn = computed(() => {
  if (store.privateReveal?.kind !== 'potato_host') return null
  if (store.potatoFizzing) return 0
  return Math.max(0, Math.ceil((store.privateReveal.bombAt - now.value) / 1000))
})
const amHolder = computed(() => String(store.potatoTurnId) === String(store.user?.id) && !store.isSpectator)
const holderName = computed(() => store.getPlayerById(store.potatoTurnId)?.name || '—')
const loserName = computed(() => store.getPlayerById(store.potatoResult?.loserId)?.name || '—')

// Очередь: «до вас N передач» (готовиться заранее — веселее)
const ring = computed(() => store.potatoRing || [])
const myTurnIn = computed(() => {
  if (store.isSpectator) return null
  const me = ring.value.findIndex(id => String(id) === String(store.user?.id))
  const cur = ring.value.findIndex(id => String(id) === String(store.potatoTurnId))
  if (me === -1 || cur === -1) return null
  const d = (me - cur + ring.value.length) % ring.value.length
  return d === 0 ? null : d
})
function passWord(n) { return n === 1 ? 'передача' : n < 5 ? 'передачи' : 'передач' }

// Тик-тик у держателя (нервно и смешно); в шипении — частая паника у ВСЕХ
let tickTimer = null
watch([amHolder, () => store.potatoFizzing], ([holding, fizzing]) => {
  clearInterval(tickTimer)
  if (fizzing) tickTimer = setInterval(() => playSfx('tick', { volume: 0.6 }), 250)
  else if (holding) tickTimer = setInterval(() => playSfx('tick', { volume: 0.4 }), 1000)
}, { immediate: true })
onUnmounted(() => clearInterval(tickTimer))

// Взрыв: звук + тряска у всех
watch(() => store.potatoResult, (res) => {
  if (res) {
    playSfx('buzzer')
    document.body.classList.remove('anim-shake')
    void document.body.offsetWidth
    document.body.classList.add('anim-shake')
    setTimeout(() => document.body.classList.remove('anim-shake'), 500)
  }
})
</script>
