// Загрузочная логика платформы MyGame Hub. Вызывается из main.js до mount.
// Контракт запуска из хаба: ?pt=<handoff>&join=<код>[&spectate=1][&call=game:svoyak:<код>]
// ?pt/?join/?spectate парсим и стираем здесь; ?call НЕ трогаем — его заберёт resume()
// внутри mygame.init() (SDK сам вычистит параметр).

import { adoptPlatformSession, initSdk } from './sdk'
import { usePlatformStore } from '../stores/platform'
import { useGameStore } from '../stores/game'

// Намерение входа в комнату из URL — используется после авторизации
export const joinIntent = { code: null, spectate: false }

export async function bootPlatform(router) {
  const game = useGameStore()
  const platform = usePlatformStore()

  // 1. Парсим и стираем pt/join/spectate из адресной строки
  let pt = null
  try {
    const url = new URL(window.location.href)
    pt = url.searchParams.get('pt')
    const join = url.searchParams.get('join')
    const spectate = url.searchParams.get('spectate')
    if (join) joinIntent.code = join.toUpperCase()
    if (spectate === '1' || spectate === 'true') {
      joinIntent.spectate = true
      platform.spectateIntent = true
    }
    if (pt || join || spectate) {
      url.searchParams.delete('pt')
      url.searchParams.delete('join')
      url.searchParams.delete('spectate')
      window.history.replaceState({}, '', url.toString())
    }
  } catch { /* некорректный URL — работаем дальше */ }

  // 2. Гасим handoff-токен на нашем сервере (одно погашение, серверный мост)
  if (pt) {
    try {
      const res = await fetch(`${game.API_URL}/auth/platform-bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pt }),
        // Без таймаута зависший upstream оставил бы пользователя на белом экране
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) {
        const data = await res.json()
        game.token = data.token
        game.user = data.user
        localStorage.setItem('token', data.token)
        // Отдаём платформенную сессию SDK (до init, чтобы сокеты подключились уже с ней)
        if (data.platformSession) adoptPlatformSession(data.platformSession)
      } else {
        platform.platformAuthError = res.status === 403
          ? 'Сессия платформы истекла — запустите игру из хаба ещё раз или войдите вручную.'
          : 'Платформа недоступна — войдите вручную.'
      }
    } catch {
      platform.platformAuthError = 'Платформа недоступна — войдите вручную.'
    }
  }

  // 3. Инициализируем SDK (оверлей, сокеты, resume звонка) и мост zustand→Pinia
  initSdk()
  platform.init()

  // 4. Автопереход в комнату, если есть намерение и сессия
  if (joinIntent.code) {
    try {
      if (!game.user && game.token) await game.fetchMe()
      if (game.user) {
        await game.checkRoom(joinIntent.code)
        router.push({ name: 'lobby', params: { id: game.roomCode } })
      }
      // без сессии останемся на HomeView; joinIntent подхватится после ручного входа
    } catch { /* комната не найдена — остаёмся на главной */ }
  }
}
