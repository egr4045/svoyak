import { ref } from 'vue'
import { getAudioContext, onUnlock } from './audioUnlock'

// Звуковые эффекты на WebAudio: пул декодированных буферов, гейт на разблокировку
// жестом, локальный мьют игрока (localStorage). Файлы в public/sfx/*.wav —
// плейсхолдеры-синтезы; владелец заменит на CC0 (имена стабильны).
const NAMES = ['fanfare', 'drumroll', 'sadtrombone', 'quack', 'applause',
  'buzzer', 'correct', 'wrong', 'tick', 'pop', 'whoosh', 'spin']

const buffers = new Map()   // name -> AudioBuffer
const playingCount = new Map() // name -> активных инстансов (кап от спама)
const MAX_INSTANCES = 3

export const sfxMuted = ref(localStorage.getItem('svoyak.sfxMuted') === '1')
export function toggleSfxMuted() {
  sfxMuted.value = !sfxMuted.value
  localStorage.setItem('svoyak.sfxMuted', sfxMuted.value ? '1' : '0')
}

const base = import.meta.env.BASE_URL || '/'
let preloadStarted = false

async function loadOne(name) {
  if (buffers.has(name)) return buffers.get(name)
  const ctx = getAudioContext()
  if (!ctx) return null
  try {
    const res = await fetch(`${base}sfx/${name}.wav`)
    const buf = await ctx.decodeAudioData(await res.arrayBuffer())
    buffers.set(name, buf)
    return buf
  } catch { return null }
}

// Прогреваем весь набор после первого жеста (декодирование требует контекста)
export function preloadSfx() {
  if (preloadStarted) return
  preloadStarted = true
  onUnlock(() => { NAMES.forEach(loadOne) })
}

export async function playSfx(name, { volume = 1 } = {}) {
  if (sfxMuted.value) return
  const ctx = getAudioContext()
  if (!ctx || ctx.state === 'suspended') return // до жеста молчим (без очередей-сюрпризов)
  if ((playingCount.get(name) || 0) >= MAX_INSTANCES) return
  const buf = await loadOne(name)
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.value = volume
  src.connect(gain).connect(ctx.destination)
  playingCount.set(name, (playingCount.get(name) || 0) + 1)
  src.onended = () => playingCount.set(name, Math.max(0, (playingCount.get(name) || 1) - 1))
  try { src.start() } catch { /* ок */ }
}
