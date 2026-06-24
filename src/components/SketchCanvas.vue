<template>
  <div class="flex flex-col items-center">
    <div class="text-xl font-bold mb-4 text-yellow-400 flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-red-500 animate-ping"></div> Осталось времени: {{ timeLeft }} с</div>
    <canvas 
      ref="canvasRef"
      width="300" 
      height="300" 
      class="bg-white rounded-lg cursor-crosshair touch-none border-4 border-slate-700 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
      @touchstart.prevent="startDrawingTouch"
      @touchmove.prevent="drawTouch"
      @touchend.prevent="stopDrawing"
    ></canvas>
    <button @click="clear" class="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300 font-bold transition-colors">Очистить холст</button>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'

const emit = defineEmits(['submit'])
const canvasRef = ref(null)
const timeLeft = ref(20)
const store = useGameStore()

let isDrawing = false
let ctx = null
let timer = null
let submitted = false

function submitCanvas() {
  if (submitted) return
  submitted = true
  if (timer) clearInterval(timer)
  emit('submit', canvasRef.value.toDataURL())
}

function initCanvas() {
  ctx = canvasRef.value.getContext('2d')
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // Белый фон по умолчанию вместо прозрачного
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 300, 300)
}

function getPos(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function getTouchPos(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: e.touches[0].clientX - rect.left,
    y: e.touches[0].clientY - rect.top
  }
}

function startDrawing(e) {
  isDrawing = true
  const pos = getPos(e)
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
}

function draw(e) {
  if (!isDrawing) return
  const pos = getPos(e)
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
}

function startDrawingTouch(e) {
  isDrawing = true
  const pos = getTouchPos(e)
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
}

function drawTouch(e) {
  if (!isDrawing) return
  const pos = getTouchPos(e)
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
}

function stopDrawing() {
  isDrawing = false
  if (ctx) ctx.beginPath()
}

function clear() {
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 300, 300)
  }
}

function onForceSubmit() {
  submitCanvas()
}

onMounted(() => {
  initCanvas()
  timer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) {
      clearInterval(timer)
      submitCanvas()
    }
  }, 1000)

  // Слушаем принудительную сдачу от сервера (когда ведущий нажимает "Показать рисунки")
  store.socket?.on('sketch:forceSubmit', onForceSubmit)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  store.socket?.off('sketch:forceSubmit', onForceSubmit)
})
</script>
