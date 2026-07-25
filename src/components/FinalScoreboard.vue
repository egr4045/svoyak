<template>
  <!-- Финальное табло: подиум топ-3, полный ранжир, фейерверк победителю -->
  <div class="flex-1 flex flex-col items-center justify-center p-4 md:p-8 panel-glass shadow-2xl overflow-y-auto">
    <h2 class="text-3xl md:text-5xl font-black mb-2 tracking-widest uppercase text-center font-display text-party-gradient anim-rise-in">
      Игра окончена
    </h2>
    <p v-if="winners.length" class="text-hub-muted mb-6 md:mb-8 anim-fade-in">
      {{ winners.length > 1 ? 'Победители' : 'Победитель' }}:
      <b class="text-party-lime">{{ winners.map(w => w.name).join(' и ') }}</b> 👑
    </p>

    <!-- Подиум -->
    <div v-if="ranked.length" class="flex items-end justify-center gap-2 md:gap-4 mb-6 md:mb-8 w-full max-w-lg">
      <div v-for="slot in podium" :key="slot.place" class="flex flex-col items-center flex-1 anim-rise-in anim-stagger" :style="{ '--stagger': slot.stagger }">
        <template v-if="slot.player">
          <span class="text-3xl md:text-4xl mb-1">{{ slot.medal }}</span>
          <div class="w-14 h-14 md:w-16 md:h-16 bg-hub-deep rounded-2xl border-2 overflow-hidden flex items-center justify-center text-2xl mb-1"
               :class="slot.place === 1 ? 'border-party-amber glow-amber' : 'border-hub-border'">
            <img v-if="slot.player.avatar && store.avatarIsImage(slot.player.avatar)" :src="store.getAvatarUrl(slot.player.avatar)" class="w-full h-full object-cover">
            <span v-else-if="slot.player.avatar">{{ slot.player.avatar }}</span>
            <span v-else class="font-black text-hub-muted">{{ slot.player.name.charAt(0).toUpperCase() }}</span>
          </div>
          <span class="text-xs md:text-sm font-bold truncate max-w-[90px]">{{ slot.player.name }}</span>
          <span class="font-display font-black" :class="slot.place === 1 ? 'text-party-amber text-xl md:text-2xl' : 'text-hub-text'">{{ slot.player.score }}</span>
          <div class="w-full rounded-t-xl mt-1" :class="slot.barClass" :style="{ height: slot.barH }"></div>
        </template>
      </div>
    </div>

    <!-- Полный ранжир -->
    <div v-if="ranked.length > 3" class="w-full max-w-md flex flex-col gap-1 mb-6">
      <div v-for="(p, i) in ranked.slice(3)" :key="p.id" class="flex justify-between items-center px-3 py-1.5 rounded-lg bg-hub-deep/50 border border-hub-border text-sm">
        <span class="font-bold text-hub-muted">{{ i + 4 }}. {{ p.name }}</span>
        <span class="font-display font-black" :class="p.score < 0 ? 'text-hub-negative' : 'text-hub-text'">{{ p.score }}</span>
      </div>
    </div>
    <p v-if="!ranked.length" class="text-hub-muted italic mb-6">Игроков не осталось 🤷</p>

    <div class="flex gap-3 flex-wrap justify-center">
      <button v-if="isHost" @click="store.resetGame()" class="hub-btn-primary py-3 px-8 uppercase tracking-wide">↻ Сыграть ещё раз</button>
      <button @click="leave" class="hub-btn py-3 px-8 !text-hub-negative">Выйти в хаб</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { fireworks } from '../lib/confetti'
import { playSfx } from '../lib/sfx'

const store = useGameStore()
const platform = usePlatformStore()
const isHost = computed(() => store.host?.id === store.user?.id)

const ranked = computed(() => [...store.players].sort((a, b) => b.score - a.score))
// Ничьи: победители — все с максимальным счётом
const winners = computed(() => {
  if (!ranked.value.length) return []
  const top = ranked.value[0].score
  return ranked.value.filter(p => p.score === top)
})

// Подиум в порядке 2-1-3 (классическая расстановка)
const podium = computed(() => {
  const r = ranked.value
  return [
    { place: 2, medal: '🥈', player: r[1] || null, barH: '48px', barClass: 'bg-hub-hover', stagger: 1 },
    { place: 1, medal: '🥇', player: r[0] || null, barH: '76px', barClass: 'bg-party-amber/30', stagger: 0 },
    { place: 3, medal: '🥉', player: r[2] || null, barH: '30px', barClass: 'bg-hub-hover', stagger: 2 },
  ]
})

onMounted(() => {
  if (ranked.value.length) {
    fireworks(2800)
    playSfx('fanfare')
    setTimeout(() => playSfx('applause', { volume: 0.7 }), 500)
  }
})

function leave() {
  store.logout()
  platform.returnToHub()
}
</script>
