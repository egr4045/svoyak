<template>
  <div class="flex flex-col gap-3 w-full">
    <!-- Панель управления -->
    <div class="flex flex-wrap items-center gap-3 panel-glass px-3 py-2">
      <div class="flex gap-1">
        <button @click="mode = 'single'" class="hub-btn text-xs" :class="mode === 'single' ? '!text-hub-accent' : ''">Одна роль</button>
        <button @click="mode = 'wall'" class="hub-btn text-xs" :class="mode === 'wall' ? '!text-hub-accent' : ''">Стена ролей</button>
      </div>

      <label v-if="mode === 'single'" class="flex items-center gap-2 text-sm">
        <span class="text-hub-muted">Роль:</span>
        <select v-model="role" class="hub-input text-sm py-1">
          <option v-for="r in roles" :key="r" :value="r">{{ ROLE_LABELS[r] || r }}</option>
        </select>
      </label>

      <div class="flex items-center gap-1 flex-wrap">
        <span class="text-hub-muted text-xs mr-1">Фаза:</span>
        <button v-for="(ph, i) in phases" :key="i" @click="phaseIndex = i"
                class="text-xs px-2.5 py-1 rounded-full border transition-colors"
                :class="phaseIndex === i ? 'bg-hub-accent/20 border-hub-accent text-hub-accent' : 'border-hub-border text-hub-muted hover:text-hub-text'">
          {{ ph.label }}
        </button>
        <button @click="playThrough" :disabled="playing" class="ml-1 hub-btn text-xs disabled:opacity-40" title="Проиграть фазы">▶</button>
      </div>

      <label class="flex items-center gap-2 text-sm ml-auto">
        <span class="text-hub-muted text-xs">Игроков</span>
        <input type="range" min="2" max="8" v-model.number="players" class="accent-hub-accent w-24" />
        <span class="text-hub-text text-xs w-4">{{ players }}</span>
      </label>

      <div v-if="mode === 'single'" class="flex gap-1">
        <button @click="viewport = 'desktop'" class="hub-btn text-xs px-2" :class="viewport === 'desktop' ? '!text-hub-accent' : ''" title="Десктоп">🖥</button>
        <button @click="viewport = 'mobile'" class="hub-btn text-xs px-2" :class="viewport === 'mobile' ? '!text-hub-accent' : ''" title="Телефон">📱</button>
      </div>
    </div>

    <!-- Одна роль -->
    <template v-if="mode === 'single'">
      <div class="mx-auto w-full transition-all" :style="{ maxWidth: viewport === 'mobile' ? '390px' : '100%' }">
        <PreviewFrame :question="question" :role="role" :phase-index="phaseIndex" :players="players" :interactive="interactive" />
      </div>
      <p class="text-center text-[11px] text-hub-muted">
        Живой игровой экран на моке · роль «{{ ROLE_LABELS[role] || role }}» · без сервера{{ interactive ? ' · кнопки кликаются' : '' }}
      </p>
    </template>

    <!-- Стена ролей -->
    <template v-else>
      <RoleWall :question="question" :phase-index="phaseIndex" :players="players" />
      <p class="text-center text-[11px] text-hub-muted">Одна фаза глазами всех ролей · 👁 видит секрет · 🔒 секрет скрыт · без сервера</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import PreviewFrame from './PreviewFrame.vue'
import RoleWall from './RoleWall.vue'
import { rolesFor, phasesFor } from './mockState'
import { ROLE_LABELS } from './roleMatrix'

const props = defineProps({
  question: { type: Object, required: true },
  interactive: { type: Boolean, default: false },
  initialRole: { type: String, default: 'host' }
})

const type = computed(() => props.question?.type || 'text')
const roles = computed(() => rolesFor(type.value))
const phases = computed(() => phasesFor(type.value))

const mode = ref('single')
const role = ref(props.initialRole)
const phaseIndex = ref(0)
const players = ref(3)
const viewport = ref('desktop')
const playing = ref(false)

let playTimer = null
function playThrough() {
  if (playing.value) return
  playing.value = true
  phaseIndex.value = 0
  const step = () => {
    if (phaseIndex.value >= phases.value.length - 1) { playing.value = false; return }
    phaseIndex.value++
    playTimer = setTimeout(step, 1400)
  }
  playTimer = setTimeout(step, 1400)
}

// Роль/фаза недоступны для нового типа → откат
watch(roles, (list) => { if (!list.includes(role.value)) role.value = list[0] })
watch(phases, (list) => { if (phaseIndex.value > list.length - 1) phaseIndex.value = 0 })
watch(() => props.interactive, () => {})
</script>
