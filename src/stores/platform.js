import { defineStore } from 'pinia'
import { getPlatform, getCall, isAvailable } from '../platform/sdk'

// Мост zustand (SDK) → Pinia (Vue). SDK хранит состояние звонка/друзей в zustand-сторах;
// мы подписываемся на изменения и копируем снапшоты в реактивное состояние Pinia.

const GAME_ID = 'svoyak'
const GAME_NAME = 'Своя игра'

function callSnapshot() {
  const call = getCall()
  if (!call?.getState) return null
  try {
    const s = call.getState()
    return {
      status: s.status || 'idle',
      kind: s.kind || null,
      callKey: s.callKey || null,
      embedded: !!s.embedded,
      error: s.error || null,
      pendingInvite: s.pendingInvite || null,
      participants: (s.participants || []).map(p => ({
        accountId: p.accountId,
        name: p.name,
        isLocal: !!p.isLocal,
        micOn: !!p.micOn,
        camOn: !!p.camOn,
        screenOn: !!p.screenOn,
        speaking: !!p.speaking,
        volume: typeof p.volume === 'number' ? p.volume : 1,
        muted: !!p.muted
      }))
    }
  } catch {
    return null
  }
}

export const usePlatformStore = defineStore('platform', {
  state: () => ({
    available: false,     // window.mygame загружен
    sdkReady: false,      // mygame.init выполнен
    voiceSupported: false, // mygame.call существует (после наряда gamehub)
    me: null,             // { accountId, displayName } из social.getMe()
    spectateIntent: false, // пришли по ?spectate=1
    platformAuthError: null, // текст ошибки моста для HomeView
    voice: {
      status: 'idle',     // idle | connecting | connected
      kind: null,         // conv | game
      callKey: null,
      participants: [],
      embedded: false,
      error: null
    },
    _unsubs: []
  }),

  getters: {
    voiceConnected: (state) => state.voice.status === 'connected',
    // Участник звонка по платформенному accountId (для карточек игроков)
    participantFor: (state) => (platformId) => {
      if (!platformId) return null
      return state.voice.participants.find(p => p.accountId === platformId) || null
    },
    localParticipant: (state) => state.voice.participants.find(p => p.isLocal) || null
  },

  actions: {
    // Вызывается из boot.js после initSdk()
    init() {
      this.available = isAvailable()
      if (!this.available) return
      const platform = getPlatform()
      this.sdkReady = true
      this.voiceSupported = !!getCall()

      // Подписка на социальный стор (me: { accountId, displayName, avatarIcon, ... })
      try {
        const syncMe = () => { this.me = platform.social.getMe() || null }
        syncMe()
        const unsubSocial = platform.social.subscribe(() => syncMe())
        if (typeof unsubSocial === 'function') this._unsubs.push(unsubSocial)
      } catch { /* social недоступен — не критично */ }

      // Подписка на стор звонков
      if (this.voiceSupported) {
        const syncCall = () => {
          const snap = callSnapshot()
          if (snap) {
            this.voice = { ...this.voice, ...snap }
          }
        }
        syncCall()
        try {
          const unsubCall = getCall().subscribe(() => syncCall())
          if (typeof unsubCall === 'function') this._unsubs.push(unsubCall)
        } catch { /* без подписки обойдёмся */ }
      }
    },

    // Войти в голосовую комнату игры (или привязать к ней текущий групповой звонок хаба)
    async joinVoice(roomCode, { spectator = false } = {}) {
      const call = getCall()
      if (!call || !roomCode) return false
      this.voice.error = null // прошлая неудача не должна блокировать повторный вход
      const targetKey = `game:${GAME_ID}:${roomCode}`
      try {
        const state = call.getState ? call.getState() : {}
        if (state.callKey === targetKey) {
          call.setEmbedded?.(true)
          return true // уже в нужной комнате
        }
        if (state.kind === 'conv' && state.status === 'connected') {
          // Пришли из группового звонка хаба: алиасим комнату игры на текущий звонок,
          // медиа не переподключается
          const ok = await call.bindToRoom({ game: GAME_ID, room: roomCode })
          if (ok) {
            call.setEmbedded?.(true)
            return true
          }
        }
        const ok = await call.joinGameRoom(GAME_ID, roomCode, {
          mic: !spectator,
          label: `Комната ${roomCode}`
        })
        if (ok) call.setEmbedded?.(true)
        return ok
      } catch (e) {
        console.warn('[platform] joinVoice failed:', e)
        this.voice.error = 'Голос недоступен'
        return false
      }
    },

    leaveVoice() {
      try {
        const call = getCall()
        if (!call) return
        const state = call.getState ? call.getState() : {}
        // Рвём только игровые звонки: разговорный звонок хаба (партия),
        // к которому комната была лишь привязана, должен пережить выход из игры
        if (state.kind === 'game') call.leave()
      } catch { /* ок */ }
    },

    async setMic(on) {
      try { await getCall()?.setMic(on) } catch { /* ок */ }
    },
    async setCam(on) {
      try { await getCall()?.setCam(on) } catch { /* ок */ }
    },
    setVolume(accountId, v) {
      try { getCall()?.setVolume(accountId, v) } catch { /* ок */ }
    },
    setLocalMuted(accountId, muted) {
      try { getCall()?.setMuted(accountId, muted) } catch { /* ок */ }
    },

    // Смонтировать камеру участника в DOM-узел; возвращает функцию отсоединения
    attachVideo(accountId, el) {
      try {
        const detach = getCall()?.attachVideo(accountId, el)
        return typeof detach === 'function' ? detach : () => {}
      } catch {
        return () => {}
      }
    },

    // Ведущий: позвать всех участников текущего звонка в игру.
    // true = приглашение ушло и медиа-комнаты совпадут
    async invitePartyToGame(roomCode) {
      const call = getCall()
      if (!call || !roomCode) return false
      try {
        const state = call.getState ? call.getState() : {}
        if (state.kind === 'conv' && state.status === 'connected') {
          // Сначала привязываем комнату игры к звонку и ЖДЁМ результата —
          // иначе приглашённые попадут в медиа-комнату без позвавшего
          const bound = await call.bindToRoom({ game: GAME_ID, room: roomCode })
          if (!bound) return false
        }
        call.inviteToGame({
          game: GAME_ID,
          gameName: GAME_NAME,
          room: roomCode,
          url: window.location.origin
        })
        return true
      } catch (e) {
        console.warn('[platform] invitePartyToGame failed:', e)
        return false
      }
    },

    // Статус «Играет в Свояк · Присоединиться» для друзей в хабе
    setActivity(roomCode) {
      const platform = getPlatform()
      if (!platform || !this.sdkReady) return
      try {
        platform.social.setActivity(roomCode
          ? { game: GAME_ID, gameName: GAME_NAME, room: String(roomCode), joinable: true }
          : null)
      } catch { /* ок */ }
    },

    openChatWith(platformId, name) {
      try { getPlatform()?.chat.openWithUser(platformId, name) } catch { /* ок */ }
    },
    addFriend(platformId) {
      try { getPlatform()?.social.addByCode(platformId) } catch { /* ок */ }
    },
    toast(text) {
      // ToastData SDK: { type: 'message'|'achievement'|'system', title, content }
      try { getPlatform()?.ui.toast({ type: 'system', title: 'Своя игра', content: text }) } catch { /* ок */ }
    },

    dispose() {
      this._unsubs.forEach(u => { try { u() } catch { /* ок */ } })
      this._unsubs = []
    }
  }
})
