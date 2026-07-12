<template>
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
    <div class="panel-glass w-full max-w-5xl my-6 p-6">
      <!-- Шапка редактора -->
      <div class="flex items-center gap-3 mb-6 flex-wrap">
        <input v-model="local.name" class="hub-input flex-1 min-w-[200px] text-lg font-bold" placeholder="Название пака" />
        <button @click="save" :disabled="saving" class="hub-btn-primary text-sm disabled:opacity-50">{{ saving ? 'Сохраняем…' : '💾 Сохранить' }}</button>
        <button @click="exportPack" class="hub-btn text-sm">⬇ Выгрузить ZIP</button>
        <button @click="$emit('close')" class="hub-btn text-sm">✕ Закрыть</button>
      </div>
      <p v-if="msg" class="text-sm font-bold mb-4" :class="msgErr ? 'text-hub-negative' : 'text-hub-positive'">{{ msg }}</p>
      <p class="text-hub-muted text-xs mb-6">Паки хранятся 30 дней. Чтобы не потерять — выгрузите ZIP (в нём и медиа) и при необходимости загрузите обратно.</p>

      <!-- Раунды -->
      <div v-for="(round, ri) in local.data.rounds" :key="ri" class="hub-card p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Раунд {{ ri + 1 }}</span>
          <input v-model="round.name" class="hub-input flex-1 font-bold" placeholder="Название раунда" />
          <button @click="removeRound(ri)" class="hub-btn text-xs !text-hub-negative">Удалить раунд</button>
        </div>

        <!-- Категории -->
        <div v-for="(cat, ci) in round.categories" :key="ci" class="border border-hub-border rounded-lg p-3 mb-3">
          <div class="flex items-center gap-2 mb-2">
            <input v-model="cat.category" class="hub-input flex-1 font-bold" placeholder="Категория" />
            <button @click="removeCategory(round, ci)" class="hub-btn text-xs !text-hub-negative">✕</button>
          </div>

          <!-- Вопросы -->
          <div v-for="(q, qi) in cat.questions" :key="qi" class="bg-hub-deep/60 rounded-lg p-3 mb-2 flex flex-col gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <select v-model="q.type" class="hub-input text-sm">
                <option v-for="t in TYPES" :key="t.v" :value="t.v">{{ t.l }}</option>
              </select>
              <input v-model.number="q.points" type="number" class="hub-input w-24 text-sm" placeholder="Очки" />
              <button @click="cat.questions.splice(qi, 1)" class="hub-btn text-xs !text-hub-negative ml-auto">Удалить</button>
            </div>
            <textarea v-model="q.q" rows="2" class="hub-input text-sm w-full" placeholder="Текст вопроса"></textarea>
            <input v-model="q.a" class="hub-input text-sm w-full" placeholder="Ответ" />

            <!-- Медиа для типа media -->
            <div v-if="q.type === 'media'" class="flex items-center gap-2 flex-wrap">
              <label class="hub-btn text-xs cursor-pointer">
                {{ q.mediaSrc ? '🔁 Заменить медиа' : '📎 Загрузить медиа' }}
                <input type="file" class="hidden" accept="image/*,audio/*,video/*" @change="onMedia($event, q)" />
              </label>
              <span v-if="q.mediaSrc" class="text-xs text-hub-positive">✓ {{ q.mediaType }} прикреплён</span>
            </div>
          </div>

          <button @click="addQuestion(cat)" class="hub-btn text-xs w-full mt-1">+ Вопрос</button>
        </div>

        <button @click="addCategory(round)" class="hub-btn text-sm">+ Категория</button>
      </div>

      <button @click="addRound" class="hub-btn-primary text-sm">+ Раунд</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { usePacksStore } from '../../stores/packs'

const props = defineProps({ packId: { type: String, required: true } })
const emit = defineEmits(['close', 'saved'])
const packs = usePacksStore()

const TYPES = [
  { v: 'text', l: 'Обычный (баззер)' },
  { v: 'media', l: 'Медиа (фото/аудио/видео)' },
  { v: 'text_input', l: 'Письменный ответ' },
  { v: 'glitch', l: 'Глитч' },
  { v: 'cat', l: 'Кот в мешке' },
  { v: 'among_us', l: 'Шпион (Amongus)' },
  { v: 'poker', l: 'Покер' },
  { v: 'auction', l: 'Аукцион' },
  { v: 'sketch', l: 'Рисование' },
]

const local = reactive({ name: '', data: { rounds: [] } })
const saving = ref(false)
const msg = ref(''); const msgErr = ref(false)

function flash(text, err = false) { msg.value = text; msgErr.value = err; setTimeout(() => (msg.value = ''), 4000) }

onMounted(async () => {
  try {
    const pack = await packs.getPack(props.packId)
    local.name = pack.name
    local.data = pack.data && Array.isArray(pack.data.rounds) ? pack.data : { rounds: [] }
  } catch (e) { flash(e.message, true) }
})

function addRound() { local.data.rounds.push({ name: `Раунд ${local.data.rounds.length + 1}`, categories: [] }) }
function removeRound(ri) { local.data.rounds.splice(ri, 1) }
function addCategory(round) { round.categories.push({ category: 'Новая категория', questions: [] }) }
function removeCategory(round, ci) { round.categories.splice(ci, 1) }
function addQuestion(cat) {
  const points = (cat.questions.length + 1) * 100
  cat.questions.push({ points, type: 'text', q: '', a: '' })
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
