<template>
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
    <div class="panel-glass w-full max-w-6xl my-6 p-6">
      <!-- Шапка редактора -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <input v-model="local.name" class="hub-input flex-1 min-w-[200px] text-lg font-bold" placeholder="Название пака" />
        <button @click="save" :disabled="saving" class="hub-btn-primary text-sm disabled:opacity-50">{{ saving ? 'Сохраняем…' : '💾 Сохранить' }}</button>
        <button @click="exportPack" class="hub-btn text-sm">⬇ ZIP</button>
        <button @click="$emit('close')" class="hub-btn text-sm">✕ Закрыть</button>
      </div>
      <p v-if="msg" class="text-sm font-bold mb-3" :class="msgErr ? 'text-hub-negative' : 'text-hub-positive'">{{ msg }}</p>

      <!-- Вкладки раундов -->
      <div class="flex items-center gap-1 border-b border-hub-border mb-5 flex-wrap">
        <button v-for="(round, ri) in local.data.rounds" :key="ri"
                @click="activeRound = ri"
                @contextmenu="roundMenu(ri, $event)"
                class="px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors"
                :class="activeRound === ri ? 'border-hub-accent text-hub-accent' : 'border-transparent text-hub-muted hover:text-hub-text'">
          {{ round.name || `Раунд ${ri + 1}` }}
        </button>
        <button @click="addRound" class="px-3 py-2 text-sm font-bold text-hub-muted hover:text-hub-accent">+ Раунд</button>
      </div>

      <!-- Активный раунд как игровая сетка -->
      <template v-if="round">
        <div class="flex items-center gap-2 mb-4">
          <input v-model="round.name" class="hub-input flex-1 font-bold" placeholder="Название раунда" />
          <button @click="removeRound(activeRound)" class="hub-btn text-xs !text-hub-negative">Удалить раунд</button>
        </div>

        <!-- Строки-категории с ячейками-вопросами -->
        <div class="space-y-2 mb-3">
          <div v-for="(cat, ci) in round.categories" :key="ci" class="flex items-stretch gap-2">
            <!-- Заголовок категории (как в игре: акцентная левая грань) -->
            <div class="w-44 shrink-0 bg-gradient-to-r from-hub-deep to-hub-solid border-l-4 border-hub-accent rounded-r-lg p-2 flex flex-col justify-between"
                 @contextmenu="catMenu(round, ci, $event)">
              <input v-model="cat.category" class="bg-transparent outline-none text-sm font-black text-hub-text w-full" placeholder="Категория" />
              <button @click="removeCategory(round, ci)" class="text-[10px] text-hub-negative hover:brightness-125 self-start mt-1">✕ строку</button>
            </div>

            <!-- Ячейки-вопросы -->
            <div class="flex gap-2 flex-wrap items-stretch">
              <button v-for="(q, qi) in cat.questions" :key="qi"
                      @click="openQuestion(cat, qi)"
                      @contextmenu="cellMenu(cat, qi, $event)"
                      class="w-24 h-[68px] rounded-lg border flex flex-col items-center justify-center transition-all hover:scale-[1.03] relative"
                      :class="isBlank(q) ? 'border-dashed border-hub-warning/50 bg-hub-warning/5' : 'border-hub-border bg-hub-deep/60 hover:border-hub-accent'">
                <span class="text-xl font-black" :style="{ color: 'var(--c-accent)' }">{{ q.points }}</span>
                <span class="text-[9px] font-bold uppercase tracking-wide mt-0.5" :style="{ color: TYPE_META[q.type]?.tone }">{{ TYPE_META[q.type]?.short }}</span>
                <span v-if="q.mediaSrc" class="absolute top-1 right-1 text-[9px]">📎</span>
                <span v-if="isBlank(q)" class="absolute top-1 left-1 text-[9px]" title="Не заполнен">⚠</span>
              </button>
              <!-- Добавить ячейку -->
              <button @click="addQuestion(cat)" class="w-24 h-[68px] rounded-lg border border-dashed border-hub-border text-hub-muted hover:text-hub-accent hover:border-hub-accent text-2xl font-thin">+</button>
            </div>
          </div>
        </div>

        <button @click="addCategory(round)" class="hub-btn text-sm">+ Строка (категория)</button>
      </template>

      <div v-else class="text-hub-muted text-sm py-10 text-center">Добавьте раунд, чтобы начать.</div>

      <p class="text-hub-muted text-xs mt-6">Паки хранятся 30 дней. Чтобы не потерять — выгрузите ZIP (в нём и медиа) и при необходимости загрузите обратно.</p>
    </div>

    <!-- Редактор одного вопроса -->
    <div v-if="editing" class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" @click.self="editing = null">
      <div class="panel-glass w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-black text-hub-accent">Вопрос за {{ editQ.points }}</h3>
          <button @click="editing = null" class="hub-btn text-xs">Готово</button>
        </div>
        <div class="flex flex-col gap-3">
          <div class="flex gap-2">
            <label class="flex-1">
              <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Тип</span>
              <select v-model="editQ.type" class="hub-input text-sm w-full mt-1">
                <option v-for="t in TYPES" :key="t" :value="t">{{ TYPE_META[t].l }}</option>
              </select>
            </label>
            <label class="w-28">
              <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Очки</span>
              <input v-model.number="editQ.points" type="number" class="hub-input text-sm w-full mt-1" />
            </label>
          </div>
          <textarea v-model="editQ.q" rows="3" class="hub-input text-sm w-full" placeholder="Текст вопроса"></textarea>
          <input v-model="editQ.a" class="hub-input text-sm w-full" placeholder="Ответ" />

          <div v-if="editQ.type === 'media'" class="flex items-center gap-2 flex-wrap">
            <label class="hub-btn text-xs cursor-pointer">
              {{ editQ.mediaSrc ? '🔁 Заменить медиа' : '📎 Загрузить медиа' }}
              <input type="file" class="hidden" accept="image/*,audio/*,video/*" @change="onMedia($event, editQ)" />
            </label>
            <span v-if="editQ.mediaSrc" class="text-xs text-hub-positive">✓ {{ editQ.mediaType }} прикреплён</span>
          </div>

          <button @click="deleteQuestion" class="hub-btn text-xs !text-hub-negative self-start mt-2">🗑 Удалить вопрос</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { usePacksStore } from '../../stores/packs'
import { getPlatform } from '../../platform/sdk'

const props = defineProps({ packId: { type: String, required: true } })
const emit = defineEmits(['close', 'saved'])
const packs = usePacksStore()

// Метаданные типов: полное имя, короткий бейдж для ячейки, цвет
const TYPE_META = {
  text:       { l: 'Обычный (баззер)',          short: 'Баззер',  tone: '#9aa9bd' },
  media:      { l: 'Медиа (фото/аудио/видео)',   short: 'Медиа',   tone: '#3da9fc' },
  text_input: { l: 'Письменный ответ',           short: 'Текст',   tone: '#8f7cf0' },
  glitch:     { l: 'Глитч',                       short: 'Глитч',   tone: '#b07bff' },
  cat:        { l: 'Кот в мешке',                 short: 'Кот',     tone: '#e8a13a' },
  among_us:   { l: 'Шпион (Amongus)',             short: 'Шпион',   tone: '#e0524a' },
  poker:      { l: 'Покер',                       short: 'Покер',   tone: '#d96c3b' },
  auction:    { l: 'Аукцион',                     short: 'Аукцион', tone: '#e8c24a' },
  sketch:     { l: 'Рисование',                   short: 'Рисунок', tone: '#49a05a' },
}
const TYPES = Object.keys(TYPE_META)

const local = reactive({ name: '', data: { rounds: [] } })
const activeRound = ref(0)
const editing = ref(null) // { cat, qi }
const saving = ref(false)
const msg = ref(''); const msgErr = ref(false)

const round = computed(() => local.data.rounds[activeRound.value] || null)
const editQ = computed(() => editing.value ? editing.value.cat.questions[editing.value.qi] : {})

function flash(text, err = false) { msg.value = text; msgErr.value = err; setTimeout(() => (msg.value = ''), 4000) }
function isBlank(q) { return !q.q?.trim() || (q.type !== 'sketch' && q.type !== 'media' && !q.a?.trim()) }

onMounted(async () => {
  try {
    const pack = await packs.getPack(props.packId)
    local.name = pack.name
    local.data = pack.data && Array.isArray(pack.data.rounds) ? pack.data : { rounds: [] }
  } catch (e) { flash(e.message, true) }
})

function addRound() {
  local.data.rounds.push({ name: `Раунд ${local.data.rounds.length + 1}`, categories: [] })
  activeRound.value = local.data.rounds.length - 1
}
function removeRound(ri) {
  local.data.rounds.splice(ri, 1)
  activeRound.value = Math.max(0, Math.min(activeRound.value, local.data.rounds.length - 1))
}
function addCategory(r) { r.categories.push({ category: 'Новая категория', questions: [] }) }
function removeCategory(r, ci) { r.categories.splice(ci, 1) }
function addQuestion(cat) {
  const points = (cat.questions.length + 1) * 100
  const q = { points, type: 'text', q: '', a: '' }
  cat.questions.push(q)
  openQuestion(cat, cat.questions.length - 1)
}
function openQuestion(cat, qi) { editing.value = { cat, qi } }
function deleteQuestion() {
  editing.value.cat.questions.splice(editing.value.qi, 1)
  editing.value = null
}

// --- Дублирование ---
const clone = (o) => JSON.parse(JSON.stringify(o))
function duplicateQuestion(cat, qi) {
  const copy = clone(cat.questions[qi]); delete copy.mediaSrc; delete copy.mediaType // медиа не копируем (файл один)
  cat.questions.splice(qi + 1, 0, copy)
}
function duplicateCategory(r, ci) { r.categories.splice(ci + 1, 0, clone(r.categories[ci])) }
function duplicateRound(ri) {
  const copy = clone(local.data.rounds[ri]); copy.name = (copy.name || `Раунд ${ri + 1}`) + ' (копия)'
  local.data.rounds.splice(ri + 1, 0, copy); activeRound.value = ri + 1
}

// --- ПКМ-меню (SDK). Без window.mygame — отдаём браузеру родное меню ---
function openMenu(e, items) {
  const platform = getPlatform()
  if (!platform?.ui?.showContextMenu || !items.length) return
  e.preventDefault()
  platform.ui.showContextMenu({ x: e.clientX, y: e.clientY, items })
}
function cellMenu(cat, qi, e) {
  openMenu(e, [
    { label: '✏ Редактировать', action: () => openQuestion(cat, qi) },
    { label: '⧉ Дублировать', action: () => duplicateQuestion(cat, qi) },
    { label: '🗑 Удалить', danger: true, action: () => cat.questions.splice(qi, 1) },
  ])
}
function catMenu(r, ci, e) {
  openMenu(e, [
    { label: '⧉ Дублировать строку', action: () => duplicateCategory(r, ci) },
    { label: '➕ Добавить вопрос', action: () => addQuestion(r.categories[ci]) },
    { separator: true, action: () => {} },
    { label: '🗑 Удалить строку', danger: true, action: () => removeCategory(r, ci) },
  ])
}
function roundMenu(ri, e) {
  openMenu(e, [
    { label: '⧉ Дублировать раунд', action: () => duplicateRound(ri) },
    { label: '➕ Добавить категорию', action: () => { activeRound.value = ri; addCategory(local.data.rounds[ri]) } },
    { separator: true, action: () => {} },
    { label: '🗑 Удалить раунд', danger: true, action: () => removeRound(ri) },
  ])
}

async function onMedia(e, q) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej; r.onload = () => res(r.result); r.readAsDataURL(file)
    })
    const url = await packs.uploadMedia(props.packId, dataUrl)
    q.mediaSrc = url
    q.mediaType = file.type.startsWith('image') ? 'image' : file.type.startsWith('audio') ? 'audio' : 'video'
    flash('Медиа загружено')
  } catch (err) { flash(err.message, true) }
  e.target.value = ''
}

async function save() {
  saving.value = true
  try {
    await packs.updatePack(props.packId, local.name || 'Без названия', { rounds: local.data.rounds })
    flash('Сохранено')
    emit('saved')
  } catch (e) { flash(e.message, true) }
  finally { saving.value = false }
}

async function exportPack() {
  try { await packs.exportPack(props.packId, local.name) }
  catch (e) { flash(e.message, true) }
}
</script>
