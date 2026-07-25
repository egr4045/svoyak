<template>
  <!-- Единый плеер медиа вопроса: image / audio / video. A/V синхронизируются через
       useSyncedMedia (якорь сервера); элемент смонтирован всегда — seek и preload работают
       до и после старта, а заглушка лежит поверх. -->
  <div class="w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black/40 shadow-2xl relative flex-shrink-0">
    <!-- Фото -->
    <img v-if="mediaType === 'image'"
         :src="url"
         class="w-full h-auto object-contain max-h-[40vh] transition-all duration-500"
         :style="blurPx ? { filter: `blur(${blurPx}px)` } : {}"
         @error="imgError = true" />
    <div v-if="mediaType === 'image' && imgError" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-hub-negative">
      <span class="text-3xl">🖼️</span>
      <span class="text-xs font-bold uppercase tracking-widest">Изображение не загрузилось</span>
    </div>

    <!-- Видео -->
    <div v-else-if="mediaType === 'video'" class="w-full aspect-video bg-slate-950 relative">
      <video ref="el" :src="url" class="w-full h-full" playsinline preload="auto"></video>
      <div v-if="!playingNow" class="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-600 bg-slate-950">
        <Video class="w-16 h-16 opacity-30" />
        <span class="text-sm font-black uppercase tracking-[0.2em]">{{ label || 'Видеоматериал' }}</span>
      </div>
      <button v-if="blocked && !error" @click="retry" class="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
        <span class="text-5xl">▶</span>
        <span class="text-xs font-bold uppercase tracking-widest">{{ mutedAutoplay ? 'Нажмите, чтобы включить звук' : 'Нажмите, чтобы воспроизвести' }}</span>
      </button>
      <div v-if="error" class="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/80">
        <span class="text-hub-negative text-sm font-bold uppercase tracking-widest">Медиа не загрузилось</span>
        <button @click="retry" class="hub-btn text-xs">↻ Повторить</button>
      </div>
    </div>

    <!-- Аудио -->
    <div v-else-if="mediaType === 'audio'" class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 relative">
      <audio ref="el" :src="url" preload="auto"></audio>
      <div class="flex flex-col items-center gap-4">
        <div class="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20"
             :class="{ 'animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.3)]': playingNow }">
          <Volume2 class="w-10 h-10 text-blue-500" />
        </div>
        <span class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{{ label || 'Аудиофрагмент' }}</span>
      </div>
      <button v-if="blocked && !error" @click="retry" class="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
        <span class="text-5xl">▶</span>
        <span class="text-xs font-bold uppercase tracking-widest">Нажмите, чтобы включить звук</span>
      </button>
      <div v-if="error" class="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/80">
        <span class="text-hub-negative text-sm font-bold uppercase tracking-widest">Медиа не загрузилось</span>
        <button @click="retry" class="hub-btn text-xs">↻ Повторить</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Video, Volume2 } from 'lucide-vue-next'
import { useGameStore } from '../stores/game'
import { useSyncedMedia } from '../composables/useSyncedMedia'

const props = defineProps({
  src: { type: String, required: true },
  mediaType: { type: String, required: true }, // 'image' | 'audio' | 'video'
  blurPx: { type: Number, default: 0 },        // блюр фото-фрагмента (снимается уровнями)
  label: { type: String, default: '' }
})

const store = useGameStore()
const url = computed(() => store.getAssetUrl(props.src))
const playingNow = computed(() => store.mediaState?.status === 'playing')
const imgError = ref(false)

const el = ref(null)
const { blocked, mutedAutoplay, error, retry } = useSyncedMedia(el, { mediaType: props.mediaType })
</script>
