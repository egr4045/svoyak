<template>
  <div class="fixed top-24 right-4 w-80 max-h-96 flex flex-col panel-glass overflow-hidden shadow-2xl z-40 transition-transform duration-300" :class="isOpen ? 'translate-x-0' : 'translate-x-[120%]'">
    <div class="bg-hub-deep p-3 border-b border-hub-border flex justify-between items-center cursor-pointer hover:bg-hub-hover transition" @click="isOpen = false">
      <h3 class="font-bold text-hub-text text-sm tracking-widest uppercase flex items-center gap-2">📜 История игры</h3>
      <span class="text-hub-muted font-bold text-lg leading-none">&times;</span>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse" ref="logContainer">
      <div v-if="store.eventLog.length === 0" class="text-hub-muted italic text-sm text-center flex-1 flex items-center justify-center">Событий пока нет…</div>
      <div v-for="(log, idx) in store.eventLog" :key="idx" class="text-sm leading-relaxed border-b border-hub-border/40 pb-2 last:border-0" :class="colorMap[log.type] || 'text-hub-text'">
        <span class="text-hub-muted font-mono text-xs mr-2">[{{ log.time }}]</span>
        {{ log.text }}
      </div>
    </div>
  </div>

  <!-- Кнопка открытия лога -->
  <button @click="isOpen = !isOpen" class="fixed top-28 right-0 bg-hub-deep hover:bg-hub-hover text-hub-text py-3 px-4 font-bold rounded-l-xl shadow-lg z-30 border border-r-0 border-hub-border transition-transform duration-300" :class="isOpen ? 'translate-x-full' : 'translate-x-0'">
    📜 Лог
    <span v-if="unreadCount > 0" class="absolute -top-2 -left-2 bg-hub-negative text-white text-xs px-2 py-0.5 rounded-full animate-bounce">{{ unreadCount }}</span>
  </button>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/game'

const store = useGameStore()
const isOpen = ref(false)
const logContainer = ref(null)
const unreadCount = ref(0)

const colorMap = {
  info: 'text-hub-text',
  success: 'text-hub-positive font-bold',
  error: 'text-hub-negative opacity-90',
  warning: 'text-hub-warning',
  system: 'text-hub-accent font-bold tracking-wide'
}

watch(() => store.eventLog.length, (newLength, oldLength) => {
  if (newLength > oldLength) {
    if (!isOpen.value) {
      unreadCount.value += (newLength - oldLength);
    }
  }
})

watch(isOpen, (val) => {
  if (val) {
    unreadCount.value = 0;
    nextTick(() => {
      // Event log shows `.unshift()`, so the newest is at the top. Container should be scrolled to 0.
      if (logContainer.value) logContainer.value.scrollTop = 0; 
    })
  }
})
</script>
