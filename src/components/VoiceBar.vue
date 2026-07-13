<template>
  <div class="fixed bottom-4 left-4 z-40 select-none">
    <!-- Нет платформенной сессии / SDK -->
    <div v-if="!platform.available || !platform.me"
         class="panel-glass px-4 py-2 text-xs text-hub-muted shadow-lg">
      🎙 Голосовой чат доступен при входе через MyGame Hub
    </div>

    <!-- SDK есть, но слой звонков ещё не подвезли (устаревшая сборка SDK) -->
    <div v-else-if="!platform.voiceSupported"
         class="panel-glass px-4 py-2 text-xs text-hub-muted shadow-lg">
      🎙 Голос появится после обновления SDK платформы
    </div>

    <!-- Незащищённый контекст (http): микрофон/камера недоступны -->
    <div v-else-if="!platform.voiceSecure"
         class="panel-glass px-4 py-2 text-xs text-hub-warning shadow-lg">
      🎙 Голос доступен только по HTTPS — откройте игру из хаба
    </div>

    <!-- Активная голосовая панель -->
    <div v-else class="panel-glass px-3 py-2 flex items-center gap-2 shadow-lg">
      <template v-if="platform.voiceConnected">
        <button @click="toggleMic"
                :class="micOn ? 'bg-hub-accent/30 border-hub-accent/50 text-hub-accent' : 'bg-hub-negative/30 border-hub-negative/50 text-hub-negative'"
                class="w-9 h-9 rounded-lg border flex items-center justify-center text-lg transition-colors hover:brightness-125"
                :title="micOn ? 'Выключить микрофон' : 'Включить микрофон'">
          {{ micOn ? '🎙' : '🔇' }}
        </button>
        <button @click="toggleCam"
                :class="camOn ? 'bg-hub-accent/30 border-hub-accent/50 text-hub-accent' : 'bg-hub-hover border-hub-border text-hub-muted'"
                class="w-9 h-9 rounded-lg border flex items-center justify-center text-lg transition-colors hover:brightness-125"
                :title="camOn ? 'Выключить камеру' : 'Включить камеру'">
          📷
        </button>
        <span class="text-xs text-hub-muted font-bold px-1">
          {{ platform.voice.participants.length }} в голосе
        </span>
        <!-- Ошибка даже в подключённом состоянии (напр. микрофон недоступен) -->
        <span v-if="platform.voice.error" class="text-xs text-hub-warning px-1" :title="platform.voice.error">⚠ {{ platform.voice.error }}</span>
        <button v-if="isHost" @click="inviteParty"
                class="hub-btn text-xs !text-hub-accent"
                title="Отправить приглашение всем участникам текущего звонка">
          🎮 Позвать участников звонка
        </button>
      </template>
      <template v-else-if="platform.voice.status === 'connecting'">
        <span class="text-xs text-hub-muted animate-pulse px-2 py-2">Подключение к голосу…</span>
      </template>
      <template v-else>
        <span v-if="platform.voice.error" class="text-xs text-hub-negative px-2 py-2">🎙 Голос недоступен</span>
        <button @click="rejoin" class="hub-btn text-xs">
          {{ platform.voice.error ? '↻ Попробовать снова' : '🎙 Войти в голосовой чат' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePlatformStore } from '../stores/platform'
import { useGameStore } from '../stores/game'

const platform = usePlatformStore()
const game = useGameStore()

const isHost = computed(() => game.host && game.user && String(game.host.id) === String(game.user.id))
const micOn = computed(() => platform.localParticipant?.micOn ?? false)
const camOn = computed(() => platform.localParticipant?.camOn ?? false)

function toggleMic() { platform.setMic(!micOn.value) }
function toggleCam() { platform.setCam(!camOn.value) }
async function inviteParty() {
  const ok = await platform.invitePartyToGame(game.roomCode)
  platform.toast(ok
    ? 'Приглашение отправлено участникам звонка'
    : 'Не удалось отправить приглашение — звонок не привязался к комнате')
}
function rejoin() {
  platform.joinVoice(game.roomCode, { spectator: game.isSpectator })
}
</script>
