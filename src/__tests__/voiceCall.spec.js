// @vitest-environment jsdom
// Голосовой слой лобби: привязка звонка к комнате, дедуп входов, рассылка инвайтов.
// Стабим window.mygame.call — реальный SDK тут не нужен, нас интересует наша логика вокруг него.

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore, CALL_LABEL } from '../stores/platform'

// Управляемый фейк слоя звонков SDK
function makeCall(initialState = {}) {
  const calls = { bind: [], unbind: [], join: [], invite: [], embedded: [], leave: 0 }
  let state = { status: 'idle', kind: null, callKey: null, participants: [], ...initialState }
  return {
    calls,
    setState: (patch) => { state = { ...state, ...patch } },
    getState: () => state,
    subscribe: () => () => {},
    bindToRoom: vi.fn(async (t) => { calls.bind.push(t); return calls.bindResult !== false }),
    unbindRoom: vi.fn(async (t) => { calls.unbind.push(t); return true }),
    joinGameRoom: vi.fn(async (g, r, o) => { calls.join.push([g, r, o]); return true }),
    inviteToGame: vi.fn((i) => { calls.invite.push(i) }),
    setEmbedded: vi.fn((e) => { calls.embedded.push(e) }),
    leave: vi.fn(() => { calls.leave++ }),
    setMic: vi.fn(), setCam: vi.fn()
  }
}

function install(call) {
  window.mygame = {
    call,
    init: vi.fn(),
    social: { getMe: () => ({ accountId: 'me', displayName: 'Я' }), subscribe: () => () => {}, setActivity: vi.fn() },
    ui: { toast: vi.fn() },
    chat: {}
  }
}

// Стор читает воображаемый список участников из своего snapshot-моста; в тестах ставим напрямую
function setParticipants(store, list) {
  store.voice.participants = list
  store.voice.status = 'connected'
}

beforeEach(() => {
  setActivePinia(createPinia())
  delete window.mygame
})

describe('joinVoice: привязка и дедупликация', () => {
  test('без звонка — поднимает свой игровой рум с именем «Лобби Свояк»', async () => {
    const call = makeCall()
    install(call)
    const store = usePlatformStore()

    expect(await store.joinVoice('ABCD123456')).toBe(true)
    expect(call.calls.bind).toHaveLength(0)
    expect(call.calls.join).toEqual([['svoyak', 'ABCD123456', { mic: true, label: CALL_LABEL }]])
    expect(call.calls.embedded).toContain(true)
  })

  test('наблюдатель входит с выключенным микрофоном', async () => {
    const call = makeCall()
    install(call)
    const store = usePlatformStore()

    await store.joinVoice('ABCD123456', { spectator: true })
    expect(call.calls.join[0][2].mic).toBe(false)
  })

  test('из группового звонка хаба — привязывает, не переподключая медиа', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    install(call)
    const store = usePlatformStore()

    expect(await store.joinVoice('ABCD123456')).toBe(true)
    // Имя едет вместе с привязкой: у ведущего kind==='conv', и без label док хаба показал бы
    // название беседы вместо «Лобби Свояк»
    expect(call.calls.bind).toEqual([{ game: 'svoyak', room: 'ABCD123456', label: CALL_LABEL }])
    expect(call.calls.join).toHaveLength(0) // медиа не трогали
  })

  test('два параллельных входа дают ровно один bind', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    install(call)
    const store = usePlatformStore()

    const [a, b] = await Promise.all([store.joinVoice('ABCD123456'), store.joinVoice('ABCD123456')])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(call.calls.bind).toHaveLength(1)
  })

  test('повторный вход после успеха не биндит заново', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    install(call)
    const store = usePlatformStore()

    await store.joinVoice('ABCD123456')
    await store.joinVoice('ABCD123456')
    expect(call.calls.bind).toHaveLength(1)
    expect(call.calls.join).toHaveLength(0)
  })

  test('неудачный bind не выдёргивает ведущего из звонка с друзьями', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    call.calls.bindResult = false
    install(call)
    const store = usePlatformStore()

    expect(await store.joinVoice('ABCD123456')).toBe(false)
    expect(call.calls.join).toHaveLength(0) // не ушли в свой рум
    expect(store.voice.error).toBeTruthy()
  })
})

describe('invitePartyToGame', () => {
  test('сначала bind, потом invite, url несёт base-путь', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    install(call)
    const store = usePlatformStore()

    expect(await store.invitePartyToGame('ABCD123456')).toBe(true)
    expect(call.bindToRoom.mock.invocationCallOrder[0])
      .toBeLessThan(call.inviteToGame.mock.invocationCallOrder[0])
    const invite = call.calls.invite[0]
    expect(invite).toMatchObject({ game: 'svoyak', room: 'ABCD123456' })
    expect(invite.url.endsWith(import.meta.env.BASE_URL)).toBe(true)
  })

  test('если bind не удался — инвайт не уходит', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    call.calls.bindResult = false
    install(call)
    const store = usePlatformStore()

    expect(await store.invitePartyToGame('ABCD123456')).toBe(false)
    expect(call.calls.invite).toHaveLength(0)
  })
})

describe('inviteNewcomers: досылка опоздавшим', () => {
  test('молчит, когда все участники звонка уже в игре', async () => {
    const call = makeCall({ kind: 'game', status: 'connected', callKey: 'game:svoyak:ABCD123456' })
    install(call)
    const store = usePlatformStore()
    setParticipants(store, [{ accountId: 'me', isLocal: true }, { accountId: 'p1' }])

    expect(await store.inviteNewcomers('ABCD123456', new Set(['p1']))).toBe(false)
    expect(call.calls.invite).toHaveLength(0)
  })

  test('зовёт незнакомца и не повторяется на нём же', async () => {
    const call = makeCall({ kind: 'game', status: 'connected', callKey: 'game:svoyak:ABCD123456' })
    install(call)
    const store = usePlatformStore()
    setParticipants(store, [{ accountId: 'me', isLocal: true }, { accountId: 'guest' }])

    expect(await store.inviteNewcomers('ABCD123456', new Set())).toBe(true)
    expect(call.calls.invite).toHaveLength(1)
    // повторный вызов — тот же состав, плюс кулдаун
    expect(await store.inviteNewcomers('ABCD123456', new Set())).toBe(false)
    expect(call.calls.invite).toHaveLength(1)
  })
})

describe('жизнь звонка после игры', () => {
  test('leaveVoice не рвёт звонок, hangUp рвёт', () => {
    const call = makeCall({ kind: 'game', status: 'connected', callKey: 'game:svoyak:ABCD123456' })
    install(call)
    const store = usePlatformStore()

    store.leaveVoice()
    expect(call.calls.leave).toBe(0)
    expect(call.calls.embedded).toContain(false)

    store.hangUp()
    expect(call.calls.leave).toBe(1)
  })

  test('выход из игры снимает привязку, чтобы код не увёл чужих в этот звонок', () => {
    const call = makeCall({
      kind: 'conv', status: 'connected', callKey: 'conv:c1',
      boundGame: { game: 'svoyak', room: 'ABCD123456', label: CALL_LABEL }
    })
    install(call)
    const store = usePlatformStore()

    store.leaveVoice()
    expect(call.calls.unbind).toEqual([{ game: 'svoyak', room: 'ABCD123456' }])
    expect(call.calls.leave).toBe(0) // но сам звонок жив
  })

  test('кто не привязывал — сеть не дёргает', () => {
    const call = makeCall({ kind: 'game', status: 'connected', callKey: 'game:svoyak:ABCD123456' })
    install(call)
    const store = usePlatformStore()

    store.leaveVoice()
    expect(call.calls.unbind).toHaveLength(0)
  })

  test('после leaveVoice повторная привязка снова возможна', async () => {
    const call = makeCall({ kind: 'conv', status: 'connected', callKey: 'conv:c1' })
    install(call)
    const store = usePlatformStore()

    await store.joinVoice('ABCD123456')
    store.leaveVoice()
    await store.joinVoice('ABCD123456')
    expect(call.calls.bind).toHaveLength(2) // память о привязке сброшена
  })
})
