<template>
  <div class="flex flex-col items-center gap-4 py-3 w-full">
    <p class="text-xl font-bold text-hub-text">{{ modeIcon }} {{ store.currentQuestion.q || defaultPrompt }}</p>

    <!-- ===== Режим «число»: ввод ===== -->
    <template v-if="store.questionStatus === 'number_inputting'">
      <div v-if="!isHost && !store.isSpectator" class="flex flex-col items-center gap-3 w-full max-w-sm">
        <div v-if="numberSubmitted" class="w-full py-4 bg-hub-positive/15 border-2 border-hub-positive/50 text-hub-positive rounded-xl text-lg font-bold text-center">
          Ответ принят ✓
        </div>
        <template v-else>
          <input v-model="numberVal" :type="numberInputType" :placeholder="numberPlaceholder"
                 @keydown.enter="submitNumber"
                 class="w-full px-5 py-4 bg-hub-deep border-2 border-hub-border rounded-xl text-hub-text text-xl outline-none focus:border-hub-accent text-center" />
          <button @click="submitNumber" class="hub-btn-primary w-full py-3">Отправить</button>
        </template>
      </div>
      <div v-else class="text-hub-muted">
        Ответили: {{ numberSubmittedCount }} / {{ store.players.length }}
      </div>
    </template>

    <!-- ===== Режим «число»: итоги ===== -->
    <template v-else-if="store.questionStatus === 'number_results' && store.numberReveal">
      <div class="bg-hub-deep/70 border-2 border-hub-accent/40 rounded-2xl px-8 py-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-hub-accent font-black mb-1">Правильный ответ</p>
        <p class="text-3xl font-black text-hub-accent">{{ store.numberReveal.answer }}</p>
      </div>
      <div class="flex flex-col gap-2 w-full max-w-md">
        <div v-for="(r, idx) in store.numberReveal.ranked" :key="r.id"
             class="flex justify-between items-center p-3 rounded-xl border"
             :class="r.id === store.numberReveal.winnerId ? 'border-hub-positive bg-hub-positive/10' : 'border-hub-border bg-hub-deep/50'">
          <span class="font-bold">{{ idx + 1 }}. {{ r.name }}</span>
          <span class="text-hub-text">{{ r.raw }}</span>
        </div>
        <p v-if="!store.numberReveal.ranked.length" class="text-hub-muted italic text-center">Никто не ответил</p>
      </div>
    </template>

    <!-- ===== Режим «тир-лист»: оценка ===== -->
    <template v-else-if="store.questionStatus === 'tier_rating'">
      <div v-if="!isHost && !store.isSpectator && !tierSubmittedByMe" class="w-full max-w-lg flex flex-col gap-3">
        <div v-for="(it, i) in tierItems" :key="i" class="hub-card p-3 flex items-center gap-3">
          <img v-if="it.mediaSrc" :src="store.getAssetUrl(it.mediaSrc)" class="w-12 h-12 rounded object-cover" />
          <div class="flex-1">
            <div class="flex justify-between mb-1">
              <span class="font-bold text-sm">{{ it.label || `Объект ${i + 1}` }}</span>
              <span class="text-hub-accent font-black">{{ ratings[i] }}</span>
            </div>
            <input type="range" min="1" max="10" v-model.number="ratings[i]" class="w-full accent-hub-accent" />
          </div>
        </div>
        <button @click="submitTier" class="hub-btn-primary py-3">Отправить оценки</button>
      </div>
      <div v-else-if="tierSubmittedByMe" class="py-6 text-hub-positive font-bold text-lg">Оценки приняты ✓</div>
      <div v-else class="text-hub-muted">
        Оценили: {{ store.tierSubmitted?.length || 0 }} / {{ store.players.length }}
        <ul class="mt-3 text-sm text-hub-muted/80 list-disc list-inside">
          <li v-for="(it, i) in tierItems" :key="i">{{ it.label || `Объект ${i + 1}` }}</li>
        </ul>
      </div>
    </template>

    <!-- ===== Режим «тир-лист»: итоги (медиана + очки за консенсус) ===== -->
    <template v-else-if="store.questionStatus === 'tier_results' && store.tierResults">
      <div class="w-full max-w-2xl flex flex-col gap-2">
        <div v-for="(it, i) in store.tierResults.items" :key="i" class="hub-card p-3 flex items-center gap-3">
          <img v-if="it.mediaSrc" :src="store.getAssetUrl(it.mediaSrc)" class="w-10 h-10 rounded object-cover" />
          <span class="flex-1 font-bold">{{ it.label }}</span>
          <span class="text-hub-muted text-sm">медиана</span>
          <span class="text-2xl font-black text-hub-accent w-10 text-center">{{ fmtMedian(it.median) }}</span>
        </div>
      </div>
      <ScoreList :scores="store.tierResults.scores" title="Очки за консенсус" />
    </template>

    <!-- ===== Режим «кто сказал»: сбор ответов ===== -->
    <template v-else-if="store.questionStatus === 'whosaid_collecting'">
      <div v-if="!isHost && !store.isSpectator && !sentAnswer" class="w-full max-w-md flex flex-col gap-3">
        <textarea v-model="myAnswer" rows="2" class="hub-input w-full" placeholder="Ваш ответ (анонимно)…"></textarea>
        <button @click="submitWhoSaid" class="hub-btn-primary py-3">Отправить</button>
      </div>
      <div v-else-if="sentAnswer" class="py-4 text-hub-positive font-bold">Ответ принят ✓</div>
      <div v-else class="text-hub-muted">Написали: {{ store.whoSaidCount }} / {{ store.players.length }}</div>
    </template>

    <!-- ===== Режим «кто сказал»: угадывание авторов ===== -->
    <template v-else-if="store.questionStatus === 'whosaid_guessing'">
      <div v-if="!isHost && !store.isSpectator && !sentGuesses" class="w-full max-w-lg flex flex-col gap-3">
        <div v-for="a in store.whoSaidAnswers" :key="a.idx" class="hub-card p-3 flex flex-col gap-2">
          <span class="italic text-hub-text">«{{ a.text }}»</span>
          <select v-model="guesses[a.idx]" class="hub-input text-sm">
            <option :value="undefined" disabled>Кто это сказал?</option>
            <option v-for="p in store.players" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button @click="submitGuesses" class="hub-btn-primary py-3">Отправить догадки</button>
      </div>
      <div v-else-if="sentGuesses" class="py-4 text-hub-positive font-bold">Догадки приняты ✓</div>
      <div v-else class="w-full max-w-lg flex flex-col gap-2">
        <p class="text-hub-muted text-center">Угадали: {{ store.whoSaidCount }} / {{ store.players.length }}</p>
        <div v-for="a in store.whoSaidAnswers" :key="a.idx" class="hub-card p-2 italic text-hub-muted text-sm">«{{ a.text }}»</div>
      </div>
    </template>

    <!-- ===== Режим «кто сказал»: итоги ===== -->
    <template v-else-if="store.whoSaidResult">
      <div class="w-full max-w-lg flex flex-col gap-2">
        <div v-for="a in store.whoSaidResult.answers" :key="a.idx" class="hub-card p-3 flex justify-between items-center">
          <span class="italic text-hub-text">«{{ a.text }}»</span>
          <span class="font-black text-hub-accent">{{ a.authorName }}</span>
        </div>
      </div>
      <ScoreList :scores="store.whoSaidResult.scores" title="Очки" />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, h } from 'vue'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const emit = defineEmits(['action'])
const isHost = computed(() => store.host?.id === store.user?.id)

// Режим задаёт вопрос (number — дефолт)
const mode = computed(() => {
  const m = store.currentQuestion?.everyoneMode
  return m === 'tierlist' || m === 'whosaid' ? m : 'number'
})
const modeIcon = computed(() => ({ number: '🔢', tierlist: '📊', whosaid: '🗣' }[mode.value]))
const defaultPrompt = computed(() => ({
  number: 'Назовите число',
  tierlist: 'Оцените каждый объект 1–10',
  whosaid: 'Ответьте на вопрос'
}[mode.value]))

// Общий ранжир очков (тир-лист и «кто сказал» показывают одинаковый список)
const ScoreList = (props) => h('div', { class: 'w-full max-w-md mt-2' }, [
  h('h4', { class: 'text-sm font-black uppercase tracking-widest text-hub-muted mb-2' }, props.title),
  h('div', { class: 'flex flex-col gap-1' },
    Object.entries(props.scores || {})
      .map(([id, score]) => ({ id, score, name: store.getPlayerById(id)?.name || id }))
      .sort((a, b) => b.score - a.score)
      .map(s => h('div', { key: s.id, class: 'flex justify-between p-2 rounded-lg bg-hub-deep/50 border border-hub-border' }, [
        h('span', { class: 'font-bold' }, s.name),
        h('span', { class: 'text-hub-positive font-black' }, `+${s.score}`)
      ]))
  )
])
ScoreList.props = { scores: Object, title: String }

// --- Число ---
const numberKind = computed(() => store.currentQuestion?.numberKind || 'number')
const numberInputType = computed(() => numberKind.value === 'date' ? 'date' : 'number')
const numberPlaceholder = computed(() => numberKind.value === 'date' ? 'ГГГГ-ММ-ДД' : numberKind.value === 'year' ? 'Год' : 'Число')
const numberVal = ref('')
const numberSubmitted = computed(() => !!store.numberGuesses?.[String(store.user?.id)])
const numberSubmittedCount = computed(() => Object.keys(store.numberGuesses || {}).length)
function submitNumber() {
  const v = String(numberVal.value).trim()
  if (!v) return
  emit('action', { name: 'player:submitNumber', payload: { value: v } })
}

// --- Тир-лист ---
const tierItems = computed(() => store.currentQuestion?.items || [])
const ratings = ref({})
watch(tierItems, (list) => {
  const r = {}; list.forEach((_, i) => { r[i] = ratings.value[i] ?? 5 })
  ratings.value = r
}, { immediate: true })
const tierSubmittedByMe = computed(() => (store.tierSubmitted || []).includes(String(store.user?.id)))
function submitTier() { emit('action', { name: 'player:submitTier', payload: { ratings: ratings.value } }) }
function fmtMedian(v) { return v == null ? '—' : (Math.round(v * 10) / 10) }

// --- Кто сказал ---
const myAnswer = ref('')
const guesses = ref({})
// Факт своего ответа сервер не раскрывает пофамильно, поэтому опираемся на локальный флаг
const sentAnswer = ref(false)
const sentGuesses = ref(false)
function submitWhoSaid() {
  const t = myAnswer.value.trim()
  if (!t) return
  emit('action', { name: 'player:submitWhoSaid', payload: { text: t } })
  sentAnswer.value = true
}
function submitGuesses() {
  emit('action', { name: 'player:guessAuthor', payload: { guesses: guesses.value } })
  sentGuesses.value = true
}
</script>
