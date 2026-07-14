<template>
  <!-- Стена ролей: одно мок-состояние (тип+фаза) глазами всех релевантных ролей одновременно.
       Наглядно показывает fog-of-war — что видит и НЕ видит каждый участник. -->
  <div class="grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <div v-for="r in roles" :key="r" class="panel-glass p-2 flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs font-bold px-1">
        <span class="text-hub-text">{{ ROLE_LABELS[r] || r }}</span>
        <span v-if="seesSecret(r)" class="text-hub-accent" title="видит секрет">👁</span>
        <span v-else class="text-hub-muted" title="секрет скрыт">🔒</span>
      </div>
      <PreviewFrame :question="question" :role="r" :phase-index="phaseIndex" :players="players"
                    :with-host-panel="r === 'host'" :interactive="false" :min-height="300" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import PreviewFrame from './PreviewFrame.vue'
import { rolesFor } from './mockState'
import { ROLE_LABELS } from './roleMatrix'

const props = defineProps({
  question: { type: Object, required: true },
  phaseIndex: { type: Number, default: 0 },
  players: { type: Number, default: 3 }
})

const roles = computed(() => rolesFor(props.question?.type || 'text'))
function seesSecret(r) { return r === 'host' || r === 'performer' }
</script>
