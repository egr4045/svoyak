<template>
  <div class="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="panel-glass w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-hub-accent text-lg">🔍 Проверка пака</h3>
        <button @click="$emit('close')" class="hub-btn text-xs">✕</button>
      </div>

      <p v-if="!issues.length" class="text-hub-positive text-sm py-8 text-center">✓ Проблем не найдено — пак готов к игре.</p>
      <div v-else class="flex flex-col gap-2">
        <button v-for="(iss, i) in issues" :key="i" @click="$emit('jump', iss)"
                class="text-left p-3 rounded-lg border flex items-start gap-2 hover:border-hub-accent transition-colors"
                :class="iss.level === 'error' ? 'border-hub-negative/40 bg-hub-negative/5' : 'border-hub-warning/40 bg-hub-warning/5'">
          <span class="text-sm">{{ iss.level === 'error' ? '⛔' : '⚠' }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-hub-text">{{ iss.message }}</p>
            <p v-if="iss.roundName" class="text-xs text-hub-muted truncate">
              {{ iss.roundName }}<span v-if="iss.catName"> · {{ iss.catName }}</span>
            </p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ issues: { type: Array, required: true } })
defineEmits(['close', 'jump'])
</script>
