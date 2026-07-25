<template>
  <div ref="container"
       class="absolute inset-0 z-10 overflow-hidden rounded-xl pointer-events-none [&>video]:w-full [&>video]:h-full"
       :class="fit === 'contain' ? '[&>video]:!object-contain' : '[&>video]:!object-cover'"></div>
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
let detach = () => {}

function mount() {
  detach()
  if (container.value && props.accountId) {
    detach = platform.attachVideo(props.accountId, container.value)
  }
}

onMounted(mount)
watch(() => props.accountId, mount)
onBeforeUnmount(() => detach())
</script>
