<template>
  <!-- Оверлей приколов: верхний z, сам по себе не ловит клики -->
  <div class="pointer-events-none fixed inset-0 z-[90]">
    <!-- Глитч-атака на меня: полтора секунды помех -->
    <div v-if="selfGlitch" class="absolute inset-0 anim-glitch bg-black/30 flex items-center justify-center overflow-hidden">
      <div class="absolute inset-0 opacity-30 glitch-noise"></div>
      <span class="text-6xl font-black font-display text-party-pink text-glow-pink -rotate-6">СБОЙ СИГНАЛА</span>
    </div>

    <!-- Рулетка очков -->
    <div v-if="roulette" class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-6 pointer-events-auto anim-fade-in">
      <h3 class="text-2xl md:text-3xl font-black font-display text-party-gradient uppercase tracking-widest">🎡 Рулетка очков</h3>

      <!-- Колесо: conic-gradient секции, стрелка сверху; доезжает до предрешённой секции -->
      <div class="relative">
        <div class="absolute -top-1 left-1/2 -translate-x-1/2 z-10 text-3xl">🔻</div>
        <div class="wheel rounded-full border-8 border-hub-deep shadow-2xl"
             :style="{ transform: `rotate(${wheelAngle}deg)`, transition: spinning ? `transform ${roulette.revealInMs}ms cubic-bezier(.17,.67,.12,1)` : 'none' }">
          <div v-for="(s, i) in WHEEL" :key="s.kind"
               class="absolute inset-0 flex items-start justify-center"
               :style="{ transform: `rotate(${i * SECTOR + SECTOR / 2}deg)` }">
            <span class="mt-3 text-xl select-none" :title="s.label">{{ s.icon }}</span>
          </div>
        </div>
      </div>

      <!-- Итог после остановки -->
      <div v-if="rouletteResult" class="panel-glass px-8 py-5 text-center anim-pop-in max-w-md">
        <p class="text-3xl mb-1">{{ resultIcon }}</p>
        <p class="text-xl font-black" :class="resultPositive ? 'text-party-lime' : 'text-hub-negative'">{{ resultText }}</p>
      </div>
      <p v-else class="text-hub-muted text-sm animate-pulse">Крутится…</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { playSfx } from '../lib/sfx'
import { rain, burst } from '../lib/confetti'

const store = useGameStore()

// Порядок секций = OUTCOMES в server/handlers/funTools.js (менять синхронно!)
const WHEEL = [
  { kind: 'gift',   icon: '🎁', label: 'Подарок' },
  { kind: 'tax',    icon: '💸', label: 'Налог' },
  { kind: 'steal',  icon: '🦝', label: 'Кража' },
  { kind: 'swap',   icon: '🔄', label: 'Обмен' },
  { kind: 'double', icon: '✖️2', label: 'Удвоение' },
  { kind: 'zero',   icon: '🕳', label: 'Обнуление' },
]
const SECTOR = 360 / WHEEL.length

const selfGlitch = ref(false)
const roulette = ref(null)       // { outcome, revealInMs }
const rouletteResult = ref(false)
const spinning = ref(false)
const wheelAngle = ref(0)
let timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))

watch(() => store.funEvent?.seq, () => {
  const ev = store.funEvent
  if (!ev) return
  if (ev.kind === 'sound') {
    playSfx(ev.sound)
  } else if (ev.kind === 'effect') {
    if (ev.effect === 'confetti') { rain(); burst(0.5, 0.4) }
    else if (ev.effect === 'shake') {
      document.body.classList.remove('anim-shake')
      void document.body.offsetWidth // перезапуск анимации
      document.body.classList.add('anim-shake')
      later(() => document.body.classList.remove('anim-shake'), 500)
    } else if (ev.effect === 'glitch' && String(ev.targetId) === String(store.user?.id)) {
      selfGlitch.value = true
      playSfx('quack')
      later(() => { selfGlitch.value = false }, 1500)
    }
  } else if (ev.kind === 'roulette') {
    startRoulette(ev)
  }
})

function startRoulette(ev) {
  roulette.value = { outcome: ev.outcome, revealInMs: ev.revealInMs || 4000 }
  rouletteResult.value = false
  playSfx('drumroll')
  // Целевой угол: секция исхода под стрелкой (вверху) + 4 полных оборота
  const idx = Math.max(0, WHEEL.findIndex(s => s.kind === ev.outcome.kind))
  const target = 4 * 360 + (360 - (idx * SECTOR + SECTOR / 2))
  spinning.value = false
  wheelAngle.value = 0
  requestAnimationFrame(() => requestAnimationFrame(() => {
    spinning.value = true
    wheelAngle.value = target
  }))
  later(() => {
    rouletteResult.value = true
    playSfx(resultPositive.value ? 'fanfare' : 'sadtrombone')
    if (resultPositive.value) burst(0.5, 0.45)
    later(() => { roulette.value = null; rouletteResult.value = false }, 3200)
  }, roulette.value.revealInMs)
}

const resultPositive = computed(() => {
  const o = roulette.value?.outcome
  return o ? ['gift', 'double', 'steal', 'swap'].includes(o.kind) : false
})
const resultIcon = computed(() => WHEEL.find(s => s.kind === roulette.value?.outcome?.kind)?.icon || '🎡')
const resultText = computed(() => {
  const o = roulette.value?.outcome
  if (!o) return ''
  switch (o.kind) {
    case 'gift':   return `Подарок! ${o.targetName} +${o.amount}`
    case 'tax':    return `Налог! ${o.targetName} −${o.amount}`
    case 'steal':  return `Кража! ${o.toName} утащил ${o.amount} у ${o.fromName}`
    case 'swap':   return `Обмен счётами: ${o.aName} ⇄ ${o.bName}`
    case 'double': return `Удвоение очков: ${o.targetName}`
    case 'zero':   return `Обнуление: ${o.targetName} 🫡`
    default: return ''
  }
})

onUnmounted(() => timers.forEach(clearTimeout))
</script>

<style scoped>
.wheel {
  width: clamp(200px, 40vw, 300px);
  aspect-ratio: 1 / 1;
  position: relative;
  background: conic-gradient(
    var(--c-lime) 0deg 60deg,
    var(--c-pink) 60deg 120deg,
    var(--c-amber) 120deg 180deg,
    var(--c-cyan) 180deg 240deg,
    var(--c-violet) 240deg 300deg,
    #46505e 300deg 360deg
  );
}
.glitch-noise {
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 2px, transparent 2px 5px),
              repeating-linear-gradient(90deg, rgba(255,79,163,.15) 0 3px, transparent 3px 9px);
}
</style>
