import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import { usePlatformStore } from './platform'
import { activeMediaTime } from '../lib/mediaBus'

// Доп-поля стейта для новых типов-мини-игр. Держим их списком, чтобы gameStateUpdated
// копировал любое из них без правки под каждый тип (см. цикл в initSocket).
function extraStateDefaults() {
  return {
    performerId: null, performResult: null,          // караоке/крокодил/алиас
    numberGuesses: {}, numberReveal: null,            // угадай число
    tierRatings: {}, tierMedians: null, tierResults: null, tierSubmitted: [], // тир-лист
    potatoRing: [], potatoTurnId: null, potatoResult: null,                    // картошка
    potatoFizzing: false, potatoFizzEndsAt: null,                              // окно «шипения» перед взрывом
    reactionGrid: null, reactionRule: null, reactionWinnerId: null, reactionDone: false,
    reactionMisses: {}, reactionEndsAt: null,        // реакция: публичные промахи + дедлайн
    whoSaidCount: 0, whoSaidAnswers: null, whoSaidGuesses: {}, whoSaidResult: null,       // кто сказал
    duelState: null,                                  // камень-ножницы
    aliasState: null, aliasResult: null,              // алиас
    snippetLevel: 0                                   // угадай по фрагменту
  }
}
const EXTRA_STATE_KEYS = Object.keys(extraStateDefaults())

// Ключи слим-бродкаста gameStateUpdated (без roundsData — тот приходит отдельно при join/reset)
const BROADCAST_KEYS = [
  'host', 'gameStarted', 'roundsCount', 'currentRoundIndex', 'board', 'players', 'spectators',
  'maxPlayers', 'activeCell', 'showAnswer', 'questionStatus', 'answeringPlayerId',
  'selectingPlayerId', 'highlightedQuestion', 'failedPlayers', 'activeBet', 'glitchSeed',
  'textAnswers', 'sketchAnswers', 'sketchVotes', 'imposterId', 'amongUsTimerState',
  'amongUsResult', 'amongUsVotes', 'mediaState', 'revealedTextAnswers', 'auctionBets',
  'catTargetId', 'auctionTiePlayers', 'eventLog', 'buzzerResults', 'voiceMode'
]

export const useGameStore = defineStore('game', {
  state: () => ({
    // Auth & API
    token: localStorage.getItem('token') || null,
    user: null, // { id, username, avatar }
    roomCode: null,
    // В проде игру отдаёт шлюз хаба на суб-пути (base '/svoyak/'), поэтому API_URL и
    // сокет должны нести этот префикс (Caddy его стрипает, сервер остаётся на root).
    API_URL: import.meta.env.VITE_API_URL || (import.meta.env.DEV
      ? 'http://localhost:3000'
      : window.location.origin + (import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, ''))),
    
    // Socket
    socket: null,
    connected: false,
    
    // Game State
    host: null,
    gameStarted: false,
    roundsData: [],   // приходит ТОЛЬКО при room:join (полный стейт) и resetGame — см. слим-бродкаст
    roundsCount: 0,   // в слим-стейте вместо всего пака
    currentRoundIndex: 0,
    board: [],
    players: [],
    spectators: [],
    maxPlayers: 8,
    activeCell: null,
    showAnswer: false,
    questionStatus: 'idle',
    answeringPlayerId: null,
    selectingPlayerId: null,
    highlightedQuestion: null,
    failedPlayers: [],
    activeBet: null,
    glitchSeed: null,
    textAnswers: {},
    sketchAnswers: {},
    sketchVotes: {},
    imposterId: null,
    amongUsVotes: {},
    amongUsResult: null,
    amongUsTimerState: null,
    mediaState: { status: 'stopped', currentTime: 0 },
    revealedTextAnswers: false,
    auctionBets: {},
    catTargetId: null,
    auctionTiePlayers: [],
    eventLog: [],
    buzzerResults: [],
    voiceMode: 'auto', // режиссура голоса: 'auto' | 'open' | 'silent' (см. server/game/GameState.js)
    // Синхронизация медиа: оценка дельты часов клиент↔сервер (sync:ping).
    // Активный медиаэлемент живёт вне стора — см. src/lib/mediaBus.js
    serverTimeDelta: 0,
    // Шина приколов ведущего: последнее транзиентное событие (EffectsOverlay вотчит seq)
    funEvent: null, // { seq, kind: 'sound'|'effect'|'roulette', ...payload }
    // Приватный/запечатанный показ (караоке/крокодил/алиас): секрет НЕ приходит в
    // gameStateUpdated, а адресным событием 'privateReveal' только исполнителю и ведущему
    privateReveal: null,
    ...extraStateDefaults()
  }),

  getters: {
    currentQuestion: (state) => {
      if (!state.activeCell || !state.board || !state.board.length) return null
      return state.board[state.activeCell.catIdx].questions[state.activeCell.qIdx]
    },
    currentCategoryName: (state) => {
      if (!state.activeCell || !state.board || !state.board.length) return ''
      return state.board[state.activeCell.catIdx].category
    },
    isSpectator: (state) => {
      if (!state.user) return false
      return state.spectators.some(s => String(s.id) === String(state.user.id))
    },
    seatsFree: (state) => Math.max(0, state.maxPlayers - state.players.length),
    // Тестовый прогон определяем по самим участникам: isBot едет внутри уже зеркалируемых
    // players/host, поэтому новый broadcast-ключ (и риск рассинхрона BROADCAST_KEYS) не нужен.
    isTestRoom: (state) => !!state.host?.isBot || state.players.some(p => p.isBot),
    // Единый поиск участника по id (игрок ИЛИ наблюдатель) — используется в
    // Question-компонентах (Poker/Sketch и новых типах). Раньше вызывался, но не был определён.
    getPlayerById: (state) => (id) =>
      state.players.find(p => String(p.id) === String(id)) ||
      state.spectators.find(s => String(s.id) === String(id)) || null
  },

  actions: {
    // Вход в игру — только через платформу MyGame Hub (см. src/platform/boot.js:
    // POST /auth/platform-bridge). Локальных login/register/guest в клиенте нет.

    async fetchMe() {
      if (!this.token) return;
      try {
        const res = await fetch(`${this.API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (!res.ok) throw new Error('Invalid token');
        const data = await res.json();
        this.user = data.user;
      } catch (e) {
        this.logout();
      }
    },

    logout() {
      // Уходим из голосовой комнаты и чистим статус активности,
      // но НЕ трогаем платформенную сессию хаба — она переживает выход из комнаты
      try {
        const platform = usePlatformStore();
        platform.leaveVoice();
        platform.setActivity(null);
        platform.spectateIntent = false;
      } catch { /* платформа не инициализирована — ок */ }
      this.token = null;
      this.user = null;
      this.roomCode = null;
      localStorage.removeItem('token');
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
    },

    // Сообщаем серверу платформенный аватар игрока (сам о себе), чтобы он показывался
    // на карточках у всех. Своей загрузки аватара больше нет — берём из профиля хаба.
    reportAvatar() {
      try {
        const platform = usePlatformStore();
        const icon = platform.me?.avatarIcon;
        if (this.socket && icon) this.socket.emit('player:setAvatar', { avatar: icon });
      } catch { /* платформа не готова — ок */ }
    },

    async createRoom(maxPlayers, packId) {
      const res = await fetch(`${this.API_URL}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ maxPlayers: maxPlayers || 8, ...(packId ? { packId } : {}) })
      });
      if (!res.ok) throw new Error('Create room failed');
      const data = await res.json();
      this.roomCode = data.roomCode;
      return this.roomCode;
    },

    // Тестовый прогон: комната с ботами. seat — на чьё место садится тестер ('player' —
    // ведущий тоже бот). only ({r,c,q}) режет пак до одного вопроса (кнопка ▶ в редакторе).
    async createTestRoom(packId, seat, only) {
      const res = await fetch(`${this.API_URL}/api/rooms/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ seat: seat === 'host' ? 'host' : 'player', ...(packId ? { packId } : {}), ...(only ? { only } : {}) })
      });
      if (!res.ok) throw new Error('Не удалось запустить тестовую игру');
      const data = await res.json();
      this.roomCode = data.roomCode;
      return this.roomCode;
    },

    async checkRoom(code) {
      const res = await fetch(`${this.API_URL}/api/rooms/${code}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) throw new Error('Комната не найдена');
      const data = await res.json();
      this.roomCode = data.roomCode;
      return data;
    },

    initSocket() {
      if (!this.token) return;
      if (this.socket) return;

      // socket.io: путь в URL трактуется как namespace, поэтому суб-путь задаём через `path`.
      // dev → origin=localhost:3000, path=/socket.io/; прод → origin, path=/svoyak/socket.io/.
      const socketOrigin = import.meta.env.DEV ? this.API_URL : window.location.origin;
      const socketPath = import.meta.env.BASE_URL + 'socket.io/';
      this.socket = io(socketOrigin, {
        path: socketPath,
        auth: { token: this.token }
      });
      
      this.socket.on('connect', () => {
        this.connected = true;
        this.syncServerClock();
        if (this.roomCode) {
          let spectate = false;
          try {
            const platform = usePlatformStore();
            spectate = platform.spectateIntent;
            // Намерение одноразовое: дальше роль хранит сервер (реджойн её не меняет),
            // а следующая комната не должна унаследовать «наблюдателя»
            platform.spectateIntent = false;
          } catch { /* ок */ }
          this.socket.emit('room:join', this.roomCode, { spectate });
          this.reportAvatar();
        }
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });

      this.socket.on('playerKicked', (kickedId) => {
        if (this.user?.id === kickedId) {
          try { const p = usePlatformStore(); p.toast('Вас исключил ведущий'); } catch { /* ок */ }
          this.logout();
          try { usePlatformStore().returnToHub(); } catch { window.location.href = '/'; }
        }
      });

      this.socket.on('gameStateUpdated', (newState) => {
        // Слим-бродкаст: обычные обновления приходят БЕЗ roundsData (весь пак летит только
        // при room:join адресно и при resetGame). Копируем по списку ключей.
        for (const k of BROADCAST_KEYS) {
          if (k in newState) this[k] = newState[k];
        }
        if ('roundsData' in newState) this.roundsData = newState.roundsData;
        // Дефолты для полей, которых может не быть в старых/усечённых пейлоадах
        this.spectators = this.spectators || [];
        this.maxPlayers = this.maxPlayers || 8;
        this.mediaState = this.mediaState || { status: 'stopped', anchorPosition: 0, anchorAt: 0 };
        this.buzzerResults = this.buzzerResults || [];
        this.amongUsVotes = this.amongUsVotes || {};
        // Копируем произвольные доп-поля новых типов (tier/number/potato/reaction/whosaid/rps),
        // не перечисляя каждое: если сервер прислал ключ — отражаем его в сторе как есть.
        for (const k of EXTRA_STATE_KEYS) {
          if (k in newState) this[k] = newState[k];
        }
        // Приватный показ живёт вне broadcast-стейта — сбрасываем его, когда вопрос закрыт
        if (!newState.activeCell) this.privateReveal = null;
      });

      // Адресный приватный показ (секрет исполнителю/ведущему, вне общего стейта)
      this.socket.on('privateReveal', (payload) => {
        this.privateReveal = payload;
      });

      // Приколы ведущего — транзиентные события вне стейта комнаты
      const pushFun = (kind) => (payload) => {
        this.funEvent = { seq: (this.funEvent?.seq || 0) + 1, kind, ...payload };
      };
      this.socket.on('fun:sound', pushFun('sound'));
      this.socket.on('fun:effect', pushFun('effect'));
      this.socket.on('fun:roulette', pushFun('roulette'));
    },

    // Аватар-строка от хаба может быть URL/data (картинка) или эмодзи/текст
    avatarIsImage(a) {
      return !!a && (a.startsWith('http') || a.startsWith('/') || a.startsWith('data:'));
    },
    getAvatarUrl(avatarPath) {
      if (!avatarPath) return null;
      if (avatarPath.startsWith('http') || avatarPath.startsWith('data:')) return avatarPath;
      return `${this.API_URL}${avatarPath}`;
    },
    getAssetUrl(assetPath) {
      if (!assetPath) return null;
      if (assetPath.startsWith('http')) return assetPath;
      // Если путь начинается с /assets/, добавляем API_URL
      return `${this.API_URL}${assetPath}`;
    },

    // Оценка дельты часов клиент↔сервер (NTP-лайт: полу-RTT). Нужна для синхронизации
    // позиции медиа: ожидаемая позиция считается от серверного якоря anchorAt.
    syncServerClock() {
      if (!this.socket) return;
      const t0 = Date.now();
      this.socket.emit('sync:ping', (serverNow) => {
        const t1 = Date.now();
        this.serverTimeDelta = serverNow - (t0 + t1) / 2;
      });
      // Периодическое уточнение (дрейф часов, смена сети)
      clearInterval(this._clockTimer);
      this._clockTimer = setInterval(() => {
        if (!this.socket?.connected) return;
        const s0 = Date.now();
        this.socket.emit('sync:ping', (serverNow) => {
          this.serverTimeDelta = serverNow - (s0 + Date.now()) / 2;
        });
      }, 30000);
    },

    // Универсальный мост для новых типов: компонент эмитит {name:'host:foo'|'player:bar', payload}.
    // Хост-события сервер вешает только на сокет ведущего (if isHost), поэтому подмена клиентом
    // безопасна; player-события гейтятся спектатором в ActiveQuestion до вызова.
    emitAction(name, payload) { this.socket?.emit(name, payload) },

    // proxy actions
    startRound() { this.socket?.emit('host:startRound') },
    nextRound() { this.socket?.emit('host:nextRound') },
    setSelectingPlayer(playerId) { this.socket?.emit('host:setSelectingPlayer', playerId) },
    highlightQuestion(catIdx, qIdx) { this.socket?.emit('player:highlightQuestion', { catIdx, qIdx }) },
    selectQuestion(catIdx, qIdx) { this.socket?.emit('host:selectQuestion', { catIdx, qIdx }) },
    closeQuestion() { this.socket?.emit('host:closeQuestion') },
    adjustScore(playerId, amount) { this.socket?.emit('host:adjustScore', { playerId, amount }) },
    kickPlayer(playerId) { this.socket?.emit('host:kickPlayer', playerId) },
    startBuzzer() { this.socket?.emit('host:startBuzzer') },
    pressBuzzer(reactionTime) { this.socket?.emit('player:pressBuzzer', { reactionTime }) },
    correctAnswer() { this.socket?.emit('host:correctAnswer') },
    wrongAnswer() {
      if (this.socket) this.socket.emit('host:wrongAnswer');
    },

    rouletteCatPlayer() {
      if (this.socket) this.socket.emit('host:rouletteCatPlayer');
    },
    
    submitAuctionBet(betAmount) {
      if (this.socket) this.socket.emit('player:submitAuctionBet', { betAmount });
    },
    
    revealAuctionBets() {
      if (this.socket) this.socket.emit('host:revealAuctionBets');
    },

    submitTextAnswer(text) { this.socket?.emit('player:submitTextAnswer', { text }) },
    submitSketch(dataUrl) { this.socket?.emit('player:submitSketch', { dataUrl }) },
    voteSketch(targetPlayerId) { this.socket?.emit('player:voteSketch', targetPlayerId) },
    startAmongUsTimer() { this.socket?.emit('host:startAmongUsTimer') },
    pauseAmongUsTimer(timeLeft) { this.socket?.emit('host:pauseAmongUsTimer', { timeLeft }) },
    resumeAmongUsTimer(timeLeft) { this.socket?.emit('host:resumeAmongUsTimer', { timeLeft }) },
    // Ведущий шлёт позицию своего медиаэлемента как якорь синхронизации
    controlMedia({ status }) {
      this.socket?.emit('host:controlMedia', { status, position: activeMediaTime() });
    },
    voteAmongUs(targetId) { this.socket?.emit('player:voteAmongUs', targetId) },
    revealAmongUs() { this.socket?.emit('host:revealAmongUs') },
    revealSketches() { this.socket?.emit('host:revealSketches') },
    awardSketchWinner(winnerId) { this.socket?.emit('host:awardSketchWinner', winnerId) },
    revealTextAnswers() { this.socket?.emit('host:revealTextAnswers') },
    judgeSingleTextAnswer(playerId, isCorrect) { this.socket?.emit('host:judgeSingleTextAnswer', { playerId, isCorrect }) },
    resetGame() { this.socket?.emit('host:resetGame') },
    makeSpectator(playerId) { this.socket?.emit('host:makeSpectator', playerId) },
    promoteSpectator(spectatorId) { this.socket?.emit('host:promoteSpectator', spectatorId) },
    takeSeat() { this.socket?.emit('spectator:takeSeat') }
  }
})