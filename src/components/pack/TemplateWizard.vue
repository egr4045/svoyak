<template>
  <div class="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="panel-glass w-full max-w-3xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-hub-accent text-lg">🎨 Пак по теме</h3>
        <button @click="$emit('close')" class="hub-btn text-xs">✕</button>
      </div>

      <label class="flex flex-col gap-1 mb-4">
        <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Тема</span>
        <input v-model="theme" class="hub-input" placeholder="Например: 90-е, Гарри Поттер, Офис…" @keydown.enter="apply" />
      </label>

      <p class="text-xs text-hub-muted mb-2">Выберите один или несколько раундов — сгенерируем сразу с заглушками под тему (вопросы/ответы можно будет отредактировать).</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <button v-for="s in ROUND_SKELETONS" :key="s.key" @click="toggle(s.key)"
                class="text-left p-3 rounded-xl border transition-colors"
                :class="selected.has(s.key) ? 'border-hub-accent bg-hub-accent/10' : 'border-hub-border hover:border-hub-accent/50'">
          <div class="flex items-center gap-2 font-bold text-sm mb-1">
            <span class="text-lg">{{ s.icon }}</span> {{ s.label }}
            <span v-if="selected.has(s.key)" class="ml-auto text-hub-accent text-xs">✓ выбрано</span>
          </div>
          <p class="text-xs text-hub-muted">{{ s.desc }}</p>
        </button>
      </div>

      <div class="flex justify-between items-center">
        <span class="text-xs text-hub-muted">{{ selected.size }} раунд{{ selected.size === 1 ? '' : 'а/ов' }} будет добавлено</span>
        <button @click="apply" :disabled="!selected.size" class="hub-btn-primary disabled:opacity-40">Сгенерировать</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ROUND_SKELETONS } from './templates'

const props = defineProps({ suggestedTheme: { type: String, default: '' } })
const emit = defineEmits(['close', 'apply'])

const theme = ref(props.suggestedTheme)
const selected = ref(new Set())
function toggle(key) {
  if (selected.value.has(key)) selected.value.delete(key)
  else selected.value.add(key)
  selected.value = new Set(selected.value) // новый Set — триггерит реактивность
}
function apply() {
  const rounds = ROUND_SKELETONS.filter(s => selected.value.has(s.key)).map(s => s.build(theme.value))
  emit('apply', rounds)
}
</script>
