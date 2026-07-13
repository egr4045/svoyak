<template>
  <!-- Переиспользуемый ряд карточек игроков: выбор исполнителя / «кто угадал» / дуэлянтов.
       Только места (store.players), т.к. adjustScore не начисляет наблюдателям/ведущему. -->
  <div class="flex flex-col items-center gap-2">
    <p v-if="label" class="text-hub-muted text-sm font-bold">{{ label }}</p>
    <div class="flex flex-wrap gap-2 justify-center">
      <button v-for="p in list" :key="p.id"
              :disabled="disabledIds.includes(p.id)"
              @click="$emit('pick', p.id)"
              class="hub-card px-3 py-2 flex items-center gap-2 hover:border-hub-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :class="selectedIds.includes(p.id) ? 'border-hub-accent ring-1 ring-hub-accent' : ''">
        <span class="w-6 h-6 rounded bg-hub-deep flex items-center justify-center text-xs font-bold overflow-hidden border border-hub-border">
          <img v-if="p.avatar && store.avatarIsImage(p.avatar)" :src="store.getAvatarUrl(p.avatar)" class="w-full h-full object-cover">
          <span v-else-if="p.avatar">{{ p.avatar }}</span>
          <span v-else>{{ p.name.charAt(0).toUpperCase() }}</span>
        </span>
        <span class="text-sm font-bold text-hub-text">{{ p.name }}</span>
      </button>
      <p v-if="list.length === 0" class="text-hub-muted text-sm italic">Нет игроков на местах</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const props = defineProps({
  label: { type: String, default: '' },
  players: { type: Array, default: null },     // переопределение списка (иначе места комнаты)
  disabledIds: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] }
})
defineEmits(['pick'])

const list = computed(() => props.players || store.players)
</script>
