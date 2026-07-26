import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { getPlatform, getCall, isAvailable } from '../platform/sdk'

// Мост zustand (SDK) → Pinia (Vue). SDK хранит состояние звонка/друзей в zustand-сторах;
// мы подписываемся на изменения и копируем снапшоты в реактивное состояние Pinia.

const GAME_ID = 'svoyak'
const GAME_NAME = 'Своя игра'
// Имя голосовой комнаты игры. Для kind==='game' у SDK нет беседы, и CallView берёт title как
// `session?.name ?? label`, поэтому в доке хаба звонок читается именно так.
export const CALL_LABEL = 'Лобби Свояк'
// Страховка от бесконечной рассылки инвайтов, если список участников звонка почему-то «дрожит»
const MAX_INVITES = 20
const INVITE_COOLDOWN_MS = 5000

function callSnapshot() {
  const call = getCall()
  if (!call?.getState) return null
  try {
    const s = call.getState()
    return {
      status: s.status || 'idle',
      kind: s.kind || null,
      callKey: s.callKey || null,
      // Непустой, пока этот разговорный звонок служит лобби игры (появился после доработки SDK)
      boundGame: s.boundGame || null,
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
    // Отказ браузера в микрофоне/камере. Отдельно от voice.error (тот про сам звонок):
    // это чинит пользователь у себя в браузере, поэтому текст — инструкция, а не констатация.
    deviceError: null,
    voice: {
      status: 'idle',     // idle | connecting | connected
      kind: null,         // conv | game
      callKey: null,
      boundGame: null,    // { game, room, label } — звонок хаба, служащий лобби этой игры
      participants: [],
      embedded: false,
      error: null
    },
    // Служебное состояние голоса вне реактивности (markRaw): промисы и множества, за которыми UI
    // не следит. joinKey/joinPromise — дедуп параллельных входов, bound — уже сделанные привязки
    // «звонок|комната», invited — кому инвайт уже улетал.
    _ops: markRaw({
      joinKey: null,
      joinPromise: null,
      bound: new Set(),
      invited: new Set(),
      inviteAt: 0,
      inviteCount: 0
    }),
    _unsubs: []
  }),

  getters: {
    voiceConnected: (state) => state.voice.status === 'connected',
    // Микрофон/камера доступны только в защищённом контексте (https/localhost).
    // На голом http (:8089) getUserMedia недоступен — голос не поднять.
    voiceSecure: () => typeof window === 'undefined' || window.isSecureContext !== false,
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

    // Войти в голосовую комнату игры (или привязать к ней текущий групповой звонок хаба).
    // Единственная точка привязки: сюда сходятся вотчеры лобби/игры, кнопки VoiceBar и создание
    // игры в кабинете ведущего, поэтому вход дедуплицируется на двух уровнях (см. ниже).
    async joinVoice(roomCode, { spectator = false, embed = true } = {}) {
      const call = getCall()
      if (!call || !roomCode) return false
      // На незащищённом контексте (http) микрофон недоступен — не поднимаем голос,
      // показываем понятную причину вместо молчаливого «N в голосе» без звука
      if (!this.voiceSecure) {
        this.voice.error = 'Голос доступен только по HTTPS — откройте игру из хаба'
        return false
      }
      const ops = this._ops
      const targetKey = `game:${GAME_ID}:${roomCode}`
      // Дедуп «в полёте»: один и тот же вход, запрошенный дважды почти одновременно, иначе даёт
      // два POST /chat/call/bind (а то и два joinGameRoom с разрывом медиа между ними)
      if (ops.joinKey === targetKey && ops.joinPromise) return ops.joinPromise

      const promise = this._joinVoiceOnce(call, roomCode, targetKey, spectator, embed)
      ops.joinKey = targetKey
      ops.joinPromise = promise
      try {
        return await promise
      } finally {
        if (ops.joinPromise === promise) {
          ops.joinPromise = null
          ops.joinKey = null
        }
      }
    },

    async _joinVoiceOnce(call, roomCode, targetKey, spectator, embed) {
      this.voice.error = null // прошлая неудача не должна блокировать повторный вход
      try {
        const state = call.getState ? call.getState() : {}
        if (state.callKey === targetKey) {
          call.setEmbedded?.(embed)
          return true // уже в нужной комнате
        }
        if (state.kind === 'conv' && state.status === 'connected') {
          // Пришли из группового звонка хаба: алиасим комнату игры на текущий звонок,
          // медиа не переподключается
          const pair = `${state.callKey}|${roomCode}`
          if (this._ops.bound.has(pair)) {
            call.setEmbedded?.(embed)
            return true // эту пару уже привязывали — второй bind ничего не изменит
          }
          const ok = await call.bindToRoom({ game: GAME_ID, room: roomCode, label: CALL_LABEL })
          if (ok) {
            this._ops.bound.add(pair)
            call.setEmbedded?.(embed)
            return true
          }
          // Привязка не удалась. Сознательно НЕ уходим в свой игровой рум: это вырвало бы ведущего
          // из звонка с друзьями (разрыв медиа), а инвайт улетел бы в пустую комнату — приглашённые
          // всё равно резолвятся в game:<id>:<code>, раз маппинга нет. Лучше остаться с компанией
          // и дать повторить попытку кнопкой.
          this.voice.error = 'Не удалось привязать звонок к игре'
          return false
        }
        const ok = await call.joinGameRoom(GAME_ID, roomCode, {
          mic: !spectator,
          label: CALL_LABEL
        })
        if (ok) call.setEmbedded?.(embed)
        return ok
      } catch (e) {
        console.warn('[platform] joinVoice failed:', e)
        this.voice.error = 'Голос недоступен'
        return false
      }
    },

    // Выход из игры не должен ронять звонок: компания продолжает общаться, а звонок просто
    // перестаёт быть звонком этой игры («без игры в нём созвониться можно»). Оборвать медиа
    // можно только явно — hangUp().
    leaveVoice() {
      try {
        const call = getCall()
        call?.setEmbedded?.(false)
        // Снимаем привязку «комната игры → рум этого звонка». Без этого алиас доживал бы свой
        // серверный TTL, и игра, которой позже достался бы тот же код, увела бы своих игроков
        // сюда. boundGame выставлен только у того, кто привязывал, — остальные не дёргают сеть.
        const bound = call?.getState?.()?.boundGame
        if (bound) call.unbindRoom?.({ game: bound.game, room: bound.room })
      } catch { /* ок */ }
      this._resetVoiceOps()
    },

    // Явный выход из звонка (кнопка в VoiceBar) — единственное, что его завершает
    hangUp() {
      try { getCall()?.leave() } catch { /* ок */ }
      this._resetVoiceOps()
    },

    _resetVoiceOps() {
      const o = this._ops
      o.joinKey = null
      o.joinPromise = null
      o.bound.clear()
      o.invited.clear()
      o.inviteAt = 0
      o.inviteCount = 0
    },

    // Микрофон/камера. Ошибку НЕ глотаем: SDK обновляет своё состояние только при успехе,
    // поэтому при отказе в доступе кнопка молча «не работает» — именно так это и выглядело
    // для игроков. Показываем причину и что с ней делать.
    async setMic(on) {
      const err = await this._toggleDevice('setMic', on, 'микрофону')
      if (!err) this.deviceError = null
      return !err
    },
    async setCam(on) {
      const err = await this._toggleDevice('setCam', on, 'камере')
      if (!err) this.deviceError = null
      return !err
    },

    // Возвращает текст ошибки или null. Различаем «запретили» и «нет устройства» —
    // это принципиально разные действия пользователя.
    async _toggleDevice(method, on, what) {
      const call = getCall()
      if (!call) return null
      try {
        await call[method](on)
        return null
      } catch (e) {
        // Выключить устройство обычно не может упасть по правам — не пугаем зря
        if (!on) return null
        const name = e?.name || ''
        const msg = name === 'NotAllowedError' || name === 'SecurityError'
          ? `Браузер не дал доступ к ${what}. Разрешите его в адресной строке (значок 🎥/🎙) и нажмите ещё раз.`
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? `Устройство не найдено: проверьте, подключён ли ${what === 'микрофону' ? 'микрофон' : 'камера'}.`
            : name === 'NotReadableError'
              ? `Устройство занято другой программой — закройте её и попробуйте снова.`
              : `Не удалось включить доступ к ${what}.`
        console.warn(`[platform] ${method} failed:`, e)
        this.deviceError = msg
        return msg
      }
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
      // joinVoice покрывает все три состояния ведущего (уже в игровом звонке / в разговорном звонке
      // хаба / вообще без звонка) и, главное, ДОЖИДАЕТСЯ привязки: иначе приглашённый запросит
      // room-token раньше, чем появится маппинг, и уедет в отдельный рум. Плюс без поднятого звонка
      // inviteToGame — молчаливый no-op (внутри SDK стоит `if (!callRoom) return`).
      if (!(await this.joinVoice(roomCode))) return false
      try {
        call.inviteToGame({
          game: GAME_ID,
          gameName: GAME_NAME,
          room: roomCode,
          // SDK делает new URL(url, location.href); голый origin потерял бы base-путь (/svoyak/)
          // и увёл бы приглашённых на корень хаба вместо игры
          url: window.location.origin + import.meta.env.BASE_URL
        })
        const o = this._ops
        this.voice.participants.forEach(p => o.invited.add(p.accountId))
        o.inviteAt = Date.now()
        o.inviteCount++
        return true
      } catch (e) {
        console.warn('[platform] invitePartyToGame failed:', e)
        return false
      }
    },

    // Кто-то вошёл в звонок ПОСЛЕ рассылки инвайтов — он её не видел: pendingInvite ставится только
    // из живого события LiveKit (DataReceived), истории у канала нет. Досылаем.
    // rosterIds — платформенные id тех, кто уже в игре (их звать не надо).
    async inviteNewcomers(roomCode, rosterIds) {
      const o = this._ops
      if (!this.voiceConnected || !roomCode) return false
      if (Date.now() - o.inviteAt < INVITE_COOLDOWN_MS) return false
      if (o.inviteCount >= MAX_INVITES) return false
      const outsiders = this.voice.participants.filter(p =>
        !p.isLocal && !o.invited.has(p.accountId) && !rosterIds.has(p.accountId))
      if (!outsiders.length) return false
      // Рассылка широковещательная (адресной в SDK нет), но это никого не потревожит: CallView
      // показывает баннер только при embedded===false, т.е. лишь тем, кто сидит в хабе.
      return this.invitePartyToGame(roomCode)
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

    // Возврат в хаб (в SDK нет метода — уходим по URL хаба)
    returnToHub() {
      const url = import.meta.env.VITE_HUB_URL || 'https://mygame-quiz.ru'
      window.location.href = url
    },

    dispose() {
      this._unsubs.forEach(u => { try { u() } catch { /* ок */ } })
      this._unsubs = []
    }
  }
})
