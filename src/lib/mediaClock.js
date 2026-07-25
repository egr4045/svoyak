// Чистая математика синхронизации позиции медиа. Сервер хранит якорь
// { status, anchorPosition (сек), anchorAt (серверный Date.now()) }; клиент знает
// свою дельту часов до сервера (store.serverTimeDelta из sync:ping).

// Ожидаемая позиция воспроизведения в секундах на «сейчас».
export function expectedPosition(mediaState, serverTimeDelta = 0, now = Date.now()) {
  if (!mediaState) return 0
  const anchor = Number(mediaState.anchorPosition) || 0
  if (mediaState.status !== 'playing') return anchor
  const anchorAt = Number(mediaState.anchorAt) || 0
  if (!anchorAt) return anchor
  return Math.max(0, anchor + (now + serverTimeDelta - anchorAt) / 1000)
}
