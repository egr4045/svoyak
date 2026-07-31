import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/game'
import PlayerPanel from '../components/PlayerPanel.vue'

// Тестовый режим отличается от обычной игры ровно одним признаком — isBot у участников.
// Признак едет внутри уже зеркалируемых players/host, поэтому новых broadcast-ключей нет
// и BROADCAST_KEYS в сторе трогать не пришлось. Тут это и проверяем.

vi.mock('../lib/confetti', () => ({ rain: () => {}, burst: () => {}, fireworks: () => {} }))
vi.mock('../lib/sfx', () => ({ playSfx: () => {}, preloadSfx: () => {} }))

describe('признак тестовой комнаты', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('обычная комната тестовой не считается', () => {
    const store = useGameStore()
    store.$patch({
      host: { id: 1, username: 'Хост' },
      players: [{ id: 2, name: 'Аня' }, { id: 3, name: 'Боря' }]
    })
    expect(store.isTestRoom).toBe(false)
  })

  it('бот-ведущий делает комнату тестовой', () => {
    const store = useGameStore()
    store.$patch({ host: { id: 'bot:host', username: 'Ведущий-бот', isBot: true }, players: [] })
    expect(store.isTestRoom).toBe(true)
  })

  it('бот среди игроков делает комнату тестовой', () => {
    const store = useGameStore()
    store.$patch({
      host: { id: 1, username: 'Хост' },
      players: [{ id: 2, name: 'Аня' }, { id: 'bot:p1', name: 'Лиса', isBot: true }]
    })
    expect(store.isTestRoom).toBe(true)
  })
})

describe('createTestRoom', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => { vi.unstubAllGlobals() })

  function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ roomCode: 'ABCDE12345' })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('шлёт место и пак, запоминает код комнаты', async () => {
    const fetchMock = stubFetch()
    const store = useGameStore()
    const code = await store.createTestRoom('builtin:test', 'host')

    expect(code).toBe('ABCDE12345')
    expect(store.roomCode).toBe('ABCDE12345')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/rooms\/test$/)
    expect(JSON.parse(init.body)).toEqual({ seat: 'host', packId: 'builtin:test' })
  })

  it('неизвестное место схлопывается в «игрок», срез вопроса уходит как есть', async () => {
    const fetchMock = stubFetch()
    const store = useGameStore()
    await store.createTestRoom('pack-1', 'кто-нибудь', { r: 0, c: 1, q: 2 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body))
      .toEqual({ seat: 'player', packId: 'pack-1', only: { r: 0, c: 1, q: 2 } })
  })

  it('ошибка сервера превращается в понятное исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const store = useGameStore()
    await expect(store.createTestRoom('builtin:test', 'player')).rejects.toThrow(/тестовую игру/)
  })
})

describe('маркировка ботов в панели игроков', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('🤖 стоит только у бота, живого игрока не помечает', () => {
    const store = useGameStore()
    store.$patch({
      host: { id: 1, username: 'Хост' }, user: { id: 9, username: 'Тестер' },
      questionStatus: 'idle', gameStarted: true, spectators: [],
      players: [
        { id: 9, name: 'Тестер', score: 0, connected: true },
        { id: 'bot:p1', name: 'Лиса', score: 0, connected: true, isBot: true }
      ]
    })
    const wrapper = mount(PlayerPanel, { global: { stubs: { PlayerVideo: true, MonitorPlay: true } } })
    const text = wrapper.text()
    expect(text).toContain('Лиса')
    expect(text).toContain('Тестер')
    expect((text.match(/🤖/g) || []).length).toBe(1)
  })
})
