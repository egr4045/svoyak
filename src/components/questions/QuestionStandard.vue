<template>
  <div class="flex-1 flex flex-col items-center">
    <!-- Media component (shared logic) -->
    <div v-if="store.currentQuestion?.mediaType || store.currentQuestion?.image" class="mb-4 w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black/40 shadow-2xl relative group flex-shrink-0">
      <img v-if="store.currentQuestion.image || store.currentQuestion.mediaType === 'image'" 
           :src="store.getAssetUrl(store.currentQuestion.image || store.currentQuestion.mediaSrc)" 
           class="w-full h-auto object-contain max-h-[40vh] transition-transform duration-500 group-hover:scale-[1.02]" />
      
      <div v-else-if="store.currentQuestion.mediaType === 'video'" class="w-full aspect-video flex flex-col items-center justify-center bg-slate-950">
        <video v-if="store.mediaState?.status === 'playing'" ref="videoPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)" class="w-full h-full" autoplay></video>
        <div v-else class="flex flex-col items-center gap-4 text-slate-600">
           <Video class="w-16 h-16 opacity-30" />
           <span class="text-sm font-black uppercase tracking-[0.2em]">Видеоматериал</span>
        </div>
      </div>

      <div v-else-if="store.currentQuestion.mediaType === 'audio'" class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950">
        <audio v-if="store.mediaState?.status === 'playing'" ref="audioPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)" autoplay></audio>
        <div class="flex flex-col items-center gap-4">
           <div class="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20" :class="{'animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.3)]': store.mediaState?.status === 'playing'}">
              <Volume2 class="w-10 h-10 text-blue-500" />
           </div>
           <span class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Аудиофрагмент</span>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col justify-start items-center overflow-y-auto min-h-0 py-2 pb-6">
      <h3 class="font-black leading-tight text-slate-100 max-w-4xl mx-auto drop-shadow-2xl overflow-hidden break-words hyphens-auto text-center"
          :class="isHost ? 'text-lg md:text-2xl lg:text-3xl mb-4' : 'text-xl md:text-3xl lg:text-4xl mb-6'">
        {{ store.currentQuestion.q }}
      </h3>
    </div>

    <!-- Answering logic and input would go here, or be shared back with ActiveQuestion if generic -->
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../../stores/game'
import { Video, Volume2 } from 'lucide-vue-next'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)
const videoPlayer = ref(null)
const audioPlayer = ref(null)
</script>
