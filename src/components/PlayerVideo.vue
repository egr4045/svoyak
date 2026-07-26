<template>
  <!-- Пока кадров нет, <video> — чёрный прямоугольник поверх аватара. Держим слой прозрачным
       до первого кадра: под ним видно аватар, и переключение выглядит как плавное появление,
       а не «черный экран на пару секунд». -->
  <div ref="container"
       class="absolute inset-0 z-10 overflow-hidden rounded-xl pointer-events-none transition-opacity duration-300 [&>video]:w-full [&>video]:h-full"
       :class="[ready ? 'opacity-100' : 'opacity-0', fit === 'contain' ? '[&>video]:!object-contain' : '[&>video]:!object-cover']"></div>
</template>

<script setup>
// Живая камера участника звонка.
// attachVideo безопасен до появления видеотрека: SDK смонтирует <video>, как только трек придёт,
// и уберёт его при выключении камеры — аватар под ним «просвечивает». Поэтому компонент можно
// (и нужно) держать смонтированным всё время, а не вешать v-if на camOn: иначе каждое мигание
// камеры даёт лишний цикл attach/detach.
//
// ВАЖНО: один и тот же участник может быть примонтирован в НЕСКОЛЬКО контейнеров одновременно
// (SDK хранит Map<accountId, Set<container>> и создаёт отдельный <video> на каждый). Именно на
// этом держится спотлайт: тот же человек показывается и крупно, и в ленте — DOM двигать не надо.
// LiveKit (adaptiveStream) сам поднимает качество под самый крупный видимый тайл.
//
// object-fit SDK прописывает инлайном (`cover`), поэтому переопределяем через `!` — иначе
// letterbox в крупном тайле не получить.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { usePlatformStore } from '../stores/platform'

const props = defineProps({
  accountId: { type: String, required: true },
  fit: { type: String, default: 'cover' } // 'cover' | 'contain'
})

const platform = usePlatformStore()
const container = ref(null)
const ready = ref(false)
let detach = () => {}
let observer = null
let watched = null

// <video> создаёт SDK и вставляет его в контейнер сам — ловим его появление наблюдателем
function watchVideo() {
  const el = container.value?.querySelector('video')
  if (!el || el === watched) return
  watched = el
  const markReady = () => { ready.value = true }
  // readyState ≥ 2 — кадр уже есть (бывает, если трек переиспользован из другого тайла)
  if (el.readyState >= 2) markReady()
  el.addEventListener('loadeddata', markReady)
  el.addEventListener('playing', markReady)
}

function mount() {
  detach()
  ready.value = false
  watched = null
  if (container.value && props.accountId) {
    detach = platform.attachVideo(props.accountId, container.value)
    watchVideo()
  }
}

onMounted(() => {
  mount()
  observer = new MutationObserver(() => {
    if (!container.value?.querySelector('video')) { ready.value = false; watched = null }
    else watchVideo()
  })
  if (container.value) observer.observe(container.value, { childList: true })
})

watch(() => props.accountId, mount)

onBeforeUnmount(() => {
  observer?.disconnect()
  detach()
})
</script>
