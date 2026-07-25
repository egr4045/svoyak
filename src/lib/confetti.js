import confetti from 'canvas-confetti'

// Пресеты конфетти в неон-палитре. canvas-confetti сам рисует в оверлей-канвас
// (создаёт при первом вызове), respects prefers-reduced-motion через disableForReducedMotion.
const NEON = ['#ff4fa3', '#8b5cf6', '#22d3ee', '#a3e635', '#fbbf24', '#49a05a']
const opts = { colors: NEON, disableForReducedMotion: true, zIndex: 200 }

// Одиночный залп (правильный ответ, мелкие праздники)
export function burst(x = 0.5, y = 0.6) {
  confetti({ ...opts, particleCount: 90, spread: 75, origin: { x, y }, startVelocity: 42 })
}

// Дождь сверху (сплэш раунда, эффект ведущего «конфетти всем»)
export function rain() {
  confetti({ ...opts, particleCount: 70, angle: 90, spread: 120, origin: { x: 0.3, y: -0.1 }, gravity: 0.9, startVelocity: 25 })
  confetti({ ...opts, particleCount: 70, angle: 90, spread: 120, origin: { x: 0.7, y: -0.1 }, gravity: 0.9, startVelocity: 25 })
}

// Фейерверк (финал игры): серия залпов по таймеру
export function fireworks(durationMs = 2500) {
  const end = Date.now() + durationMs
  ;(function frame() {
    confetti({ ...opts, particleCount: 40, spread: 100, origin: { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.4 + 0.1 }, startVelocity: 35 })
    if (Date.now() < end) setTimeout(frame, 280)
  })()
}
