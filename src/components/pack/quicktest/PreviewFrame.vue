<template>
  <div ref="mountEl"></div>
</template>

<script setup>
// Один живой превью-кадр: монтирует отдельный Vue-app с собственным Pinia, рендерит настоящие
// ActiveQuestion (+ опц. HostPanel) на мок-сторе. Пере-сидится при смене роли/фазы/вопроса.
import { ref, watch, onMounted, onBeforeUnmount, nextTick, h, createApp } from 'vue'
import { createPinia } from 'pinia'
import { useGameStore } from '../../../stores/game'
import ActiveQuestion from '../../ActiveQuestion.vue'
import HostPanel from '../../HostPanel.vue'
import { makeMockState } from './mockState'
import { makeMockSocket } from './mockReducer'

const props = defineProps({
  question: { type: Object, required: true },
  role: { type: String, default: 'host' },
  phaseIndex: { type: Number, default: 0 },
  players: { type: Number, default: 3 },
  interactive: { type: Boolean, default: false },
  withHostPanel: { type: Boolean, default: true },
  minHeight: { type: Number, default: 360 }
})

const mountEl = ref(null)
let app = null
let store = null

function mountApp() {
  const pinia = createPinia()
  store = useGameStore(pinia)
  const stageStyle = `position:relative;min-height:${props.minHeight}px;width:100%;border-radius:16px;overflow:hidden;background:radial-gradient(ellipse at top,#0e141e 0%,#05080d 60%,#000 100%)`
  const Root = { render: () => h('div', [
    h('div', { style: stageStyle }, h(ActiveQuestion)),
    props.withHostPanel ? h('div', { style: 'margin-top:8px' }, h(HostPanel)) : null
  ]) }
  app = createApp(Root)
  app.use(pinia)
  app.mount(mountEl.value)
  reseed()
}

function reseed() {
  if (!store) return
  store.socket?.dispose?.()
  store.$reset()
  store.$patch(makeMockState(props.question, { role: props.role, phaseIndex: props.phaseIndex, players: props.players }))
  store.socket = props.interactive ? makeMockSocket(store) : null
}

watch(() => [props.role, props.phaseIndex, props.players, props.interactive], reseed)
watch(() => props.question, reseed, { deep: true })
onMounted(() => nextTick(mountApp))
onBeforeUnmount(() => { store?.socket?.dispose?.(); if (app) app.unmount() })
</script>
