<template>
  <div class="h-dvh w-full flex flex-col p-3 md:p-6 gap-3">
    <div v-if="!store.connected" class="flex-1 flex items-center justify-center text-xl text-hub-muted animate-pulse">
      Подключение к серверу…
    </div>

    <template v-else>
      <!-- Шапка -->
      <div class="shrink-0 flex justify-between items-center gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-2xl shrink-0">🔒</span>
          <div class="min-w-0">
            <h2 class="text-xl md:text-2xl font-black font-display text-party-gradient leading-tight truncate">Лобби Свояка</h2>
            <p class="text-xs text-hub-muted truncate">{{ store.players.length }}/{{ store.maxPlayers }} мест · зовите друзей через виджет справа внизу</p>
          </div>
        </div>
        <div class="flex gap-2 md:gap-3 items-center shrink-0">
          <span v-if="isHost" class="hidden sm:inline text-hub-muted text-sm">Вы — Ведущий</span>
          <button @click="leaveRoom" class="hub-btn text-xs md:text-sm !text-hub-negative">Выйти в хаб</button>
        </div>
      </div>

      <!-- Браузер не дал микрофон/камеру — самая частая причина «ничего не работает» -->
      <div v-if="platform.deviceError" class="shrink-0 panel-glass border-hub-negative/60 px-4 py-3 flex items-start gap-3 anim-rise-in">
        <span class="text-xl shrink-0">🚫</span>
        <div class="min-w-0">
          <p class="font-bold text-hub-negative text-sm">Нет доступа к устройству</p>
          <p class="text-xs text-hub-muted">{{ platform.deviceError }}</p>
        </div>
        <button @click="platform.deviceError = null" class="ml-auto hub-btn text-xs shrink-0">Понятно</button>
      </div>

      <!-- Не в звонке: без голоса игра не работает -->
      <div v-else-if="!platform.voiceConnected && platform.voiceSupported && platform.voiceSecure"
           class="shrink-0 panel-glass border-hub-warning/50 px-4 py-3 flex items-center gap-3">
        <span class="text-xl shrink-0">🎙</span>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-hub-warning text-sm">Вы не в голосовом чате</p>
          <p class="text-xs text-hub-muted">Игра идёт голосом — без него вы не услышите вопросы.</p>
        </div>
        <button @click="joinVoiceNow" class="hub-btn-primary text-xs shrink-0">Войти в звонок</button>
      </div>

      <!-- Сетка участников: собственно «групповой звонок» -->
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="grid gap-2 md:gap-3" :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))` }">
          <CallTile v-for="p in store.players" :key="p.id"
                    :participant="p"
                    :is-me="String(p.id) === String(store.user?.id)"
                    :is-host-tile="String(p.id) === String(store.host?.id)" />
          <!-- Ведущий — тоже человек в звонке, но он не игрок и в players его нет -->
          <CallTile v-if="hostTile" :participant="hostTile" :is-me="isHost" :is-host-tile="true" :show-ready="false" />
          <!-- Пустые места, чтобы было видно, сколько ещё влезет -->
          <div v-for="n in freeSeats" :key="'free' + n"
               class="rounded-2xl border-2 border-dashed border-hub-border/50 flex items-center justify-center text-hub-muted/50 text-xs"
               style="aspect-ratio: 4 / 3">
            свободно
          </div>
        </div>

        <!-- Наблюдатели — компактной лентой -->
        <div v-if="store.spectators.length" class="mt-3">
          <p class="text-[10px] uppercase tracking-widest text-hub-muted font-black mb-1.5">👁 Наблюдатели ({{ store.spectators.length }})</p>
          <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(84px, 1fr))">
            <CallTile v-for="s in store.spectators" :key="s.id"
                      :participant="s" :is-me="String(s.id) === String(store.user?.id)"
                      compact :show-ready="false" />
          </div>
          <div v-if="store.isSpectator" class="mt-2 flex flex-wrap gap-2 items-center">
            <span class="text-xs text-hub-muted italic">Вы наблюдатель: видите игру и говорите в звонке, но не отвечаете.</span>
            <button v-if="store.seatsFree > 0" @click="store.takeSeat()" class="hub-btn text-xs !text-hub-accent">🎮 Занять место</button>
          </div>
        </div>
      </div>

      <!-- Нижняя панель: свои устройства, готовность, старт -->
      <div class="shrink-0 panel-glass px-3 py-2.5 flex flex-wrap items-center gap-2 md:gap-3">
        <template v-if="platform.voiceConnected">
          <button @click="toggleMic"
                  class="w-11 h-11 rounded-xl border flex items-center justify-center text-xl transition-colors"
                  :class="micOn ? 'bg-hub-accent/25 border-hub-accent/60 text-hub-accent' : 'bg-hub-negative/25 border-hub-negative/60 text-hub-negative'"
                  :title="micOn ? 'Выключить микрофон' : 'Включить микрофон'">{{ micOn ? '🎙' : '🔇' }}</button>
          <button @click="toggleCam"
                  class="w-11 h-11 rounded-xl border flex items-center justify-center text-xl transition-colors"
                  :class="camOn ? 'bg-hub-accent/25 border-hub-accent/60 text-hub-accent' : 'bg-hub-hover border-hub-border text-hub-muted'"
                  :title="camOn ? 'Выключить камеру' : 'Включить камеру'">📷</button>
          <span v-if="!camOn" class="text-xs text-hub-muted hidden sm:inline">Включите камеру — вас увидят</span>
        </template>

        <!-- Прелоад ресурсов -->
        <div class="flex items-center gap-2 min-w-[150px] flex-1 sm:flex-none">
          <div v-if="!myAssetsLoaded" class="flex-1 bg-hub-deep rounded-full h-2 overflow-hidden min-w-[80px]">
            <div class="bg-hub-accent h-2 transition-all duration-300" :style="{ width: loadProgress + '%' }"></div>
          </div>
          <span v-if="!myAssetsLoaded" class="text-xs text-hub-muted shrink-0">{{ loadProgress }}%</span>
          <span v-else-if="failedAssets" class="text-xs text-hub-warning font-bold">⚠ {{ failedAssets }} медиа не загрузилось</span>
          <span v-else class="text-xs text-hub-positive font-bold">Готов</span>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <button v-if="isHost && voiceMissing.length" @click="callToVoice" class="hub-btn text-xs">
            🎮 Позвать в звонок ({{ voiceMissing.length }})
          </button>
          <button v-if="isHost" @click="startGame" :disabled="!allReady"
                  class="hub-btn-primary py-3 px-6 uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed">
            {{ !allReady ? 'Ждём загрузки…' : (voiceMissing.length ? 'Начать всё равно' : 'Начать игру') }}
          </button>
          <span v-else class="text-hub-muted italic text-sm">Ожидание старта ведущим…</span>
        </div>
      </div>
    </template>

    <!-- Плавающей панели звонка тут больше нет: она накрывала нижнюю панель и дублировала
         её же кнопки микрофона и камеры. Всё нужное лобби показывает своими средствами —
         тайлы участников, статус «вы не в звонке» и устройства в нижней панели. -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { useCallInvite } from '../platform/useCallInvite'
import { useAutoVoice } from '../composables/useAutoVoice'
import CallTile from '../components/CallTile.vue'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()

// Свои устройства (тайлы участников читают состояние сами через CallTile)
const micOn = computed(() => platform.localParticipant?.micOn ?? false)
const camOn = computed(() => platform.localParticipant?.camOn ?? false)
function toggleMic() { platform.setMic(!micOn.value) }
function toggleCam() { platform.setCam(!camOn.value) }

// Ведущий не входит в players, но он в звонке и его надо видеть в сетке
const hostTile = computed(() => {
  const h = store.host
  if (!h) return null
  return { id: h.id, name: h.username || h.name || 'Ведущий', avatar: h.avatar || null,
           platformId: h.platformId || null, connected: h.connected !== false, loadedAssets: true }
})

// Свободные места показываем плитками-заглушками, но не больше разумного (сетка не должна
// превращаться в поле пустых квадратов при maxPlayers=16 и двух игроках)
const freeSeats = computed(() => Math.min(Math.max(0, store.maxPlayers - store.players.length), 4))

// На телефоне тайлы меньше, иначе в ряд влезает один
const tileMin = computed(() => (store.players.length + 1) > 6 ? 130 : 170)

// Голос — с автоповтором (см. useAutoVoice), активность и аватар — один раз по появлению host
const { retryNow } = useAutoVoice(store, platform)
const activityReported = ref(false)
watch(() => store.host, (h) => {
  if (h && !activityReported.value) {
    activityReported.value = true
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
const failedAssets = ref(0) // битые/недоступные медиа при прелоаде (⚠ в лобби)

const isHost = computed(() => store.host && store.user && store.host.id === store.user.id)
const allReady = computed(() => {
  if (store.players.length === 0) return true
  return store.players.every(p => !p.connected || p.loadedAssets)
})

// Кто в игре, но не в звонке. Имеет смысл только когда я сам в звонке — вне звонка список его
// участников пуст, и «не в голосе» показал бы вообще всех.
const voiceMissing = computed(() => {
  if (!platform.voiceConnected) return []
  return [...store.players, ...store.spectators]
    .filter(p => p.connected && p.platformId && !platform.participantFor(p.platformId))
})

function joinVoiceNow() {
  retryNow() // не ждать очередного автоповтора
}
function callToVoice() {
  platform.invitePartyToGame(store.roomCode)
}

// Ведущий досылает инвайты тем, кто вошёл в звонок уже после создания игры
useCallInvite(store, platform, isHost)
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
          // Легаси q.image нормализован миграцией в mediaSrc (server/game/packMigrate.js)
          [q.mediaSrc, q.answerMediaSrc].forEach(s => { if (s) mediaUrls.push(store.getAssetUrl(s)) })
          // Тир-лист: медиа лежит на каждом объекте отдельно, не в q.mediaSrc
          if (Array.isArray(q.items)) q.items.forEach(it => { if (it?.mediaSrc) mediaUrls.push(store.getAssetUrl(it.mediaSrc)) })
        })
      })
    })
    const uniqueUrls = [...new Set(mediaUrls.filter(Boolean))]
    if (uniqueUrls.length === 0) {
      loadProgress.value = 100; myAssetsLoaded.value = true
      if (store.socket) store.socket.emit('player:loaded', { failedCount: 0 })
      return
    }
    // Битые файлы считаем честно (отдельный счётчик), но лобби не деддочим:
    // игра стартует, игрок и ведущий видят ⚠ N — знают, что часть медиа не сыграет
    let loaded = 0
    const promises = uniqueUrls.map(url => new Promise((resolve) => {
      const isVideo = url.endsWith('.mp4') || url.endsWith('.webm')
      const isAudio = url.endsWith('.mp3') || url.endsWith('.wav')
      let el
      if (isVideo) el = document.createElement('video')
      else if (isAudio) el = document.createElement('audio')
      else el = new Image()
      const finish = (failed) => () => {
        loaded++
        if (failed) failedAssets.value++
        loadProgress.value = Math.floor((loaded / uniqueUrls.length) * 100)
        resolve()
      }
      el.onloadeddata = finish(false); el.onload = finish(false); el.onerror = finish(true)
      if (isVideo || isAudio) el.preload = 'auto'
      el.src = url
      if (el instanceof Image && el.complete) finish(false)()
    }))
    await Promise.all(promises)
    myAssetsLoaded.value = true
    if (store.socket) store.socket.emit('player:loaded', { failedCount: failedAssets.value })
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
