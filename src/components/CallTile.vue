<template>
  <!-- Тайл участника как в групповом звонке: живое видео, аватар — фолбэк, подпись и бейджи.
       PlayerVideo держим смонтированным всегда — SDK сам вешает/снимает <video> по треку. -->
  <div class="relative rounded-2xl overflow-hidden border-2 bg-hub-deep transition-all"
       :class="[
         speaking ? 'border-hub-accent glow-accent' : 'border-hub-border',
         connected ? '' : 'opacity-60'
       ]"
       :style="{ aspectRatio: compact ? '1 / 1' : '4 / 3' }">

    <!-- Фолбэк под видео -->
    <div class="absolute inset-0 flex items-center justify-center">
      <img v-if="avatar && store.avatarIsImage(avatar)" :src="store.getAvatarUrl(avatar)"
           class="object-cover rounded-2xl" :class="compact ? 'w-10 h-10' : 'w-20 h-20'" />
      <span v-else-if="avatar" :class="compact ? 'text-3xl' : 'text-6xl'">{{ avatar }}</span>
      <span v-else class="font-black text-hub-muted" :class="compact ? 'text-xl' : 'text-4xl'">
        {{ (name || '?').charAt(0).toUpperCase() }}
      </span>
    </div>

    <PlayerVideo v-if="platformId" :account-id="platformId" />

    <!-- Не в звонке — видео тут не появится, говорим об этом прямо.
         У ботов звонка нет по определению, им этот бейдж не нужен. -->
    <div v-if="connected && !inCall && !isBot" class="absolute inset-0 z-20 flex items-end justify-center pb-8 pointer-events-none">
      <span class="text-[10px] font-black uppercase tracking-widest text-hub-warning bg-hub-deep/85 px-2 py-1 rounded-full">
        не в звонке
      </span>
    </div>
    <div v-if="!connected" class="absolute inset-0 z-20 bg-black/60 flex items-center justify-center text-2xl" title="Отключился">🔌</div>

    <!-- Подпись + бейджи -->
    <div class="absolute inset-x-0 bottom-0 z-20 px-2 py-1.5 flex items-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent">
      <span v-if="isHostTile" title="Ведущий" class="shrink-0">👑</span>
      <span v-if="isBot" title="Бот тестового режима" class="shrink-0">🤖</span>
      <span class="font-bold truncate" :class="compact ? 'text-[11px]' : 'text-sm'">{{ name }}</span>
      <span v-if="isMe" class="text-[9px] uppercase tracking-widest text-hub-muted font-black shrink-0">вы</span>
      <span v-if="!isBot" class="ml-auto shrink-0 text-xs" :title="micTitle">{{ micIcon }}</span>
    </div>

    <!-- Статус готовности (только игроки, только пока грузятся/есть проблемы) -->
    <div v-if="statusBadge" class="absolute top-1.5 left-1.5 z-20 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
         :class="statusBadge.cls">
      {{ statusBadge.text }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import PlayerVideo from './PlayerVideo.vue'

const props = defineProps({
  participant: { type: Object, required: true },
  isMe: { type: Boolean, default: false },
  isHostTile: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showReady: { type: Boolean, default: true }
})

const store = useGameStore()
const platform = usePlatformStore()

const name = computed(() => props.participant.name)
const avatar = computed(() => props.participant.avatar)
const platformId = computed(() => props.participant.platformId || null)
const connected = computed(() => props.participant.connected !== false)
// Бот тестового режима: ни звонка, ни прелоада — бейджи про них только мешают
const isBot = computed(() => props.participant.isBot === true)

// Участник звонка (может отсутствовать: человек в игре, но не в голосе)
const voice = computed(() => platformId.value ? platform.participantFor(platformId.value) : null)
const inCall = computed(() => !!voice.value)
const speaking = computed(() => !!voice.value?.speaking)

const micIcon = computed(() => !inCall.value ? '—' : voice.value.micOn ? '🎙' : '🔇')
const micTitle = computed(() => !inCall.value ? 'Не в голосовом чате'
  : voice.value.micOn ? 'Микрофон включён' : 'Микрофон выключен')

const statusBadge = computed(() => {
  if (!props.showReady || !connected.value || isBot.value) return null
  if (props.participant.failedAssets) {
    return { text: `⚠ ${props.participant.failedAssets}`, cls: 'bg-hub-warning/90 text-black' }
  }
  if (!props.participant.loadedAssets) {
    return { text: 'грузит…', cls: 'bg-hub-deep/85 text-hub-warning' }
  }
  return null // готов — не засоряем тайл
})
</script>
