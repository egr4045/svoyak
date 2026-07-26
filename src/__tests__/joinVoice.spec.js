import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// SDK подменяем целиком: нас интересует не LiveKit, а решение «привязать текущий звонок
// или уйти в свою комнату», которое принимает joinVoice.
const call = { getState: () => ({}), bindToRoom: vi.fn(), joinGameRoom: vi.fn(), setEmbedded: vi.fn() }
vi.mock('../platform/sdk', () => ({
  getPlatform: () => ({}),
  getCall: () => call,
  isAvailable: () => true
}))

const { usePlatformStore } = await import('../stores/platform')

/** Отдаёт 'connecting' первые `ticks` опросов, затем финальное состояние — так ведёт себя SDK,
 *  пока resume() договаривается с сервером. */
function connectingThen(ticks, final) {
  let n = 0
  return () => (n++ < ticks ? { status: 'connecting', kind: 'conv', callKey: null } : final)
}

describe('joinVoice: вход в звонок игры', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    call.bindToRoom = vi.fn().mockResolvedValue(true)
    call.joinGameRoom = vi.fn().mockResolvedValue(true)
    call.setEmbedded = vi.fn()
    call.getState = () => ({})
  })

  // Регрессия: и init(), и adoptSession() дёргают resume(), поэтому на старте страницы звонок
  // почти всегда «в полёте». Решив по такому состоянию, игра уходила ВТОРЫМ соединением в свою
  // комнату: у себя «звонок есть», а компания оставалась в прежнем руме без нас.
  it('дожидается, пока звонок хаба договорится, и привязывает его вместо нового', async () => {
    const p = usePlatformStore()
    call.getState = connectingThen(3, { status: 'connected', kind: 'conv', callKey: 'conv:42' })

    const ok = await p.joinVoice('ROOM1')

    expect(ok).toBe(true)
    expect(call.bindToRoom).toHaveBeenCalledWith({ game: 'svoyak', room: 'ROOM1', label: expect.any(String) })
    expect(call.joinGameRoom).not.toHaveBeenCalled()
  })

  it('без активного звонка хаба поднимает свою комнату игры', async () => {
    const p = usePlatformStore()
    call.getState = () => ({ status: 'idle', kind: null, callKey: null })

    expect(await p.joinVoice('ROOM2')).toBe(true)
    expect(call.joinGameRoom).toHaveBeenCalledWith('svoyak', 'ROOM2', expect.objectContaining({ mic: true }))
    expect(call.bindToRoom).not.toHaveBeenCalled()
  })

  it('наблюдатель входит с выключенным микрофоном', async () => {
    const p = usePlatformStore()
    call.getState = () => ({ status: 'idle' })

    await p.joinVoice('ROOM3', { spectator: true })
    expect(call.joinGameRoom).toHaveBeenCalledWith('svoyak', 'ROOM3', expect.objectContaining({ mic: false }))
  })

  it('уже в нужной комнате — ничего не переподключаем', async () => {
    const p = usePlatformStore()
    call.getState = () => ({ status: 'connected', kind: 'game', callKey: 'game:svoyak:ROOM4' })

    expect(await p.joinVoice('ROOM4')).toBe(true)
    expect(call.joinGameRoom).not.toHaveBeenCalled()
    expect(call.bindToRoom).not.toHaveBeenCalled()
    expect(call.setEmbedded).toHaveBeenCalledWith(true)
  })

  it('на http не лезет в звонок, а объясняет причину', async () => {
    // voiceSecure — геттер над window.isSecureContext, поэтому подменяем сам контекст
    const prev = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const p = usePlatformStore()

    expect(await p.joinVoice('ROOM5')).toBe(false)
    expect(call.joinGameRoom).not.toHaveBeenCalled()
    expect(p.voice.error).toMatch(/HTTPS/)
    if (prev) Object.defineProperty(window, 'isSecureContext', prev)
    else delete window.isSecureContext
  })
})
