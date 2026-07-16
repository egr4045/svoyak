<template>
  <div class="flex-1 flex flex-col items-center">
    <!-- Media component (shared logic) -->
    <div v-if="store.currentQuestion?.mediaType || store.currentQuestion?.image" class="mb-4 w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black/40 shadow-2xl relative group flex-shrink-0">
      <img v-if="store.currentQuestion.image || store.currentQuestion.mediaType === 'image'" 
           :src="store.getAssetUrl(store.currentQuestion.image || store.currentQuestion.mediaSrc)" 
           class="w-full h-auto object-contain max-h-[40vh] transition-transform duration-500 group-hover:scale-[1.02]" />
      
      <div v-else-if="store.currentQuestion.mediaType === 'video'" class="w-full aspect-video flex flex-col items-center justify-center bg-slate-950 relative">
        <video v-if="store.mediaState?.status === 'playing'" ref="videoPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)" class="w-full h-full" playsinline></video>
        <div v-else class="flex flex-col items-center gap-4 text-slate-600">
           <Video class="w-16 h-16 opacity-30" />
           <span class="text-sm font-black uppercase tracking-[0.2em]">Видеоматериал</span>
        </div>
        <!-- Браузер заблокировал автоплей (нет пользовательского жеста на этой странице) — клик снимает блокировку -->
        <button v-if="videoBlocked" @click="retryVideo" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
          <span class="text-5xl">▶</span>
          <span class="text-xs font-bold uppercase tracking-widest">Нажмите, чтобы воспроизвести</span>
        </button>
      </div>

      <div v-else-if="store.currentQuestion.mediaType === 'audio'" class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 relative">
        <audio v-if="store.mediaState?.status === 'playing'" ref="audioPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)"></audio>
        <div class="flex flex-col items-center gap-4">
           <div class="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20" :class="{'animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.3)]': store.mediaState?.status === 'playing'}">
              <Volume2 class="w-10 h-10 text-blue-500" />
           </div>
           <span class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Аудиофрагмент</span>
        </div>
        <button v-if="audioBlocked" @click="retryAudio" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
          <span class="text-5xl">▶</span>
          <span class="text-xs font-bold uppercase tracking-widest">Нажмите, чтобы включить звук</span>
        </button>
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
import { computed, ref, watch, nextTick } from 'vue'
import { useGameStore } from '../../stores/game'
import { Video, Volume2 } from 'lucide-vue-next'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)
const videoPlayer = ref(null)
const audioPlayer = ref(null)
const videoBlocked = ref(false)
const audioBlocked = ref(false)

// Статус media приходит по сокету (не с клика на этой странице) — браузер может заблокировать автоплей.
// Пытаемся играть сами; если промис отклонён — показываем кнопку-фолбэк "нажмите, чтобы..." (реальный клик всегда проходит).
async function tryPlay(kind) {
  await nextTick()
  const el = kind === 'video' ? videoPlayer.value : audioPlayer.value
  if (!el) return
  const blocked = kind === 'video' ? videoBlocked : audioBlocked
  blocked.value = false
  try {
    await el.play()
  } catch {
    blocked.value = true
  }
}

watch(() => store.mediaState?.status, (status) => {
  if (status !== 'playing') { videoBlocked.value = false; audioBlocked.value = false; return }
  const type = store.currentQuestion?.mediaType
  if (type === 'video') tryPlay('video')
  else if (type === 'audio') tryPlay('audio')
}, { immediate: true })

function retryVideo() { tryPlay('video') }
function retryAudio() { tryPlay('audio') }
</script>
