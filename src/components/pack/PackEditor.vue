<template>
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
    <div class="panel-glass w-full max-w-6xl my-6 p-6">
      <!-- Шапка редактора -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <input v-model="local.name" class="hub-input flex-1 min-w-[200px] text-lg font-bold" placeholder="Название пака" />
        <button @click="save" :disabled="saving" class="hub-btn-primary text-sm disabled:opacity-50">{{ saving ? 'Сохраняем…' : '💾 Сохранить' }}</button>
        <span class="text-xs w-28" :class="savedStatus === 'error' ? 'text-hub-negative' : 'text-hub-muted'">{{ statusText }}</span>
        <button @click="undo" :disabled="!canUndo" class="hub-btn text-sm disabled:opacity-30" title="Отменить (Ctrl+Z)">↶</button>
        <button @click="redo" :disabled="!canRedo" class="hub-btn text-sm disabled:opacity-30" title="Повторить (Ctrl+Shift+Z)">↷</button>
        <button @click="openShelf()" class="hub-btn text-sm">🗂 Медиа</button>
        <button @click="showLint = true" class="hub-btn text-sm"
                :class="lintIssues.some(i => i.level === 'error') ? '!text-hub-negative' : lintIssues.length ? '!text-hub-warning' : ''">
          🔍 Проверка{{ lintIssues.length ? ` (${lintIssues.length})` : '' }}
        </button>
        <button @click="mapView = !mapView" class="hub-btn text-sm" :class="mapView ? '!text-hub-accent' : ''">
          {{ mapView ? '📋 По раундам' : '🗺 Карта пака' }}
        </button>
        <button @click="showWizard = true" class="hub-btn text-sm">🎨 Шаблон</button>
        <button @click="exportPack" class="hub-btn text-sm">⬇ ZIP</button>
        <button @click="$emit('close')" class="hub-btn text-sm">✕ Закрыть</button>
      </div>
      <p v-if="msg" class="text-sm font-bold mb-2" :class="msgErr ? 'text-hub-negative' : 'text-hub-positive'">{{ msg }}</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <p class="text-xs text-hub-muted">📦 {{ packStats.rounds }} раундов · {{ packStats.questions }} вопросов · {{ packStats.types }} типов · ~{{ packStats.minutes }} мин</p>
        <template v-if="packStats.blank">
          <span class="text-xs text-hub-warning">⚠ {{ packStats.blank }} не заполнено</span>
          <input v-model="bulkTheme" class="hub-input text-xs w-36 py-1" :placeholder="local.name || 'Тема для заглушек'" />
          <button @click="fillBlanksWithStubs" class="hub-btn text-xs">✨ Заполнить образцами</button>
        </template>
      </div>

      <!-- Вкладки раундов -->
      <div v-if="!mapView" class="flex items-center gap-1 border-b border-hub-border mb-5 flex-wrap">
        <button v-for="(rnd, ri) in local.data.rounds" :key="ri"
                @click="activeRound = ri"
                @contextmenu="roundMenu(ri, $event)"
                draggable="true"
                @dragstart="dragRound = ri"
                @dragover.prevent
                @drop="onRoundDrop(ri)"
                class="px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors flex items-center gap-1.5"
                :class="activeRound === ri ? 'border-hub-accent text-hub-accent' : 'border-transparent text-hub-muted hover:text-hub-text'">
          {{ rnd.name || `Раунд ${ri + 1}` }}
          <span v-if="completeness[ri]?.total" class="text-[9px] font-black"
                :class="completeness[ri].done === completeness[ri].total ? 'text-hub-positive' : 'text-hub-warning'">
            {{ completeness[ri].done }}/{{ completeness[ri].total }}
          </span>
        </button>
        <button @click="addRound" class="px-3 py-2 text-sm font-bold text-hub-muted hover:text-hub-accent">+ Раунд</button>
      </div>

      <!-- Карта пака: компактный обзор всех раундов, клик по ячейке телепортирует к вопросу -->
      <template v-if="mapView">
        <div class="flex flex-col gap-4 mb-4">
          <div v-for="(r, ri) in local.data.rounds" :key="ri" class="border border-hub-border rounded-xl p-3">
            <p class="font-bold text-sm mb-2 text-hub-accent">{{ r.name || `Раунд ${ri + 1}` }}</p>
            <div class="space-y-1.5">
              <div v-for="(cat, ci) in r.categories" :key="ci" class="flex items-center gap-2">
                <span class="w-32 shrink-0 text-[11px] text-hub-muted truncate" :title="cat.category">{{ cat.category || '—' }}</span>
                <div class="flex gap-1 flex-wrap">
                  <button v-for="(q, qi) in cat.questions" :key="qi" @click="jumpToCell(ri, ci, qi)"
                          class="w-12 h-8 rounded border text-[10px] font-bold flex items-center justify-center hover:border-hub-accent transition-colors"
                          :class="isBlank(q) ? 'border-dashed border-hub-warning/50 text-hub-warning' : 'border-hub-border text-hub-text'">
                    {{ q.points }}
                  </button>
                </div>
              </div>
              <p v-if="!r.categories?.length" class="text-hub-muted text-xs italic">пусто</p>
            </div>
          </div>
          <p v-if="!local.data.rounds.length" class="text-hub-muted text-sm text-center py-6">Пак пуст.</p>
        </div>
      </template>

      <!-- Активный раунд как игровая сетка -->
      <template v-if="!mapView && round">
        <div class="flex items-center gap-2 mb-4">
          <input v-model="round.name" class="hub-input flex-1 font-bold" placeholder="Название раунда" />
          <button @click="duplicateRound(activeRound)" class="hub-btn text-xs">⧉ Дублировать</button>
          <button @click="removeRound(activeRound)" class="hub-btn text-xs !text-hub-negative">Удалить раунд</button>
        </div>

        <!-- Строки-категории с ячейками-вопросами -->
        <div class="space-y-2 mb-3">
          <div v-for="(cat, ci) in round.categories" :key="ci" class="flex items-stretch gap-2">
            <!-- Заголовок категории (как в игре: акцентная левая грань) -->
            <div class="w-44 shrink-0 bg-gradient-to-r from-hub-deep to-hub-solid border-l-4 border-hub-accent rounded-r-lg p-2 flex flex-col justify-between"
                 draggable="true"
                 @dragstart="dragCat = ci"
                 @dragover.prevent
                 @drop="onCatDrop(ci)"
                 @contextmenu="catMenu(round, ci, $event)">
              <input v-model="cat.category" class="bg-transparent outline-none text-sm font-black text-hub-text w-full" placeholder="Категория" />
              <div class="flex gap-2 mt-1 flex-wrap">
                <button @click="duplicateCategory(round, ci)" class="text-[10px] text-hub-muted hover:text-hub-accent" title="Дублировать строку">⧉ копия</button>
                <button @click="renumberCategory(cat)" class="text-[10px] text-hub-muted hover:text-hub-accent" title="Перенумеровать очки по порядку">🔢 порядок</button>
                <button @click="removeCategory(round, ci)" class="text-[10px] text-hub-negative hover:brightness-125">✕ строку</button>
              </div>
            </div>

            <!-- Ячейки-вопросы -->
            <div class="flex gap-2 flex-wrap items-stretch">
              <button v-for="(q, qi) in cat.questions" :key="qi"
                      @click="openQuestion(cat, qi)"
                      @contextmenu="cellMenu(cat, qi, $event)"
                      draggable="true"
                      @dragstart="onCellDragStart(cat, qi)"
                      @dragover.prevent
                      @drop="onCellDrop(cat, qi)"
                      class="group w-24 h-[68px] rounded-lg border flex flex-col items-center justify-center transition-all hover:scale-[1.03] relative"
                      :class="isBlank(q) ? 'border-dashed border-hub-warning/50 bg-hub-warning/5' : 'border-hub-border bg-hub-deep/60 hover:border-hub-accent'">
                <span class="text-xl font-black" :style="{ color: 'var(--c-accent)' }">{{ q.points }}</span>
                <span class="text-[9px] font-bold uppercase tracking-wide mt-0.5" :style="{ color: TYPE_META[q.type]?.tone }">{{ TYPE_META[q.type]?.short }}</span>
                <span v-if="q.mediaSrc" class="absolute top-1 right-1 text-[9px]">📎</span>
                <span v-if="isBlank(q)" class="absolute top-1 left-1 text-[9px]" title="Не заполнен">⚠</span>
                <!-- Ховер-тулбар: дублировать/удалить без ПКМ-меню -->
                <div class="absolute inset-x-0 top-0 flex justify-center gap-3 pt-0.5 rounded-t-lg bg-hub-deep/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span @click.stop="duplicateQuestion(cat, qi)" class="text-[12px] text-hub-text hover:text-hub-accent cursor-pointer" title="Дублировать">⧉</span>
                  <span @click.stop="cat.questions.splice(qi, 1)" class="text-[12px] text-hub-negative hover:brightness-150 cursor-pointer" title="Удалить">🗑</span>
                </div>
                <span @click.stop="openTest(cat, qi)" class="absolute bottom-0.5 right-1 text-[11px] text-hub-accent hover:scale-125 transition-transform cursor-pointer" title="Быстрый тест">▶</span>
              </button>
              <!-- Добавить ячейку -->
              <button @click="addQuestion(cat)" class="w-24 h-[68px] rounded-lg border border-dashed border-hub-border text-hub-muted hover:text-hub-accent hover:border-hub-accent text-2xl font-thin">+</button>
            </div>
          </div>
        </div>

        <button @click="addCategory(round)" class="hub-btn text-sm">+ Строка (категория)</button>
      </template>

      <div v-if="!mapView && !round" class="text-center py-10">
        <p class="text-hub-muted text-sm mb-4">Пак пуст — начните с пустого раунда или соберите его по теме.</p>
        <div class="flex justify-center gap-2">
          <button @click="addRound" class="hub-btn text-sm">+ Пустой раунд</button>
          <button @click="showWizard = true" class="hub-btn-primary text-sm">🎨 Собрать по теме</button>
        </div>
      </div>

      <p class="text-hub-muted text-xs mt-6">Паки хранятся 30 дней. Чтобы не потерять — выгрузите ZIP (в нём и медиа) и при необходимости загрузите обратно.</p>
    </div>

    <TemplateWizard v-if="showWizard" :suggested-theme="local.name" @close="showWizard = false" @apply="applyWizard" />
    <LintPanel v-if="showLint" :issues="lintIssues" @close="showLint = false" @jump="jumpToIssue" />
    <TypePalette v-if="showTypePalette" :type-meta="TYPE_META" :current-type="editQ.type"
                 @close="showTypePalette = false" @select="onTypeSelect" />
    <MediaShelf v-if="showShelf" :pack-id="props.packId" :used-names="usedMediaNames" :target="shelfTarget"
                @close="closeShelf" @pick="flash('Медиа подключено из полки')" />

    <!-- Редактор одного вопроса -->
    <div v-if="editing" class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" @click.self="closeEditing">
      <div class="panel-glass w-full p-6 max-h-[92vh] overflow-y-auto" :class="testing ? 'max-w-6xl' : 'max-w-lg'">
        <div class="flex items-center justify-between mb-4 gap-2">
          <h3 class="font-black text-hub-accent">Вопрос за {{ editQ.points }}</h3>
          <div class="flex gap-2">
            <button @click="testing = !testing" class="hub-btn text-xs" :class="testing ? '!text-hub-accent' : ''">🧪 {{ testing ? 'Скрыть тест' : 'Тест' }}</button>
            <button @click="closeEditing" class="hub-btn text-xs">Готово</button>
          </div>
        </div>
        <div :class="testing ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : ''">
        <div class="flex flex-col gap-3">
          <div class="flex gap-2">
            <label class="flex-1">
              <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black flex items-center justify-between">
                Тип
                <button type="button" @click="showTypePalette = true" class="text-hub-accent normal-case tracking-normal font-bold hover:underline" title="Быстрый выбор (Ctrl+K)">⌘K</button>
              </span>
              <select v-model="editQ.type" @change="ensureTypeFields(editQ)" class="hub-input text-sm w-full mt-1">
                <option v-for="t in TYPES" :key="t" :value="t">{{ TYPE_META[t].l }}</option>
              </select>
            </label>
            <label class="w-28">
              <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Очки</span>
              <input v-model.number="editQ.points" type="number" class="hub-input text-sm w-full mt-1" />
            </label>
          </div>

          <p class="text-[11px] text-hub-muted -mb-1">{{ TYPE_HINT[editQ.type] || '' }}</p>

          <textarea v-if="!NO_Q_TYPES.includes(editQ.type)" v-model="editQ.q" rows="2" class="hub-input text-sm w-full" :placeholder="qPlaceholder"></textarea>
          <input v-if="A_TYPES.includes(editQ.type)" v-model="editQ.a" class="hub-input text-sm w-full" :placeholder="aPlaceholder" />

          <!-- Медиа: обычное медиа, реф-аудио караоке, фрагмент -->
          <div v-if="MEDIA_TYPES.includes(editQ.type)" class="flex flex-col gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <label class="hub-btn text-xs cursor-pointer">
                {{ editQ.mediaSrc ? '🔁 Заменить' : '📎 Загрузить' }} {{ editQ.type === 'karaoke' ? 'реф-аудио' : editQ.type === 'snippet' ? 'фрагмент' : 'медиа' }}
                <input type="file" class="hidden" accept="image/*,audio/*,video/*" @change="onMedia($event, editQ)" />
              </label>
              <button @click="openShelf(editQ)" class="hub-btn text-xs" title="Выбрать уже загруженный файл пака">🗂 Из полки</button>
              <button v-if="editQ.mediaSrc" @click="removeMedia(editQ)" class="hub-btn text-xs !text-hub-negative">✕ убрать</button>
            </div>
            <!-- Живое превью того, что загрузили -->
            <div v-if="editQ.mediaSrc" class="rounded-lg overflow-hidden border border-hub-border bg-hub-deep/40 p-2 max-w-sm">
              <img v-if="editQ.mediaType === 'image'" :src="mediaUrl(editQ.mediaSrc)" class="max-h-40 rounded" />
              <audio v-else-if="editQ.mediaType === 'audio'" :src="mediaUrl(editQ.mediaSrc)" controls class="w-full" />
              <video v-else-if="editQ.mediaType === 'video'" :src="mediaUrl(editQ.mediaSrc)" controls class="max-h-40 w-full rounded" />
            </div>
          </div>

          <!-- Число: тип значения -->
          <label v-if="editQ.type === 'number'" class="flex flex-col">
            <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Тип значения</span>
            <select v-model="editQ.numberKind" class="hub-input text-sm mt-1 w-40">
              <option value="number">Число</option>
              <option value="year">Год</option>
              <option value="date">Дата (ГГГГ-ММ-ДД)</option>
            </select>
          </label>

          <!-- Алиас: список слов + таймер -->
          <div v-if="editQ.type === 'alias'" class="flex flex-col gap-2">
            <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Слова (по одному)</span>
            <div v-for="(w, wi) in editQ.words" :key="wi" class="flex gap-2">
              <input v-model="editQ.words[wi]" class="hub-input text-sm flex-1" placeholder="Слово" />
              <button @click="editQ.words.splice(wi, 1)" class="hub-btn text-xs !text-hub-negative">✕</button>
            </div>
            <button @click="editQ.words.push('')" class="hub-btn text-xs self-start">+ Слово</button>
            <label class="flex items-center gap-2 mt-1">
              <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Время, сек</span>
              <input v-model.number="editQ.timerSec" type="number" class="hub-input text-sm w-24" placeholder="60" />
            </label>
          </div>

          <!-- Тир-лист: список объектов (текст + опц. картинка) -->
          <div v-if="editQ.type === 'tierlist'" class="flex flex-col gap-2">
            <span class="text-[10px] uppercase tracking-widest text-hub-muted font-black">Объекты для оценки</span>
            <div v-for="(it, ii) in editQ.items" :key="ii" class="flex gap-2 items-center">
              <img v-if="it.mediaSrc" :src="mediaUrl(it.mediaSrc)" class="w-8 h-8 rounded object-cover border border-hub-border shrink-0" />
              <input v-model="it.label" class="hub-input text-sm flex-1" placeholder="Название объекта" />
              <label class="hub-btn text-xs cursor-pointer" :title="it.mediaSrc ? 'Заменить картинку' : 'Картинка объекта'">
                {{ it.mediaSrc ? '🔁' : '📎' }}
                <input type="file" class="hidden" accept="image/*" @change="onItemMedia($event, it)" />
              </label>
              <button v-if="it.mediaSrc" @click="removeMedia(it)" class="hub-btn text-xs" title="Убрать картинку">🚫</button>
              <button @click="editQ.items.splice(ii, 1)" class="hub-btn text-xs !text-hub-negative" title="Удалить объект">✕</button>
            </div>
            <button @click="editQ.items.push({ label: '' })" class="hub-btn text-xs self-start">+ Объект</button>
          </div>

          <button @click="deleteQuestion" class="hub-btn text-xs !text-hub-negative self-start mt-2">🗑 Удалить вопрос</button>
        </div>
        <div v-if="testing" class="min-w-0">
          <QuickTestPanel :question="editQ" :interactive="true" />
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from 'vue'
import { usePacksStore } from '../../stores/packs'
import { useGameStore } from '../../stores/game'
import { getPlatform } from '../../platform/sdk'
import QuickTestPanel from './quicktest/QuickTestPanel.vue'
import TemplateWizard from './TemplateWizard.vue'
import { stubForType } from './templates'
import LintPanel from './LintPanel.vue'
import { isBlank, lintPack, renumberCategory } from './lint'
import TypePalette from './TypePalette.vue'
import MediaShelf from './MediaShelf.vue'

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
  // Новые типы-мини-игры
  charades:   { l: 'Крокодил',                    short: 'Крокодил', tone: '#00cec9' },
  karaoke:    { l: 'Караоке',                     short: 'Караоке',  tone: '#e84393' },
  alias:      { l: 'Алиас',                       short: 'Алиас',    tone: '#6c5ce7' },
  snippet:    { l: 'Угадай по фрагменту',         short: 'Фрагмент', tone: '#fab1a0' },
  rps:        { l: 'Камень-ножницы',              short: 'КНБ',      tone: '#8a94a6' },
  number:     { l: 'Угадай число',                short: 'Число',    tone: '#3da9fc' },
  tierlist:   { l: 'Тир-лист',                    short: 'Тир-лист', tone: '#00b894' },
  potato:     { l: 'Горячая картошка',            short: 'Картошка', tone: '#e0524a' },
  whosaid:    { l: 'Кто это сказал',              short: 'Кто сказал', tone: '#a29bfe' },
  reaction:   { l: 'Реакция',                     short: 'Реакция',  tone: '#fdcb6e' },
}
const TYPES = Object.keys(TYPE_META)

// Показывать ли поля «вопрос» и «ответ» для типа (у части типов их нет)
const NO_Q_TYPES = ['rps', 'reaction']
const A_TYPES = ['text', 'media', 'text_input', 'glitch', 'cat', 'among_us', 'poker', 'auction', 'charades', 'karaoke', 'number', 'snippet']
const MEDIA_TYPES = ['media', 'karaoke', 'snippet']

const local = reactive({ name: '', data: { rounds: [] } })
const activeRound = ref(0)
const editing = ref(null) // { cat, qi }
const testing = ref(false) // режим быстрого теста в модалке
const saving = ref(false)
const msg = ref(''); const msgErr = ref(false)
const showWizard = ref(false)
const bulkTheme = ref('')
const showLint = ref(false)
const mapView = ref(false)
const dragRound = ref(null) // индекс перетаскиваемого раунда
const dragCat = ref(null)   // индекс перетаскиваемой категории (в текущем round)
const dragCell = ref(null)  // { cat, index } перетаскиваемой ячейки
const showTypePalette = ref(false)
const showShelf = ref(false)
const shelfTarget = ref(null) // вопрос/объект, куда «Из полки» подставит mediaSrc; null = режим просмотра/GC

const round = computed(() => local.data.rounds[activeRound.value] || null)
const editQ = computed(() => editing.value ? editing.value.cat.questions[editing.value.qi] : {})

// Подсказка по механике типа (показывается над полями)
const TYPE_HINT = {
  charades: 'Ведущий тайно показывает слово исполнителю; тот объясняет голосом, не называя.',
  karaoke:  'Исполнитель получает реф-аудио в наушник и напевает; остальные угадывают.',
  alias:    'Исполнителю по одному приходят слова; объясняет всем, ведущий отмечает угадавших.',
  snippet:  'Фрагмент (аудио/видео/фото). «Открыть больше» снижает очки; отгадывают по баззеру.',
  rps:      'Ведущий выбирает двух дуэлянтов; они тайно выбирают, победителю очки. Контент не нужен.',
  number:   'Все вводят число/год/дату; ближайший к ответу получает очки.',
  tierlist: 'Каждый объект оценивают ползунком 1–10; очки — за близость к медиане группы.',
  potato:   'Игроки по кругу называют варианты на скрытом таймере; на ком «взорвётся» — теряет очки.',
  whosaid:  'Все анонимно пишут ответ на промпт; затем угадывают, чей ответ.',
  reaction: 'Движок сам строит сетку и правило; первый верный тап получает очки. Контент не нужен.',
}
const qPlaceholder = computed(() => {
  switch (editQ.value.type) {
    case 'potato':   return 'Категория (например: «Марки машин»)'
    case 'whosaid':  return 'Промпт (например: «Самый неловкий момент»)'
    case 'charades':
    case 'karaoke':  return 'Инструкция (необязательно)'
    case 'number':   return 'Вопрос (например: «В каком году…»)'
    default:         return 'Текст вопроса'
  }
})
const aPlaceholder = computed(() => {
  switch (editQ.value.type) {
    case 'karaoke':  return 'Название песни'
    case 'charades': return 'Слово для показа'
    case 'number':   return editQ.value.numberKind === 'date' ? 'Ответ: ГГГГ-ММ-ДД'
                          : editQ.value.numberKind === 'year' ? 'Ответ: год' : 'Ответ: число'
    default:         return 'Ответ'
  }
})

function flash(text, err = false) { msg.value = text; msgErr.value = err; setTimeout(() => (msg.value = ''), 4000) }

// Ленивая инициализация полей-массивов + умные дефолты при выборе типа
function ensureTypeFields(q) {
  if (q.type === 'alias') { if (!Array.isArray(q.words)) q.words = ['']; if (q.timerSec == null) q.timerSec = 60 }
  if (q.type === 'tierlist' && !Array.isArray(q.items)) q.items = [{ label: '' }]
  if (q.type === 'number' && !q.numberKind) q.numberKind = 'number'
}

// Абсолютный URL медиа для превью в редакторе
const game = useGameStore()
function mediaUrl(src) {
  if (!src) return ''
  if (src.startsWith('http') || src.startsWith('data:')) return src
  return `${game.API_URL}${src}`
}
function removeMedia(target) { target.mediaSrc = null; target.mediaType = null }

// «Пак в цифрах»
const packStats = computed(() => {
  let q = 0, blank = 0; const types = new Set()
  local.data.rounds.forEach(r => (r.categories || []).forEach(c => (c.questions || []).forEach(x => {
    q++; if (isBlank(x)) blank++; types.add(x.type)
  })))
  return { rounds: local.data.rounds.length, questions: q, blank, types: types.size, minutes: Math.max(1, Math.round(q * 0.75)) }
})
const statusText = computed(() => ({ dirty: '● есть изменения', saving: 'Сохраняем…', saved: '✓ Сохранено', error: '⚠ ошибка' }[savedStatus.value] || ''))

// Находки линтера + completeness (done/total) на раунд для бейджей на вкладках
const lintIssues = computed(() => lintPack(local.data.rounds))
const completeness = computed(() => local.data.rounds.map(r => {
  let total = 0, done = 0
  ;(r.categories || []).forEach(c => (c.questions || []).forEach(q => { total++; if (!isBlank(q)) done++ }))
  return { done, total }
}))

// Имена файлов (basename), реально используемых где-либо в паке — для медиа-полки (used/orphan)
const usedMediaNames = computed(() => {
  const names = []
  local.data.rounds.forEach(r => (r.categories || []).forEach(c => (c.questions || []).forEach(q => {
    if (q.mediaSrc) names.push(q.mediaSrc.split('/').pop())
    ;(q.items || []).forEach(it => { if (it.mediaSrc) names.push(it.mediaSrc.split('/').pop()) })
  })))
  return names
})

const loaded = ref(false)
const savedStatus = ref('') // '' | 'dirty' | 'saving' | 'saved' | 'error'
let saveTimer = null

// --- Undo/Redo: снапшоты local.data на том же debounce-цикле, что и autosave ---
const historyStack = ref([]) // JSON-строки снапшотов
const historyIndex = ref(-1)
let applyingHistory = false
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)

function snapshotNow() {
  const snap = JSON.stringify(local.data)
  if (historyStack.value[historyIndex.value] === snap) return
  historyStack.value = historyStack.value.slice(0, historyIndex.value + 1) // отбросить redo-хвост
  historyStack.value.push(snap)
  if (historyStack.value.length > 50) historyStack.value.shift()
  historyIndex.value = historyStack.value.length - 1
}
function applySnapshot(idx) {
  applyingHistory = true
  historyIndex.value = idx
  local.data = JSON.parse(historyStack.value[idx])
  // editing.value.cat — ссылка на СТАРОЕ дерево, после замены local.data она протухла бы
  editing.value = null
  testing.value = false
  activeRound.value = Math.min(activeRound.value, Math.max(0, local.data.rounds.length - 1))
  nextTick(() => { applyingHistory = false })
}
function undo() { if (canUndo.value) applySnapshot(historyIndex.value - 1) }
function redo() { if (canRedo.value) applySnapshot(historyIndex.value + 1) }

onMounted(async () => {
  try {
    const pack = await packs.getPack(props.packId)
    local.name = pack.name
    local.data = pack.data && Array.isArray(pack.data.rounds) ? pack.data : { rounds: [] }
  } catch (e) { flash(e.message, true) }
  finally {
    loaded.value = true
    historyStack.value = [JSON.stringify(local.data)]
    historyIndex.value = 0
  }
})

// Автосохранение: debounced тихий PUT (бампает touched_at → пак не протухает по TTL)
watch(() => [local.name, local.data], () => {
  if (!loaded.value || applyingHistory) return
  savedStatus.value = 'dirty'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { snapshotNow(); autosave() }, 1500)
}, { deep: true })

// Ctrl+K — палитра типа (только пока открыта модалка вопроса); Ctrl+Z/Ctrl+Shift+Z — undo/redo,
// но НЕ когда фокус в поле ввода (иначе сломаем нативный undo текста в этом поле)
function isTypingTarget(e) {
  const t = e.target
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}
function onGlobalKeydown(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'k' && editing.value) { e.preventDefault(); showTypePalette.value = true; return }
  if (isTypingTarget(e)) return
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo() }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

async function autosave() {
  savedStatus.value = 'saving'
  try {
    await packs.updatePack(props.packId, local.name || 'Без названия', { rounds: local.data.rounds }, { silent: true })
    savedStatus.value = 'saved'
  } catch { savedStatus.value = 'error' }
}
onBeforeUnmount(() => clearTimeout(saveTimer))

function addRound() {
  local.data.rounds.push({ name: `Раунд ${local.data.rounds.length + 1}`, categories: [] })
  activeRound.value = local.data.rounds.length - 1
}

// Мастер «Пак по теме»: добавляет сгенерированные раунды и фокусирует первый из них
function applyWizard(rounds) {
  if (!rounds.length) return
  const firstIdx = local.data.rounds.length
  local.data.rounds.push(...rounds)
  activeRound.value = firstIdx
  showWizard.value = false
  flash(`Добавлено раундов: ${rounds.length}`)
}

// Заполняет ТОЛЬКО пустые поля вопроса заглушкой (не трогает уже введённое автором)
function fillMissing(target, stub) {
  for (const [k, v] of Object.entries(stub)) {
    if (k === 'type' || k === 'points') continue
    if (Array.isArray(v)) {
      const cur = target[k]
      const curEmpty = !Array.isArray(cur) || cur.length === 0 || cur.every(x => {
        if (typeof x === 'string') return !x.trim()
        if (x && typeof x === 'object') return !x.label?.trim() && !x.mediaSrc
        return !x
      })
      if (curEmpty) target[k] = v
    } else if (typeof v === 'string') {
      if (!target[k] || !String(target[k]).trim()) target[k] = v
    } else if (target[k] == null) {
      target[k] = v
    }
  }
}

function fillBlanksWithStubs() {
  const theme = (bulkTheme.value || local.name || '').trim()
  let count = 0
  local.data.rounds.forEach(r => (r.categories || []).forEach(c => (c.questions || []).forEach(q => {
    if (!isBlank(q)) return
    fillMissing(q, stubForType(q.type, theme))
    count++
  })))
  const remaining = packStats.value.blank
  flash(count ? `Текст заполнен: ${count}${remaining ? `, но ${remaining} ещё требует медиафайл` : ''}` : 'Пустых вопросов не найдено')
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
function openQuestion(cat, qi) { editing.value = { cat, qi }; ensureTypeFields(cat.questions[qi]); testing.value = false }
function openTest(cat, qi) { editing.value = { cat, qi }; ensureTypeFields(cat.questions[qi]); testing.value = true }
function closeEditing() { editing.value = null; testing.value = false }

// Телепорт из линтера/карты пака прямо к проблемной ячейке
function jumpToIssue(iss) {
  activeRound.value = iss.roundIdx
  mapView.value = false
  showLint.value = false
  if (iss.qi != null && iss.catIdx != null) {
    const cat = local.data.rounds[iss.roundIdx]?.categories?.[iss.catIdx]
    if (cat) openQuestion(cat, iss.qi)
  }
}
function jumpToCell(ri, ci, qi) {
  activeRound.value = ri
  mapView.value = false
  const cat = local.data.rounds[ri]?.categories?.[ci]
  if (cat) openQuestion(cat, qi)
}

// Command-palette типа: смена недеструктивна — q/a/points сохраняются, ensureTypeFields
// лениво добавляет недостающие поля нового типа, ничего не удаляет
function onTypeSelect(key) { editQ.value.type = key; ensureTypeFields(editQ.value) }

// Медиа-полка: target=null → просмотр/GC; target=вопрос/объект → «Использовать здесь» подставит файл
function openShelf(target = null) { shelfTarget.value = target; showShelf.value = true }
function closeShelf() { showShelf.value = false; shelfTarget.value = null }
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

// --- Drag-and-drop реордер (нативный HTML5 DnD, без библиотек) ---
function onRoundDrop(targetIdx) {
  if (dragRound.value == null || dragRound.value === targetIdx) { dragRound.value = null; return }
  // activeRound может сместиться при splice — отслеживаем по ССЫЛКЕ на объект, не по индексу
  const activeRef = local.data.rounds[activeRound.value]
  const [item] = local.data.rounds.splice(dragRound.value, 1)
  local.data.rounds.splice(targetIdx, 0, item)
  const newIdx = local.data.rounds.indexOf(activeRef)
  if (newIdx !== -1) activeRound.value = newIdx
  dragRound.value = null
}
function onCatDrop(targetIdx) {
  if (dragCat.value == null || dragCat.value === targetIdx || !round.value) { dragCat.value = null; return }
  const [item] = round.value.categories.splice(dragCat.value, 1)
  round.value.categories.splice(targetIdx, 0, item)
  dragCat.value = null
}
function onCellDragStart(cat, qi) { dragCell.value = { cat, index: qi } }
function onCellDrop(cat, targetIdx) {
  if (!dragCell.value || dragCell.value.cat !== cat) { dragCell.value = null; return }
  const from = dragCell.value.index
  if (from !== targetIdx) {
    const [item] = cat.questions.splice(from, 1)
    cat.questions.splice(targetIdx, 0, item)
  }
  dragCell.value = null
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

async function uploadTo(target, file) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = rej; r.onload = () => res(r.result); r.readAsDataURL(file)
  })
  const url = await packs.uploadMedia(props.packId, dataUrl)
  target.mediaSrc = url
  target.mediaType = file.type.startsWith('image') ? 'image' : file.type.startsWith('audio') ? 'audio' : 'video'
}

async function onMedia(e, q) {
  const file = e.target.files?.[0]
  if (!file) return
  try { await uploadTo(q, file); flash('Медиа загружено') }
  catch (err) { flash(err.message, true) }
  e.target.value = ''
}

// Медиа для отдельного объекта тир-листа
async function onItemMedia(e, item) {
  const file = e.target.files?.[0]
  if (!file) return
  try { await uploadTo(item, file); flash('Медиа объекта загружено') }
  catch (err) { flash(err.message, true) }
  e.target.value = ''
}

async function save() {
  saving.value = true
  clearTimeout(saveTimer)
  try {
    await packs.updatePack(props.packId, local.name || 'Без названия', { rounds: local.data.rounds })
    savedStatus.value = 'saved'
    flash('Сохранено')
    emit('saved')
  } catch (e) { savedStatus.value = 'error'; flash(e.message, true) }
  finally { saving.value = false }
}

async function exportPack() {
  try { await packs.exportPack(props.packId, local.name) }
  catch (e) { flash(e.message, true) }
}
</script>
