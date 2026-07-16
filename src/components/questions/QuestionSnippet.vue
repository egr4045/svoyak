<template>
  <div class="flex-1 flex flex-col items-center gap-3 py-2 w-full">
    <!-- Медиа-фрагмент (аудио/видео/фото), управляется ведущим через host:controlMedia -->
    <div v-if="q?.mediaType" class="w-full max-w-2xl rounded-2xl overflow-hidden border-2 border-hub-border bg-black/40 relative">
      <img v-if="q.mediaType === 'image'" :src="store.getAssetUrl(q.mediaSrc)"
           class="w-full h-auto object-contain max-h-[38vh] transition-all"
           :style="imgReveal" />
      <div v-else-if="q.mediaType === 'video'" class="w-full aspect-video flex items-center justify-center bg-slate-950 relative">
        <video v-if="store.mediaState?.status === 'playing'" ref="videoPlayer" :src="store.getAssetUrl(q.mediaSrc)" class="w-full h-full" playsinline></video>
        <div v-else class="flex flex-col items-center gap-3 text-hub-muted"><Video class="w-14 h-14 opacity-30" /><span class="text-xs font-black uppercase tracking-widest">Видео-фрагмент</span></div>
        <button v-if="videoBlocked" @click="retryVideo" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
          <span class="text-5xl">▶</span>
          <span class="text-xs font-bold uppercase tracking-widest">Нажмите, чтобы воспроизвести</span>
        </button>
      </div>
      <div v-else class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-hub-solid to-hub-deep relative">
        <audio v-if="store.mediaState?.status === 'playing'" ref="audioPlayer" :src="store.getAssetUrl(q.mediaSrc)"></audio>
        <div class="w-20 h-20 rounded-full bg-hub-accent/10 flex items-center justify-center border border-hub-accent/20" :class="{ 'animate-pulse': store.mediaState?.status === 'playing' }">
          <Volume2 class="w-10 h-10 text-hub-accent" />
        </div>
        <span class="text-xs font-black uppercase tracking-widest text-hub-muted mt-3">Аудио-фрагмент</span>
        <button v-if="audioBlocked" @click="retryAudio" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
          <span class="text-5xl">▶</span>
          <span class="text-xs font-bold uppercase tracking-widest">Нажмите, чтобы включить звук</span>
        </button>
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
import { computed, ref, watch, nextTick } from 'vue'
import { useGameStore } from '../../stores/game'
import { Video, Volume2 } from 'lucide-vue-next'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)
const q = computed(() => store.currentQuestion)

const videoPlayer = ref(null)
const audioPlayer = ref(null)
const videoBlocked = ref(false)
const audioBlocked = ref(false)

// Статус media приходит по сокету (не с клика на этой странице) — браузер может заблокировать автоплей.
// Пытаемся играть сами; если промис отклонён — показываем кнопку-фолбэк (реальный клик всегда проходит).
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
  if (q.value?.mediaType === 'video') tryPlay('video')
  else if (q.value?.mediaType === 'audio') tryPlay('audio')
}, { immediate: true })

function retryVideo() { tryPlay('video') }
function retryAudio() { tryPlay('audio') }

// Для фото-фрагмента раскрытие = снятие блюра по уровням (5 уровней → 0px)
const imgReveal = computed(() => {
  if (q.value?.mediaType !== 'image') return {}
  const blur = Math.max(0, 20 - (store.snippetLevel || 0) * 5)
  return { filter: `blur(${blur}px)` }
})

function revealMore() { emit('action', { name: 'host:revealMore' }) }
</script>
