// Тонкий слой доступа к SDK платформы MyGame Hub (window.mygame из vendored IIFE-сборки).
// Всё написано защитно: без SDK или без части его API (mygame.call появится после
// доработки SDK в репозитории gamehub) игра полностью работоспособна.

export function getPlatform() {
  return (typeof window !== 'undefined' && window.mygame) || null
}

export function isAvailable() {
  return !!getPlatform()
}

// Слой переносных звонков (появится в SDK после наряда gamehub)
export function getCall() {
  return getPlatform()?.call || null
}

export function platformUrls() {
  const hubUrl = import.meta.env.VITE_HUB_URL
  if (hubUrl) return { hubUrl }
  if (import.meta.env.DEV) {
    return {
      authUrl: 'http://localhost:8081',
      socialUrl: 'http://localhost:8083',
      chatUrl: 'http://localhost:8084',
      communityUrl: 'http://localhost:8085'
    }
  }
  // Прод: сервисы платформы за одним ориджином хаба
  return { hubUrl: 'https://mygame-quiz.ru' }
}

// Принять платформенную сессию, полученную нашим сервером через /auth/platform-bridge.
// Если SDK уже умеет adoptSession — используем его; иначе шим: пишем сессию напрямую
// в localStorage под ключом SDK (civa.session, см. packages/sdk/src/authClient.ts) ДО init().
export function adoptPlatformSession(session) {
  if (!session || !session.accountId || !session.accessToken) return false
  const platform = getPlatform()
  if (platform?.auth?.adoptSession) {
    platform.auth.adoptSession(session)
    return true
  }
  try {
    localStorage.setItem('civa.session', JSON.stringify({
      accountId: session.accountId,
      displayName: session.displayName,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    }))
    return true
  } catch {
    return false
  }
}

let initialized = false
export function initSdk() {
  const platform = getPlatform()
  if (!platform || initialized) return initialized
  try {
    platform.init('svoyak', platformUrls())
    initialized = true
  } catch (e) {
    console.warn('[platform] mygame.init failed:', e)
  }
  return initialized
}
