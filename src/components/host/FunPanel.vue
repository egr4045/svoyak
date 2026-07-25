<template>
  <!-- Пульт приколов ведущего: живёт всю игру (HostPanel есть только при открытом вопросе).
       Свёрнут в кнопку 🎉; вкладки: саундборд / эффекты / рулетка. -->
  <div v-if="isHost && store.gameStarted" class="fixed bottom-24 md:bottom-28 right-2 md:right-4 z-[60] flex flex-col items-end gap-2">
    <div v-if="open" class="panel-glass p-3 w-72 anim-pop-in">
      <div class="flex gap-1 mb-3">
        <button v-for="t in TABS" :key="t.key" @click="tab = t.key"
                class="hub-btn text-xs flex-1" :class="tab === t.key ? '!border-hub-accent !text-hub-accent' : ''">
          {{ t.label }}
        </button>
      </div>

      <!-- Саундборд -->
      <div v-if="tab === 'sound'" class="grid grid-cols-2 gap-1.5">
        <button v-for="s in SOUNDS" :key="s.key" @click="playSound(s.key)"
                class="hub-btn text-sm py-3">{{ s.icon }} {{ s.label }}</button>
      </div>

      <!-- Визуальные эффекты -->
      <div v-else-if="tab === 'fx'" class="flex flex-col gap-1.5">
        <button @click="triggerEffect('confetti')" class="hub-btn text-sm py-3">🎊 Конфетти всем</button>
        <button @click="triggerEffect('shake')" class="hub-btn text-sm py-3">🫨 Тряска экрана</button>
        <div class="border-t border-hub-border pt-2 mt-1">
          <p class="text-[10px] uppercase tracking-widest text-hub-muted font-black mb-1.5">👾 Глитч игроку</p>
          <div class="flex flex-wrap gap-1">
            <button v-for="p in store.players.filter(x => x.connected)" :key="p.id"
                    @click="triggerEffect('glitch', p.id)"
                    class="hub-btn text-xs">{{ p.name }}</button>
          </div>
        </div>
      </div>

      <!-- Рулетка очков -->
      <div v-else class="flex flex-col gap-2 items-center text-center">
        <p class="text-[11px] text-hub-muted">Случайное событие: подарок, налог, кража, обмен, удвоение или обнуление. Жертву выбирает судьба.</p>
        <button @click="spin" :disabled="spinPending"
                class="hub-btn-primary w-full py-3 text-sm uppercase tracking-wide disabled:opacity-40">
          {{ spinPending ? 'Крутится…' : '🎡 Крутить рулетку' }}
        </button>
        <p v-if="store.questionStatus === 'buzzer_active'" class="text-[10px] text-hub-warning">Недоступно во время баззера</p>
      </div>
    </div>

    <button @click="open = !open"
            class="w-12 h-12 rounded-full text-2xl shadow-2xl border-2 transition-transform hover:scale-110"
            :class="open ? 'bg-hub-accent border-white' : 'bg-hub-deep border-hub-border glow-pink'"
            title="Приколы ведущего">
      🎉
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)

const open = ref(false)
const tab = ref('sound')
const TABS = [
  { key: 'sound', label: '🔊 Звуки' },
  { key: 'fx', label: '✨ Эффекты' },
  { key: 'wheel', label: '🎡 Рулетка' },
]
const SOUNDS = [
  { key: 'fanfare', icon: '🎺', label: 'Фанфары' },
  { key: 'drumroll', icon: '🥁', label: 'Дробь' },
  { key: 'sadtrombone', icon: '📉', label: 'Тромбон' },
  { key: 'quack', icon: '🦆', label: 'Кряк' },
  { key: 'applause', icon: '👏', label: 'Овации' },
]

function playSound(sound) { store.emitAction('host:playSound', { sound }) }
function triggerEffect(effect, targetId = null) { store.emitAction('host:triggerEffect', { effect, targetId }) }

// Спин: блокируем кнопку на revealInMs+хвост, отпускаем по таймеру
const spinPending = ref(false)
let spinTimer = null
function spin() {
  if (spinPending.value) return
  store.emitAction('host:spinRoulette')
}
watch(() => store.funEvent?.seq, () => {
  const ev = store.funEvent
  if (ev?.kind === 'roulette') {
    spinPending.value = true
    clearTimeout(spinTimer)
    spinTimer = setTimeout(() => { spinPending.value = false }, (ev.revealInMs || 4000) + 3300)
  }
})
onUnmounted(() => clearTimeout(spinTimer))
</script>
