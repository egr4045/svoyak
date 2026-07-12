<template>
  <div class="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
    <div v-if="!store.connected" class="text-xl animate-pulse">Подключение к серверу...</div>
    
    <div v-else class="w-full max-w-4xl bg-slate-900 border border-slate-700/50 rounded-xl p-8 shadow-2xl">
      <div class="flex justify-between items-center border-b border-slate-700/50 pb-6 mb-6">
        <h2 class="text-3xl font-bold text-amber-500">Комната: <span class="bg-slate-800 px-4 py-1 rounded text-white tracking-widest">{{ store.roomCode }}</span></h2>
        <div class="flex gap-4 items-center">
          <span v-if="isHost" class="text-slate-400">Вы — Ведущий</span>
          <button @click="leaveRoom" class="text-red-400 hover:text-red-300">Выйти</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Список игроков -->
        <div>
          <h3 class="text-xl font-bold mb-4">
            Участники <span class="text-slate-400">({{ store.players.length }}/{{ store.maxPlayers }} мест)</span>
          </h3>
          <div class="space-y-3">
            <div v-for="p in store.players" :key="p.id"
                 @contextmenu="showParticipantMenu(p, $event, 'player')"
                 class="flex items-center justify-between bg-slate-800/50 p-3 rounded border transition-colors"
                 :class="speakingIds.has(p.platformId) ? 'border-emerald-500/60' : 'border-slate-700'">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center font-bold overflow-hidden border"
                     :class="speakingIds.has(p.platformId) ? 'border-emerald-400' : 'border-slate-600'">
                  <img v-if="p.avatar" :src="store.getAvatarUrl(p.avatar)" class="w-full h-full object-cover">
                  <span v-else>{{ p.name.charAt(0).toUpperCase() }}</span>
                </div>
                <span class="font-medium" :class="{'text-slate-500': !p.connected}">{{ p.name }}</span>
                <span v-if="voiceOf(p)" class="text-xs" :title="voiceOf(p).micOn ? 'В голосовом чате' : 'Микрофон выключен'">{{ voiceOf(p).micOn ? '🎙' : '🔇' }}</span>
              </div>
              <!-- Прогресс бар контента -->
              <div class="flex items-center gap-2 text-sm">
                <button v-if="isHost && p.id !== store.user.id" @click="kickPlayerMsg(p.id)" class="text-xs text-red-400 hover:text-white border border-red-500/30 px-2 py-1 rounded bg-red-900/20 hover:bg-red-600 mr-2 transition-colors">Кикнуть</button>
                <span v-if="!p.loadedAssets" class="text-yellow-500 animate-pulse">Загрузка контента...</span>
                <span v-else class="text-green-500 font-bold">Готов</span>
              </div>
            </div>
            <div v-if="store.players.length === 0" class="text-slate-500 italic">Ожидание игроков...</div>
          </div>

          <!-- Наблюдатели -->
          <div v-if="store.spectators.length || store.isSpectator" class="mt-6">
            <h3 class="text-lg font-bold mb-3 text-slate-400">👁 Наблюдатели ({{ store.spectators.length }})</h3>
            <div class="space-y-2">
              <div v-for="s in store.spectators" :key="s.id"
                   @contextmenu="showParticipantMenu(s, $event, 'spectator')"
                   class="flex items-center justify-between bg-slate-800/30 p-2.5 rounded border border-slate-700/60">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-bold overflow-hidden border border-slate-600">
                    <img v-if="s.avatar" :src="store.getAvatarUrl(s.avatar)" class="w-full h-full object-cover">
                    <span v-else>{{ s.name.charAt(0).toUpperCase() }}</span>
                  </div>
                  <span class="text-sm" :class="{'text-slate-500': !s.connected}">{{ s.name }}</span>
                  <span v-if="voiceOf(s)" class="text-xs">{{ voiceOf(s).micOn ? '🎙' : '🔇' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button v-if="s.id === store.user?.id" @click="store.takeSeat()"
                          :disabled="store.seatsFree === 0"
                          class="text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors"
                          :class="store.seatsFree > 0
                            ? 'text-emerald-400 border-emerald-500/40 bg-emerald-900/20 hover:bg-emerald-600 hover:text-white'
                            : 'text-slate-600 border-slate-700 cursor-not-allowed'">
                    {{ store.seatsFree > 0 ? '🎮 Занять место' : 'Мест нет' }}
                  </button>
                  <button v-else-if="isHost" @click="store.promoteSpectator(s.id)"
                          :disabled="store.seatsFree === 0"
                          class="text-xs text-indigo-400 hover:text-white border border-indigo-500/30 px-2 py-1 rounded bg-indigo-900/20 hover:bg-indigo-600 transition-colors"
                          :class="{ 'opacity-40 cursor-not-allowed': store.seatsFree === 0 }">В игроки</button>
                </div>
              </div>
            </div>
            <p v-if="store.isSpectator" class="text-xs text-slate-500 italic mt-3">
              Вы наблюдатель: видите игру и участвуете в голосовом чате, но не отвечаете на вопросы.
            </p>
          </div>
        </div>

          <!-- Настройки (только для игрока или настройка контента) -->
          <div class="bg-slate-800 rounded-lg p-6 border border-slate-700 flex flex-col justify-between">
            <div>
              <h3 class="text-xl font-bold mb-4">Ваш профиль</h3>
              <div class="flex items-center gap-4 mb-4">
                <div class="w-20 h-20 bg-slate-900 rounded-2xl border-2 border-slate-700 relative group overflow-hidden cursor-pointer" @click="$refs.avatarInput.click()">
                  <img v-if="myAvatar" :src="store.getAvatarUrl(myAvatar)" class="w-full h-full object-cover">
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <MonitorPlay class="w-8 h-8 text-slate-600" />
                  </div>
                  <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <Upload class="w-6 h-6 text-white" />
                  </div>
                </div>
                <div class="flex flex-col">
                  <span class="text-slate-400 text-sm uppercase font-black tracking-widest mb-1">Никнейм</span>
                  <b class="text-xl text-white underline decoration-blue-500 decoration-2 underline-offset-4">{{ store.user?.username }}</b>
                  <input type="file" ref="avatarInput" class="hidden" accept="image/*" @change="handleAvatarUpload">
                  <button @click="$refs.avatarInput.click()" class="text-xs text-blue-400 hover:text-white mt-2 flex items-center gap-1 transition-colors">
                    <PlusCircle class="w-3 h-3" /> Изменить фото
                  </button>
                </div>
              </div>
              <Transition name="fade">
                <p v-if="avatarError" class="text-rose-500 text-[10px] font-bold bg-rose-500/10 p-2 rounded border border-rose-500/20 mb-4">
                  🚨 {{ avatarError }}
                </p>
              </Transition>
              <p class="text-slate-500 text-xs italic mb-8">* Аватарка хранится только одну сессию (макс. 2МБ)</p>
                 
              <!-- Предзагрузка контента -->
              <div v-if="!myAssetsLoaded" class="w-full bg-slate-900 rounded-full h-4 mb-2 overflow-hidden relative">
                <div class="bg-blue-600 h-4 transition-all duration-300" :style="{ width: loadProgress + '%' }"></div>
              </div>
              <p v-if="!myAssetsLoaded" class="text-sm text-slate-400">Загрузка ресурсов игры... {{ loadProgress }}%</p>
              <p v-else class="text-sm text-green-400 font-bold">Ресурсы загружены!</p>
            </div>

            <div class="mt-8">
              <button v-if="isHost" @click="startGame" :disabled="!allReady" class="w-full py-4 rounded-lg font-bold text-lg uppercase tracking-wide transition-all" :class="allReady ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'">
                {{ allReady ? 'Начать игру' : 'Ожидание загрузки игроков...' }}
              </button>
              <div v-else class="text-center text-slate-400 italic bg-black/20 p-4 rounded-lg border border-slate-700">
                Ожидание старта игры ведущим...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <VoiceBar />
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { showParticipantMenu } from '../platform/contextMenu'
import VoiceBar from '../components/VoiceBar.vue'
import { MonitorPlay, Upload, PlusCircle } from 'lucide-vue-next'

const store = useGameStore()
const platform = usePlatformStore()
const router = useRouter()
const route = useRoute()

// Кто сейчас говорит (по платформенным accountId)
const speakingIds = computed(() => {
  const set = new Set()
  platform.voice.participants.forEach(p => { if (p.speaking) set.add(p.accountId) })
  return set
})

function voiceOf(p) {
  return p?.platformId ? platform.participantFor(p.platformId) : null
}

// Голос и активность — только ПОСЛЕ первого gameStateUpdated (host появился):
// членство в комнате подтверждено сервером, а isSpectator уже отражает реальную роль
// (важно при F5 и при ?spectate=1). Оба вызова — no-op без SDK/платформенной сессии.
const voiceJoined = ref(false)
watch(() => store.host, (h) => {
  if (h && !voiceJoined.value) {
    voiceJoined.value = true
    platform.joinVoice(store.roomCode, { spectator: store.isSpectator })
    platform.setActivity(store.roomCode)
  }
}, { immediate: true })

const myAssetsLoaded = ref(false)
const loadProgress = ref(0) // Имитация прогресса
const avatarError = ref('')

const isHost = computed(() => store.host && store.user && store.host.id === store.user.id)
const allReady = computed(() => {
  if (store.players.length === 0) return true; // Ведущий может начать и с 0 игроков (или лучше false?) 
  return store.players.every(p => !p.connected || p.loadedAssets);
})

const myAvatar = computed(() => {
  const me = store.players.find(p => p.id === store.user?.id);
  return me?.avatar || null;
});

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  avatarError.value = '';
  try {
    await store.uploadAvatar(file);
  } catch (err) {
    avatarError.value = err.message;
    // Через 5 секунд убираем ошибку
    setTimeout(() => { avatarError.value = '' }, 5000);
  }
}

onMounted(() => {
  if (!store.roomCode) {
    store.roomCode = route.params.id;
  }
  store.initSocket();

  watch(() => store.roundsData, async (data) => {
    if (!data || data.length === 0 || loadProgress.value === 100) return;

    const mediaUrls = [];
    data.forEach(round => {
      if(round.categories) round.categories.forEach(cat => {
        cat.questions.forEach(q => {
          if (q.media) mediaUrls.push(q.media);
          if (q.answerMedia) mediaUrls.push(q.answerMedia);
        });
      });
    });

    const uniqueUrls = [...new Set(mediaUrls.filter(Boolean))];

    if (uniqueUrls.length === 0) {
      loadProgress.value = 100;
      myAssetsLoaded.value = true;
      if (store.socket) store.socket.emit('player:loaded');
      return;
    }

    let loaded = 0;
    const promises = uniqueUrls.map(url => {
      return new Promise((resolve) => {
        const isVideo = url.endsWith('.mp4') || url.endsWith('.webm');
        const isAudio = url.endsWith('.mp3') || url.endsWith('.wav');
        let el;
        if (isVideo) el = document.createElement('video');
        else if (isAudio) el = document.createElement('audio');
        else el = new Image();
        
        const finish = () => {
          loaded++;
          loadProgress.value = Math.floor((loaded / uniqueUrls.length) * 100);
          resolve();
        };
        
        el.onloadeddata = finish; el.onload = finish; el.onerror = finish;
        if (isVideo || isAudio) el.preload = "auto";
        el.src = url;
        if (el instanceof Image && el.complete) finish();
      });
    });

    await Promise.all(promises);
    myAssetsLoaded.value = true;
    if (store.socket) store.socket.emit('player:loaded');
  }, { immediate: true, deep: true });

})

watch(() => store.gameStarted, (started) => {
  if (started) {
    router.push({ name: 'game', params: { id: store.roomCode } })
  }
}, { immediate: true })

watch(() => store.connected, (conn) => {
  if (conn && myAssetsLoaded.value && store.socket) {
    store.socket.emit('player:loaded');
  }
})

function leaveRoom() {
  store.logout();
  router.push({ name: 'home' });
}

function kickPlayerMsg(playerId) {
  if (confirm("Точно кикнуть этого игрока из лобби?")) {
    store.kickPlayer(playerId);
  }
}

function startGame() {
  if (isHost.value && (allReady.value || store.players.length === 0)) {
    store.socket.emit('room:start');
  }
}
</script>
