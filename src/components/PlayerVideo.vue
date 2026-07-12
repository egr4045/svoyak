<template>
  <div ref="container" class="absolute inset-0 z-10 overflow-hidden rounded-xl pointer-events-none [&>video]:w-full [&>video]:h-full [&>video]:object-cover"></div>
</template>

<script setup>
// Живая камера участника звонка поверх аватарки на карточке игрока.
// attachVideo безопасен до появления видеотрека: SDK смонтирует <video>,
// как только трек придёт, и уберёт его при выключении камеры — аватар «просвечивает».
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { usePlatformStore } from '../stores/platform'

const props = defineProps({
  accountId: { type: String, required: true }
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
