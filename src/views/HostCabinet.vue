<template>
  <div class="h-screen w-full overflow-y-auto p-6 md:p-10">
    <div class="max-w-4xl mx-auto">
      <header class="flex items-center justify-between mb-10">
        <h1 class="text-3xl font-black tracking-wider uppercase text-hub-accent">Кабинет ведущего</h1>
        <div v-if="platform.me" class="text-right">
          <div class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Ваш ID</div>
          <button @click="copyId" class="font-mono text-sm text-hub-text hover:text-white" :title="platform.me.accountId">
            {{ shortId }} 📋
          </button>
        </div>
      </header>

      <!-- Создать игру -->
      <section class="panel-glass p-8 mb-8">
        <h2 class="text-xl font-bold mb-6">Создать игру</h2>
        <div class="flex flex-col md:flex-row md:items-end gap-4">
          <label class="flex flex-col gap-2">
            <span class="text-xs uppercase tracking-widest text-hub-muted font-black">Пак вопросов</span>
            <select v-model="selectedPack" class="hub-input font-bold min-w-[220px]">
              <option value="">Встроенный пак</option>
              <option v-for="p in packs.packs" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-2">
            <span class="text-xs uppercase tracking-widest text-hub-muted font-black">Мест для игроков</span>
            <select v-model.number="maxPlayers" class="hub-input font-bold">
              <option v-for="n in [4, 6, 8, 10, 12, 16]" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <button @click="createGame" :disabled="creating" class="hub-btn-primary flex-1 py-3 uppercase tracking-widest disabled:opacity-50">
            {{ creating ? 'Создаём…' : '🧠 Создать игру' }}
          </button>
        </div>
        <p v-if="error" class="text-hub-negative text-sm font-bold mt-4">{{ error }}</p>
        <p class="text-hub-muted text-xs mt-4">Кто не поместится — станет наблюдателем. Друзей позовёте через виджет друзей внизу справа после создания комнаты.</p>
      </section>

      <!-- Мои паки -->
      <section class="panel-glass p-8">
        <div class="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h2 class="text-xl font-bold">Мои паки вопросов</h2>
          <div class="flex gap-2">
            <label class="hub-btn text-sm cursor-pointer">
              ⬆ Импорт ZIP
              <input type="file" class="hidden" accept=".zip" @change="onImport" />
            </label>
            <button @click="newPack" class="hub-btn-primary text-sm">+ Новый пак</button>
          </div>
        </div>

        <div v-if="!packs.packs.length" class="text-hub-muted text-sm">Пока паков нет. Создайте новый или импортируйте ZIP.</div>
        <div v-else class="space-y-2">
          <div v-for="p in packs.packs" :key="p.id" class="hub-card px-4 py-3 flex items-center gap-3 flex-wrap">
            <span class="font-bold flex-1 min-w-[140px]">{{ p.name }}</span>
            <span class="text-[11px] text-hub-muted">хранится до {{ formatExpiry(p.expiresAt) }}</span>
            <button @click="editPack(p.id)" class="hub-btn text-xs">✏ Изменить</button>
            <button @click="remixPack(p)" class="hub-btn text-xs" title="Дублировать пак целиком, с медиа">⧉ Ремикс</button>
            <button @click="packs.exportPack(p.id, p.name)" class="hub-btn text-xs">⬇ ZIP</button>
            <button @click="removePack(p)" class="hub-btn text-xs !text-hub-negative">{{ pendingDelete === p.id ? 'Точно?' : '🗑' }}</button>
          </div>
        </div>
      </section>
    </div>

    <PackEditor v-if="editingId" :pack-id="editingId" @close="editingId = null" @saved="packs.fetchPacks()" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import { usePacksStore } from '../stores/packs'
import PackEditor from '../components/pack/PackEditor.vue'

const store = useGameStore()
const platform = usePlatformStore()
const packs = usePacksStore()
const router = useRouter()

const maxPlayers = ref(8)
const selectedPack = ref('')
const creating = ref(false)
const error = ref('')
const editingId = ref(null)

const shortId = computed(() => platform.me?.accountId ? platform.me.accountId.slice(0, 8) : '')

onMounted(() => packs.fetchPacks())

function copyId() {
  if (platform.me?.accountId) {
    navigator.clipboard?.writeText(platform.me.accountId)
    platform.toast('ID скопирован')
  }
}

function formatExpiry(ts) {
  try { return new Date(ts).toLocaleDateString('ru-RU') } catch { return '' }
}

async function createGame() {
  creating.value = true
  error.value = ''
  try {
    const code = await store.createRoom(maxPlayers.value, selectedPack.value || undefined)
    router.push({ name: 'lobby', params: { id: code } })
  } catch (e) {
    error.value = e.message || 'Не удалось создать игру'
  } finally {
    creating.value = false
  }
}

async function newPack() {
  try {
    const pack = await packs.createPack('Новый пак', { rounds: [] })
    editingId.value = pack.id
  } catch (e) { error.value = e.message }
}

function editPack(id) { editingId.value = id }

async function remixPack(p) {
  try {
    const copy = await packs.duplicatePack(p.id)
    platform.toast(`Создана копия «${copy.name}»`)
  } catch (e) { error.value = e.message }
}

// Двухкликовое подтверждение вместо нативного confirm
const pendingDelete = ref(null)
let pendingTimer = null
async function removePack(p) {
  if (pendingDelete.value !== p.id) {
    pendingDelete.value = p.id
    clearTimeout(pendingTimer)
    pendingTimer = setTimeout(() => { pendingDelete.value = null }, 3000)
    return
  }
  pendingDelete.value = null
  try { await packs.deletePack(p.id) } catch (e) { error.value = e.message }
}

async function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    await packs.importPack(file)
    platform.toast('Пак импортирован')
  } catch (err) { error.value = err.message }
  e.target.value = ''
}
</script>
