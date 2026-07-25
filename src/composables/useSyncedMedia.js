import { ref, watch, onUnmounted, nextTick } from 'vue'
import { useGameStore } from '../stores/game'
import { expectedPosition } from '../lib/mediaClock'
import { setActiveMediaEl, clearActiveMediaEl } from '../lib/mediaBus'

// Синхронизированное воспроизведение аудио/видео вопроса.
// Сервер вещает якорь mediaState {status, anchorPosition, anchorAt}; композабл:
//  - на status='playing' сикает элемент на ожидаемую позицию и запускает play()
//    (опоздавший/переподключившийся стартует с нужного места, а не с нуля);
//  - при блокировке автоплея пробует muted-старт для видео, иначе поднимает blocked
//    (оверлей «нажмите» — реальный жест всегда проходит);
//  - дрейф-коррекция каждые 2с: |факт − ожидание| > 1.5с → жёсткий seek с упреждением;
//  - ошибка загрузки медиа → error + retry() вместо мёртвой заглушки.
export function useSyncedMedia(elRef, { mediaType } = {}) {
  const store = useGameStore()
  const blocked = ref(false)       // автоплей отклонён — нужен тап
  const mutedAutoplay = ref(false) // видео пошло без звука — тап включит звук
  const error = ref(false)
  let driftTimer = null

  const isAV = () => mediaType === 'audio' || mediaType === 'video'

  function seekTo(el, pos) {
    try {
      if (Number.isFinite(pos) && Math.abs((el.currentTime || 0) - pos) > 0.3) el.currentTime = pos
    } catch { /* элемент ещё без метаданных — дрейф-цикл догонит */ }
  }

  async function tryPlay({ fromUserGesture = false } = {}) {
    await nextTick()
    const el = elRef.value
    if (!el) return
    error.value = false
    blocked.value = false
    seekTo(el, expectedPosition(store.mediaState, store.serverTimeDelta))
    try {
      await el.play()
      setActiveMediaEl(el)
    } catch {
      // Полиси-блок автоплея. Для видео пробуем muted-старт (разрешён браузерами),
      // предлагая включить звук тапом; иначе честный оверлей «нажмите».
      if (mediaType === 'video' && !el.muted && !fromUserGesture) {
        try {
          el.muted = true
          await el.play()
          mutedAutoplay.value = true
          blocked.value = true
          setActiveMediaEl(el)
          return
        } catch { el.muted = false }
      }
      blocked.value = true
    }
  }

  function stopPlayback() {
    const el = elRef.value
    blocked.value = false
    mutedAutoplay.value = false
    if (el) { try { el.pause() } catch { /* ок */ } }
  }

  function retry() {
    const el = elRef.value
    if (el && el.muted) el.muted = false // тап — жест: включаем звук
    if (el && error.value) { try { el.load() } catch { /* ок */ } }
    tryPlay({ fromUserGesture: true })
  }

  watch(() => store.mediaState?.status, (status) => {
    if (!isAV()) return
    if (status === 'playing') tryPlay()
    else stopPlayback()
  }, { immediate: true })

  driftTimer = setInterval(() => {
    const el = elRef.value
    if (!el || store.mediaState?.status !== 'playing' || el.paused) return
    const target = expectedPosition(store.mediaState, store.serverTimeDelta)
    if (Math.abs((el.currentTime || 0) - target) > 1.5) {
      try { el.currentTime = target + 0.15 } catch { /* ок */ }
    }
  }, 2000)

  function onError() { error.value = true }

  watch(elRef, (el, prev) => {
    if (prev) prev.removeEventListener('error', onError)
    if (el) el.addEventListener('error', onError)
  }, { immediate: true })

  onUnmounted(() => {
    clearInterval(driftTimer)
    if (elRef.value) elRef.value.removeEventListener('error', onError)
    clearActiveMediaEl(elRef.value)
  })

  return { blocked, mutedAutoplay, error, retry }
}
