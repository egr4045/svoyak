<template>
  <div class="flex-1 flex flex-col items-center gap-3 py-2 w-full">
    <!-- Медиа-фрагмент (аудио/видео/фото), управляется ведущим через host:controlMedia -->
    <div v-if="q?.mediaType" class="w-full max-w-2xl rounded-2xl overflow-hidden border-2 border-hub-border bg-black/40 relative">
      <img v-if="q.mediaType === 'image'" :src="store.getAssetUrl(q.mediaSrc)"
           class="w-full h-auto object-contain max-h-[38vh] transition-all"
           :style="imgReveal" />
      <div v-else-if="q.mediaType === 'video'" class="w-full aspect-video flex items-center justify-center bg-slate-950">
        <video v-if="store.mediaState?.status === 'playing'" :src="store.getAssetUrl(q.mediaSrc)" class="w-full h-full" autoplay></video>
        <div v-else class="flex flex-col items-center gap-3 text-hub-muted"><Video class="w-14 h-14 opacity-30" /><span class="text-xs font-black uppercase tracking-widest">Видео-фрагмент</span></div>
      </div>
      <div v-else class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-hub-solid to-hub-deep">
        <audio v-if="store.mediaState?.status === 'playing'" :src="store.getAssetUrl(q.mediaSrc)" autoplay></audio>
        <div class="w-20 h-20 rounded-full bg-hub-accent/10 flex items-center justify-center border border-hub-accent/20" :class="{ 'animate-pulse': store.mediaState?.status === 'playing' }">
          <Volume2 class="w-10 h-10 text-hub-accent" />
        </div>
        <span class="text-xs font-black uppercase tracking-widest text-hub-muted mt-3">Аудио-фрагмент</span>
      </div>
    </div>

    <!-- Текущая цена + уровень раскрытия -->
    <div class="flex items-center gap-4">
      <span class="text-hub-warning font-black text-lg">Цена: {{ store.activeBet ?? q?.points }}</span>
      <span v-if="store.snippetLevel" class="text-hub-muted text-sm">Раскрыто: {{ store.snippetLevel }}</span>
    </div>

    <!-- Ведущий: открыть больше (снижает цену) -->
    <button v-if="isHost && store.questionStatus === 'snippet_playing'" @click="revealMore"
            class="hub-btn text-sm !text-hub-warning">🔓 Открыть больше (−очки)</button>
    <p v-else-if="store.questionStatus === 'snippet_playing' && !isHost" class="text-hub-muted text-sm italic">Слушайте фрагмент и жмите баззер, когда узнаете.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { Video, Volume2 } from 'lucide-vue-next'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const q = computed(() => store.currentQuestion)

// Для фото-фрагмента раскрытие = снятие блюра по уровням (5 уровней → 0px)
const imgReveal = computed(() => {
  if (q.value?.mediaType !== 'image') return {}
  const blur = Math.max(0, 20 - (store.snippetLevel || 0) * 5)
  return { filter: `blur(${blur}px)` }
})

function revealMore() { emit('action', { name: 'host:revealMore' }) }
</script>
