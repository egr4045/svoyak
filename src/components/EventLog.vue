<template>
  <div class="fixed top-24 right-4 w-80 max-h-96 flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-40 transition-transform duration-300" :class="isOpen ? 'translate-x-0' : 'translate-x-[120%]'">
    <div class="bg-slate-800 p-3 border-b border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-700 transition" @click="isOpen = false">
      <h3 class="font-bold text-slate-200 text-sm tracking-widest uppercase flex items-center gap-2">📜 История игры</h3>
      <span class="text-slate-400 font-bold text-lg leading-none">&times;</span>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse" ref="logContainer">
      <div v-if="store.eventLog.length === 0" class="text-slate-500 italic text-sm text-center flex-1 flex items-center justify-center">Событий пока нет...</div>
      <div v-for="(log, idx) in store.eventLog" :key="idx" class="text-sm leading-relaxed border-b border-slate-800/50 pb-2 last:border-0" :class="colorMap[log.type] || 'text-slate-300'">
        <span class="text-slate-500 font-mono text-xs mr-2">[{{ log.time }}]</span> 
        {{ log.text }}
      </div>
    </div>
  </div>

  <!-- Кнопка открытия лога -->
  <button @click="isOpen = !isOpen" class="fixed top-28 right-0 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-4 font-bold rounded-l-xl shadow-lg z-30 border border-r-0 border-slate-600 transition-transform duration-300" :class="isOpen ? 'translate-x-full' : 'translate-x-0'">
    📜 Лог
    <span v-if="unreadCount > 0" class="absolute -top-2 -left-2 bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full animate-bounce">{{ unreadCount }}</span>
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
  info: 'text-slate-300',
  success: 'text-emerald-400 font-bold',
  error: 'text-rose-400 opacity-90',
  warning: 'text-amber-400',
  system: 'text-blue-400 font-bold tracking-wide'
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
