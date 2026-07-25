<template>
  <router-view />
</template>

<script setup>
// Корневой компонент: только глобальная разблокировка аудио первым жестом
// (sfx/медиа должны звучать в любой неожиданный момент — см. src/lib/audioUnlock.js)
import { installAudioUnlock } from './lib/audioUnlock'
installAudioUnlock()
</script>
