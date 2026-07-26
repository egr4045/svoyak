import { watch, onUnmounted } from 'vue'

/**
 * Автоматический вход в голосовую комнату игры — с повтором.
 *
 * Раньше и лобби, и игра держали одноразовый флаг `voiceJoined`, который выставлялся ДО попытки
 * и никогда не сбрасывался. Любая неудача первой попытки (SDK ещё не настроил адреса сервисов,
 * гонка с resume() при заходе по приглашению, моргнувшая сеть) оставляла игрока без голоса
 * навсегда — ровно отсюда «в лобби звонок сбрасывается, надо жать кнопку вручную».
 *
 * Теперь попытка повторяется, пока не выйдет, и возобновляется, если звонок отвалился уже
 * в процессе игры. Ручная кнопка остаётся — как способ не ждать очередного повтора.
 */
export function useAutoVoice(store, platform, { retryMs = 4000, maxAttempts = 6 } = {}) {
  let attempts = 0
  let timer = null
  let inFlight = false
  let stopped = false

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }
  const schedule = () => { clearTimer(); if (!stopped) timer = setTimeout(() => { void attempt() }, retryMs) }

  async function attempt() {
    if (stopped || inFlight) return
    // Ждём первого стейта комнаты: без host мы ещё не знаем, наблюдатель мы или игрок
    if (!store.host || !store.roomCode) return
    if (platform.voiceConnected) { attempts = 0; return }
    // Голос физически недоступен (http, нет SDK) — повторять бессмысленно, это не чинится ретраем
    if (!platform.available || !platform.voiceSupported || !platform.voiceSecure) return

    inFlight = true
    let ok = false
    try {
      ok = await platform.joinVoice(store.roomCode, { spectator: store.isSpectator })
    } finally {
      inFlight = false
    }
    if (ok) { attempts = 0; return }
    attempts += 1
    if (attempts < maxAttempts) schedule()
  }

  // Триггеры: появился стейт комнаты, сменилась роль, оборвался звонок
  watch(
    () => [store.host, store.isSpectator, platform.voiceConnected],
    ([host, , connected]) => {
      if (!host) return
      if (connected) { attempts = 0; clearTimer(); return }
      attempts = 0 // новое событие — новая серия попыток
      void attempt()
    },
    { immediate: true }
  )

  onUnmounted(() => { stopped = true; clearTimer() })

  /** Ручной вход кнопкой: сбрасывает счётчик, чтобы автоматика снова имела право на попытки */
  return { retryNow: () => { attempts = 0; clearTimer(); void attempt() } }
}
