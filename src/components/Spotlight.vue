<template>
  <!-- «Кто сейчас в кадре»: крупный тайл героя момента — отвечающего или исполнителя.
       Тот же человек одновременно остаётся в ленте внизу: SDK разрешает несколько attach
       одного участника, поэтому DOM никуда не переносим (см. PlayerVideo). -->
  <Transition name="pop">
    <!-- Крупно по центру: отвечающий (или исполнитель) — главный человек момента, его должно
         быть видно как в телевизоре. Поверх модалки вопроса (у неё z-50), чуть выше центра,
         чтобы не налезать на пульт ведущего внизу. -->
    <div v-if="hero" class="pointer-events-none fixed left-1/2 -translate-x-1/2 top-[42%] -translate-y-1/2 z-[70] w-[min(78vw,620px)]">
      <div class="relative rounded-3xl overflow-hidden border-4 shadow-2xl bg-hub-deep"
           :class="accent.border"
           style="aspect-ratio: 16 / 9">
        <!-- Камера героя; пока кадров нет (или камера выключена) — крупный аватар под ней -->
        <div class="absolute inset-0 flex items-center justify-center">
          <img v-if="hero.avatar && store.avatarIsImage(hero.avatar)" :src="store.getAvatarUrl(hero.avatar)"
               class="w-28 h-28 rounded-3xl object-cover opacity-70" />
          <span v-else-if="hero.avatar" class="text-8xl opacity-70">{{ hero.avatar }}</span>
          <span v-else class="text-7xl font-black text-hub-muted opacity-70">{{ (hero.name || '?').charAt(0).toUpperCase() }}</span>
        </div>
        <PlayerVideo v-if="hero.platformId" :account-id="hero.platformId" fit="cover" />

        <!-- Подпись: кто и в какой роли -->
        <div class="absolute inset-x-0 bottom-0 z-20 px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-t from-black/90 to-transparent">
          <span class="font-black text-xl md:text-2xl truncate font-display" :class="accent.text">{{ hero.name }}</span>
          <span class="text-xs uppercase tracking-widest font-black shrink-0" :class="accent.text">{{ accent.label }}</span>
        </div>

        <!-- Говорит — рамка-пульс -->
        <div v-if="heroSpeaking" class="absolute inset-0 z-10 rounded-2xl ring-2 ring-inset pointer-events-none" :class="accent.ring"></div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { usePlatformStore } from '../stores/platform'
import PlayerVideo from './PlayerVideo.vue'

const store = useGameStore()
const platform = usePlatformStore()

// Приоритет героя: отвечает > показывает (крокодил/караоке/алиас).
// Дуэль и картошка сознательно НЕ спотлайтим: там важна общая движуха, а не один человек.
const heroRole = computed(() => {
  if (store.questionStatus === 'answering' && store.answeringPlayerId != null) return 'answering'
  if (store.performerId != null && ['performing', 'alias_playing'].includes(store.questionStatus)) return 'performer'
  return null
})

// id героя — игровой (числовой из БД), а НЕ accountId звонка: маппинг в участника делаем ниже
const hero = computed(() => {
  const id = heroRole.value === 'answering' ? store.answeringPlayerId
    : heroRole.value === 'performer' ? store.performerId : null
  if (id == null) return null
  return store.getPlayerById(id) || null
})

// Участник звонка ищется по platformId (accountId), сравнение строгое по строкам
const heroSpeaking = computed(() => {
  const pid = hero.value?.platformId
  return pid ? !!platform.participantFor(pid)?.speaking : false
})

const accent = computed(() => heroRole.value === 'performer'
  ? { border: 'border-party-pink/70', text: 'text-party-pink', ring: 'ring-party-pink/60', label: 'показывает' }
  : { border: 'border-hub-accent/70', text: 'text-hub-accent', ring: 'ring-hub-accent/60', label: 'отвечает' })
</script>
