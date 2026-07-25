import { ref } from 'vue'

// Разблокировка аудио первым пользовательским жестом. Браузеры не дают звук без
// жеста на странице — держим общий AudioContext и резюмим его на первый pointerdown/
// keydown. Дальше sfx (фаза 3) и саундборд (фаза 4) звучат в любой неожиданный момент;
// для <audio>/<video> остаётся точечный фолбэк-оверлей в MediaPlayer.
export const audioUnlocked = ref(false)

let ctx = null
const pending = []

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) ctx = new AC()
  }
  return ctx
}

// cb выполнится сразу (если уже разблокировано) или на первом жесте
export function onUnlock(cb) {
  if (audioUnlocked.value) cb()
  else pending.push(cb)
}

function unlock() {
  const c = getAudioContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
  if (!audioUnlocked.value) {
    audioUnlocked.value = true
    pending.splice(0).forEach(cb => { try { cb() } catch { /* ок */ } })
  }
}

let installed = false
export function installAudioUnlock() {
  if (installed) return
  installed = true
  // Не {once:true}: контекст может снова заснуть (мобильный Safari) — резюмим на каждый жест
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}
