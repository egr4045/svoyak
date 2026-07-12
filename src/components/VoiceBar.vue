<template>
  <div class="fixed bottom-4 left-4 z-40 select-none">
    <!-- Нет платформенной сессии / SDK -->
    <div v-if="!platform.available || !platform.me"
         class="bg-slate-900/90 border border-slate-700/50 rounded-xl px-4 py-2 text-xs text-slate-500 shadow-lg backdrop-blur">
      🎙 Голосовой чат доступен при входе через MyGame Hub
    </div>

    <!-- SDK есть, но слой звонков ещё не подвезли (устаревшая сборка SDK) -->
    <div v-else-if="!platform.voiceSupported"
         class="bg-slate-900/90 border border-slate-700/50 rounded-xl px-4 py-2 text-xs text-slate-500 shadow-lg backdrop-blur">
      🎙 Голос появится после обновления SDK платформы
    </div>

    <!-- Активная голосовая панель -->
    <div v-else class="bg-slate-900/90 border border-slate-700/50 rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg backdrop-blur">
      <template v-if="platform.voiceConnected">
        <button @click="toggleMic"
                :class="micOn ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300' : 'bg-rose-600/30 border-rose-500/50 text-rose-300'"
                class="w-9 h-9 rounded-lg border flex items-center justify-center text-lg transition-colors hover:brightness-125"
                :title="micOn ? 'Выключить микрофон' : 'Включить микрофон'">
          {{ micOn ? '🎙' : '🔇' }}
        </button>
        <button @click="toggleCam"
                :class="camOn ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300' : 'bg-slate-700/50 border-slate-600 text-slate-400'"
                class="w-9 h-9 rounded-lg border flex items-center justify-center text-lg transition-colors hover:brightness-125"
                :title="camOn ? 'Выключить камеру' : 'Включить камеру'">
          {{ camOn ? '📷' : '📷' }}
        </button>
        <span class="text-xs text-slate-400 font-bold px-1">
          {{ platform.voice.participants.length }} в голосе
        </span>
        <button v-if="isHost" @click="inviteParty"
                class="text-xs font-bold text-amber-400 hover:text-amber-200 border border-amber-500/30 bg-amber-900/20 hover:bg-amber-700/30 rounded-lg px-3 py-2 transition-colors"
                title="Отправить приглашение всем участникам текущего звонка">
          🎮 Позвать участников звонка
        </button>
      </template>
      <template v-else-if="platform.voice.status === 'connecting'">
        <span class="text-xs text-slate-400 animate-pulse px-2 py-2">Подключение к голосу…</span>
      </template>
      <template v-else>
        <span v-if="platform.voice.error" class="text-xs text-rose-400 px-2 py-2">🎙 Голос недоступен</span>
        <button @click="rejoin"
                class="text-xs font-bold text-slate-300 hover:text-white border border-slate-600 rounded-lg px-3 py-2 hover:bg-slate-700 transition-colors">
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
