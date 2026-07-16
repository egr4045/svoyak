<template>
  <div class="h-screen w-full flex flex-col items-center justify-center p-6 md:p-8">
    <div v-if="!store.connected" class="text-xl text-hub-muted animate-pulse">Подключение к серверу…</div>

    <div v-else class="w-full max-w-4xl panel-glass p-6 md:p-8">
      <!-- Шапка: без кода комнаты (вход через приглашения хаба) -->
      <div class="flex justify-between items-center border-b border-hub-border pb-5 mb-6">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🔒</span>
          <div>
            <h2 class="text-2xl font-black text-hub-accent leading-tight">Приватная комната</h2>
            <p class="text-xs text-hub-muted">Зовите друзей через виджет справа внизу</p>
          </div>
        </div>
        <div class="flex gap-4 items-center">
          <span v-if="isHost" class="text-hub-muted text-sm">Вы — Ведущий</span>
          <button @click="leaveRoom" class="hub-btn text-sm !text-hub-negative">Выйти в хаб</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Участники -->
        <div>
          <h3 class="text-lg font-bold mb-3">
            Участники <span class="text-hub-muted">({{ store.players.length }}/{{ store.maxPlayers }} мест)</span>
          </h3>
          <div class="space-y-2">
            <div v-for="p in store.players" :key="p.id"
                 @contextmenu="showParticipantMenu(p, $event, 'player')"
                 class="flex items-center justify-between hub-card p-2.5 transition-colors"
                 :class="{ 'border-hub-accent': speakingIds.has(p.platformId) }">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-hub-deep rounded-lg flex items-center justify-center font-bold overflow-hidden border"
                     :class="speakingIds.has(p.platformId) ? 'border-hub-accent' : 'border-hub-border'">
                  <img v-if="p.avatar && store.avatarIsImage(p.avatar)" :src="store.getAvatarUrl(p.avatar)" class="w-full h-full object-cover">
                  <span v-else-if="p.avatar" class="text-lg">{{ p.avatar }}</span>
                  <span v-else>{{ p.name.charAt(0).toUpperCase() }}</span>
                </div>
                <span class="font-medium" :class="{ 'text-hub-muted': !p.connected }">{{ p.name }}</span>
                <span v-if="voiceOf(p)" class="text-xs" :title="voiceOf(p).micOn ? 'В голосовом чате' : 'Микрофон выключен'">{{ voiceOf(p).micOn ? '🎙' : '🔇' }}</span>
              </div>
              <div class="text-sm">
                <span v-if="!p.loadedAssets" class="text-hub-warning animate-pulse">Загрузка…</span>
                <span v-else class="text-hub-positive font-bold">Готов</span>
              </div>
            </div>
            <div v-if="store.players.length === 0" class="text-hub-muted italic text-sm py-2">Ожидание игроков…</div>
          </div>

          <!-- Наблюдатели -->
          <div v-if="store.spectators.length || store.isSpectator" class="mt-6">
            <h3 class="text-base font-bold mb-2 text-hub-muted">👁 Наблюдатели ({{ store.spectators.length }})</h3>
            <div class="space-y-2">
              <div v-for="s in store.spectators" :key="s.id"
                   @contextmenu="showParticipantMenu(s, $event, 'spectator')"
                   class="flex items-center justify-between hub-card p-2">
                <div class="flex items-center gap-2.5">
                  <div class="w-7 h-7 bg-hub-deep rounded-lg flex items-center justify-center text-sm font-bold overflow-hidden border border-hub-border">
                    <img v-if="s.avatar && store.avatarIsImage(s.avatar)" :src="store.getAvatarUrl(s.avatar)" class="w-full h-full object-cover">
                    <span v-else-if="s.avatar">{{ s.avatar }}</span>
                    <span v-else>{{ s.name.charAt(0).toUpperCase() }}</span>
                  </div>
                  <span class="text-sm" :class="{ 'text-hub-muted': !s.connected }">{{ s.name }}</span>
                  <span v-if="voiceOf(s)" class="text-xs">{{ voiceOf(s).micOn ? '🎙' : '🔇' }}</span>
                </div>
                <div>
                  <button v-if="s.id === store.user?.id" @click="store.takeSeat()"
                          :disabled="store.seatsFree === 0"
                          class="text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors"
                          :class="store.seatsFree > 0
                            ? 'text-hub-accent border-hub-accent/40 hover:bg-hub-accent hover:text-white'
                            : 'text-hub-muted border-hub-border cursor-not-allowed'">
                    {{ store.seatsFree > 0 ? '🎮 Занять место' : 'Мест нет' }}
                  </button>
                  <button v-else-if="isHost" @click="store.promoteSpectator(s.id)"
                          :disabled="store.seatsFree === 0"
                          class="hub-btn text-xs disabled:opacity-40">В игроки</button>
                </div>
              </div>
            </div>
            <div v-if="store.isSpectator" class="mt-3 flex flex-col gap-2 items-start">
              <p class="text-xs text-hub-muted italic">
                Вы наблюдатель: видите игру и участвуете в голосовом чате, но не отвечаете на вопросы.
              </p>
              <button @click="leaveRoom" class="hub-btn text-xs">🚪 Не хочу смотреть — в хаб (другая игра)</button>
            </div>
          </div>
        </div>

        <!-- Ваша карточка + старт -->
        <div class="hub-card p-6 flex flex-col justify-between">
          <div>
            <h3 class="text-lg font-bold mb-4">Вы в игре</h3>
            <div class="flex items-center gap-4 mb-6">
              <div class="w-16 h-16 bg-hub-deep rounded-2xl border border-hub-border overflow-hidden flex items-center justify-center">
                <img v-if="myAvatar && store.avatarIsImage(myAvatar)" :src="store.getAvatarUrl(myAvatar)" class="w-full h-full object-cover">
                <span v-else-if="myAvatar" class="text-3xl">{{ myAvatar }}</span>
                <span v-else class="text-2xl font-black text-hub-muted">{{ (store.user?.username || '?').charAt(0).toUpperCase() }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-hub-muted text-[10px] uppercase font-black tracking-widest mb-1">Никнейм</span>
                <b class="text-xl text-hub-text">{{ store.user?.username }}</b>
                <span class="text-[11px] text-hub-muted">Аватар — из профиля MyGame Hub</span>
              </div>
            </div>

            <!-- Предзагрузка контента -->
            <div v-if="!myAssetsLoaded" class="w-full bg-hub-deep rounded-full h-3 mb-2 overflow-hidden">
              <div class="bg-hub-accent h-3 transition-all duration-300" :style="{ width: loadProgress + '%' }"></div>
            </div>
            <p v-if="!myAssetsLoaded" class="text-sm text-hub-muted">Загрузка ресурсов игры… {{ loadProgress }}%</p>
            <p v-else class="text-sm text-hub-positive font-bold">Ресурсы загружены</p>
          </div>

          <div class="mt-8">
            <button v-if="isHost" @click="startGame" :disabled="!allReady"
                    class="hub-btn-primary w-full py-4 text-lg uppercase tracking-wide"
                    :class="{ 'opacity-50 cursor-not-allowed': !allReady }">
              {{ allReady ? 'Начать игру' : 'Ожидание загрузки игроков…' }}
            </button>
            <div v-else class="text-center text-hub-muted italic bg-hub-deep/40 p-4 rounded-lg border border-hub-border">
              Ожидание старта игры ведущим…
            </div>
          </div>
        </div>
      </div>
    </div>
    <VoiceBar />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { showParticipantMenu } from '../platform/contextMenu'
import VoiceBar from '../components/VoiceBar.vue'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()

const speakingIds = computed(() => {
  const set = new Set()
  platform.voice.participants.forEach(p => { if (p.speaking) set.add(p.accountId) })
  return set
})
function voiceOf(p) {
  return p?.platformId ? platform.participantFor(p.platformId) : null
}

// Голос + активность + репорт аватара — после первого gameStateUpdated (host появился)
const voiceJoined = ref(false)
watch(() => store.host, (h) => {
  if (h && !voiceJoined.value) {
    voiceJoined.value = true
    platform.joinVoice(store.roomCode, { spectator: store.isSpectator })
    platform.setActivity(store.roomCode)
  }
}, { immediate: true })
// Когда платформенный профиль подъехал — сообщаем серверу свой аватар
watch(() => platform.me, () => store.reportAvatar(), { immediate: true })
// Повысили из наблюдателя в игрока — авто-включаем микрофон (joinVoice одноразовый)
watch(() => store.isSpectator, (isSpec, was) => {
  if (was && !isSpec && platform.voiceConnected) platform.setMic(true)
})

const myAssetsLoaded = ref(false)
const loadProgress = ref(0)

const isHost = computed(() => store.host && store.user && store.host.id === store.user.id)
const allReady = computed(() => {
  if (store.players.length === 0) return true
  return store.players.every(p => !p.connected || p.loadedAssets)
})
const myAvatar = computed(() => platform.me?.avatarIcon || store.players.find(p => p.id === store.user?.id)?.avatar || null)

onMounted(() => {
  if (!store.roomCode) store.roomCode = route.params.id
  store.initSocket()

  watch(() => store.roundsData, async (data) => {
    if (!data || data.length === 0 || loadProgress.value === 100) return
    const mediaUrls = []
    data.forEach(round => {
      if (round.categories) round.categories.forEach(cat => {
        cat.questions.forEach(q => {
          [q.mediaSrc, q.answerMediaSrc, q.image, q.media, q.answerMedia].forEach(s => { if (s) mediaUrls.push(store.getAssetUrl(s)) })
          // Тир-лист: медиа лежит на каждом объекте отдельно, не в q.mediaSrc
          if (Array.isArray(q.items)) q.items.forEach(it => { if (it?.mediaSrc) mediaUrls.push(store.getAssetUrl(it.mediaSrc)) })
        })
      })
    })
    const uniqueUrls = [...new Set(mediaUrls.filter(Boolean))]
    if (uniqueUrls.length === 0) {
      loadProgress.value = 100; myAssetsLoaded.value = true
      if (store.socket) store.socket.emit('player:loaded')
      return
    }
    let loaded = 0
    const promises = uniqueUrls.map(url => new Promise((resolve) => {
      const isVideo = url.endsWith('.mp4') || url.endsWith('.webm')
      const isAudio = url.endsWith('.mp3') || url.endsWith('.wav')
      let el
      if (isVideo) el = document.createElement('video')
      else if (isAudio) el = document.createElement('audio')
      else el = new Image()
      const finish = () => { loaded++; loadProgress.value = Math.floor((loaded / uniqueUrls.length) * 100); resolve() }
      el.onloadeddata = finish; el.onload = finish; el.onerror = finish
      if (isVideo || isAudio) el.preload = 'auto'
      el.src = url
      if (el instanceof Image && el.complete) finish()
    }))
    await Promise.all(promises)
    myAssetsLoaded.value = true
    if (store.socket) store.socket.emit('player:loaded')
  }, { immediate: true, deep: true })
})

watch(() => store.gameStarted, (started) => {
  if (started) router.push({ name: 'game', params: { id: store.roomCode } })
}, { immediate: true })

watch(() => store.connected, (conn) => {
  if (conn && myAssetsLoaded.value && store.socket) store.socket.emit('player:loaded')
})

function leaveRoom() {
  store.logout()
  platform.returnToHub()
}

function startGame() {
  if (isHost.value && (allReady.value || store.players.length === 0)) {
    store.socket.emit('room:start')
  }
}
</script>
