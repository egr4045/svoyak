<template>
  <div class="h-screen w-full flex items-center justify-center bg-slate-950 text-slate-200 p-4 relative overflow-hidden">
    
    <!-- Переключатель роли -->
    <div class="absolute top-6 left-1/2 -translate-x-1/2 flex bg-slate-900 border border-slate-700/50 rounded-xl p-1 z-20 shadow-lg" v-if="!store.token">
      <button @click="activeTab = 'player'" :class="activeTab === 'player' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'" class="px-6 py-2 rounded-lg font-bold transition-all text-sm tracking-widest">Я ИГРОК</button>
      <button @click="activeTab = 'host'" :class="activeTab === 'host' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'" class="px-6 py-2 rounded-lg font-bold transition-all text-sm tracking-widest">Я ВЕДУЩИЙ</button>
    </div>

    <div class="bg-slate-900 border border-slate-700/50 p-8 rounded-3xl shadow-2xl max-w-md w-full relative z-10 transition-colors duration-500" :class="activeTab === 'host' ? 'shadow-[0_0_40px_rgba(245,158,11,0.1)] border-t-amber-500/50' : 'shadow-[0_0_40px_rgba(37,99,235,0.1)] border-t-blue-500/50'">
      <h1 class="text-3xl font-black mb-8 text-center tracking-wider uppercase transition-colors duration-500" :class="activeTab === 'host' ? 'text-amber-500' : 'text-blue-500'">Своя Игра</h1>

      <!-- PLAYER TAB (Подключение по никнейму) -->
      <div v-if="activeTab === 'player'" class="space-y-6 animate-in fade-in duration-500">
        <div v-if="!store.user">
          <input v-model="username" type="text" placeholder="Ваш Игровой Никнейм" class="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold text-lg mb-4" />
          <input v-model="roomCode" type="text" placeholder="Код Команды (XXXX)" maxlength="4" class="w-full px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-center font-mono tracking-widest text-2xl mb-4" />
          <p v-if="error" class="text-rose-400 text-sm text-center mb-4 font-bold">{{ error }}</p>
          <button @click="playerJoin" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl transition shadow-[0_0_15px_rgba(37,99,235,0.4)] text-lg tracking-wide hover:scale-[1.02]">ВОРВАТЬСЯ В ИГРУ</button>
        </div>
        <div v-else class="text-center">
          <p class="text-slate-400 mb-6 font-medium">Вы вошли как <span class="text-white font-bold text-xl px-2">{{ store.user.username }}</span></p>
          <input v-model="roomCode" type="text" placeholder="КОД (XXXX)" maxlength="4" class="w-full uppercase text-center text-3xl tracking-widest px-4 py-4 bg-slate-800 border border-slate-700 rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-600" />
          <p v-if="roomError" class="text-rose-400 text-sm text-center mb-4 font-bold">{{ roomError }}</p>
          <button @click="joinRoomOnly" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition shadow-[0_0_15px_rgba(16,185,129,0.4)] text-lg tracking-wide mb-6 hover:scale-[1.02]">Присоединиться</button>
          <button @click="store.logout" class="text-sm text-slate-500 hover:text-rose-400 font-bold border-b border-transparent hover:border-rose-400 transition-colors">Сменить аккаунт</button>
        </div>
      </div>

      <!-- HOST TAB (Регистрация / Создание игры) -->
      <div v-if="activeTab === 'host'" class="space-y-6 animate-in fade-in duration-500">
        <div v-if="!store.user || store.user.isGuest" class="space-y-4">
          <h2 class="text-xs text-amber-500/70 text-center uppercase tracking-widest mb-4 font-black">Для создания игры</h2>
          <input v-model="username" type="text" placeholder="Логин ведущего" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center font-bold text-white" />
          <input v-model="password" type="password" placeholder="Пароль" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-center text-white" />
          <p v-if="error" class="text-rose-400 text-sm text-center font-bold">{{ error }}</p>
          <div class="flex gap-4 pt-2">
            <button @click="login" class="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition shadow-lg">Войти</button>
            <button @click="register" class="flex-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-white font-bold py-3 rounded-xl transition">Зарегистрировать</button>
          </div>
        </div>

        <div v-else class="space-y-6">
          <div class="text-center">
            <p class="text-slate-400 mb-2 font-medium">Аккаунт: <span class="text-amber-400 font-black text-xl px-2">{{ store.user.username }}</span></p>
            <button @click="store.logout" class="text-sm text-slate-500 hover:text-rose-400 border-b border-transparent hover:border-rose-400 transition-colors font-bold">Выйти из аккаунта</button>
          </div>
          <div class="border-t border-slate-700/50 pt-6">
            <p v-if="roomError" class="text-rose-400 text-sm text-center mb-4 font-bold">{{ roomError }}</p>
            <button @click="createRoom" class="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black py-4 rounded-xl transition uppercase tracking-widest shadow-[0_0_20px_rgba(217,119,6,0.4)] hover:scale-[1.02]">
              🎯 Создать Игру
            </button>
            <div class="mt-8 relative">
              <div class="absolute inset-0 flex items-center" aria-hidden="true"><div class="w-full border-t border-slate-700"></div></div>
              <div class="relative flex justify-center"><span class="bg-slate-900 px-3 text-xs text-slate-500 uppercase font-bold tracking-widest">Или подключиться</span></div>
            </div>
            <div class="mt-6 flex flex-col gap-3">
              <input v-model="roomCode" type="text" placeholder="КОД (XXXX)" maxlength="4" class="w-full uppercase text-center text-xl tracking-widest px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-300 placeholder:text-slate-600" />
              <button @click="joinRoomOnly" class="w-full bg-slate-800 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 text-white font-bold py-3 rounded-xl transition shadow-md">Переподключиться</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'

const store = useGameStore()
const router = useRouter()

const activeTab = ref('player') // 'player' | 'host'
const username = ref('')
const password = ref('')
const roomCode = ref('')
const error = ref('')
const roomError = ref('')

onMounted(() => {
  if (store.user && !store.user.isGuest) {
    activeTab.value = 'host'
  }
})

// Очистка ошибок при смене вкладок
watch(activeTab, () => {
  error.value = ''
  roomError.value = ''
  username.value = ''
  password.value = ''
  roomCode.value = ''
})

// Player Logic
async function playerJoin() {
  if (!username.value.trim()) {
    error.value = 'Введите никнейм'; return;
  }
  if (roomCode.value.length < 4) {
    error.value = 'Введите 4-значный код комнаты'; return;
  }
  try {
    error.value = ''; roomError.value = '';
    await store.guestLogin(username.value.trim());
    await joinRoomOnly();
  } catch(e) { error.value = e.message || 'Ошибка входа' }
}

async function joinRoomOnly() {
  if (roomCode.value.length < 4) { roomError.value = 'Код должен содержать 4 символа'; return; }
  try {
    roomError.value = ''
    await store.checkRoom(roomCode.value.toUpperCase())
    router.push({ name: 'lobby', params: { id: store.roomCode } })
  } catch(e) { roomError.value = e.message || 'Комната не найдена' }
}

// Host Logic
async function login() {
  if (!username.value || !password.value) { error.value = 'Заполните все поля'; return; }
  try {
    error.value = ''
    await store.login(username.value, password.value)
  } catch(e) { error.value = e.message || 'Ошибка входа' }
}

async function register() {
  if (!username.value || !password.value) { error.value = 'Заполните все поля'; return; }
  try {
    error.value = ''
    await store.register(username.value, password.value)
  } catch(e) { error.value = e.message || 'Ошибка регистрации' }
}

async function createRoom() {
  try {
    roomError.value = ''
    const code = await store.createRoom()
    router.push({ name: 'lobby', params: { id: code } })
  } catch(e) { roomError.value = e.message || 'Error creating room' }
}
</script>
