<template>
  <div class="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 p-4" @click.self="$emit('close')">
    <div class="panel-glass w-full max-w-md p-3" @keydown="onKeydown">
      <input ref="inputEl" v-model="query" placeholder="Тип вопроса… (крокодил, число, кара…)"
             class="hub-input w-full mb-2" />
      <div class="max-h-80 overflow-y-auto flex flex-col gap-0.5">
        <button v-for="(t, i) in filtered" :key="t.key" @click="choose(t.key)"
                @mouseenter="activeIndex = i"
                class="text-left px-3 py-2 rounded-lg flex items-center justify-between text-sm transition-colors"
                :class="i === activeIndex ? 'bg-hub-accent/20 text-hub-accent' : 'text-hub-text hover:bg-hub-hover'">
          <span>{{ t.meta.l }}</span>
          <span v-if="t.key === currentType" class="text-[10px] text-hub-muted">текущий</span>
        </button>
        <p v-if="!filtered.length" class="text-hub-muted text-sm py-4 text-center">Ничего не найдено</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  typeMeta: { type: Object, required: true },   // { key: {l, short, tone} }
  currentType: { type: String, default: '' }
})
const emit = defineEmits(['close', 'select'])

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref(null)

// Простой фаззи-матч подпоследовательности (как в Ctrl+K командных палитрах): буквы запроса
// должны встретиться в тексте по порядку, необязательно подряд.
function fuzzyMatch(q, text) {
  if (!q) return true
  const ql = q.toLowerCase(), tl = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) if (tl[ti] === ql[qi]) qi++
  return qi === ql.length
}

const filtered = computed(() => Object.entries(props.typeMeta)
  .filter(([key, meta]) => fuzzyMatch(query.value, meta.l) || fuzzyMatch(query.value, key))
  .map(([key, meta]) => ({ key, meta })))

watch(filtered, () => { activeIndex.value = 0 })

function choose(key) { emit('select', key); emit('close') }
function onKeydown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = Math.max(activeIndex.value - 1, 0) }
  else if (e.key === 'Enter') { e.preventDefault(); const t = filtered.value[activeIndex.value]; if (t) choose(t.key) }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
onMounted(() => nextTick(() => inputEl.value?.focus()))
</script>
