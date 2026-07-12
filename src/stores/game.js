import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import { usePlatformStore } from './platform'

export const useGameStore = defineStore('game', {
  state: () => ({
    // Auth & API
    token: localStorage.getItem('token') || null,
    user: null, // { id, username, avatar }
    roomCode: null,
    API_URL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin),
    
    // Socket
    socket: null,
    connected: false,
    
    // Game State
    host: null,
    gameStarted: false,
    roundsData: [],
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
    pokerActivePlayers: [],
    pokerBets: {},
    pokerCurrentBet: 0,
    pokerTurnIdx: 0,
    pokerPlayersActed: [],
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
    reactions: {} // { [playerId]: emoji | null }
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
    seatsFree: (state) => Math.max(0, state.maxPlayers - state.players.length)
  },

  actions: {
    async register(username, password) {
      const res = await fetch(`${this.API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        let msg = 'Registration failed';
        try { const d = await res.json(); msg = d.error; } catch(e){}
        throw new Error(msg);
      }
      const data = await res.json();
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', this.token);
    },

    async login(username, password) {
      const res = await fetch(`${this.API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        let msg = 'Login failed';
        try { const d = await res.json(); msg = d.error; } catch(e){}
        throw new Error(msg);
      }
      const data = await res.json();
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', this.token);
    },

    async guestLogin(username) {
      const res = await fetch(`${this.API_URL}/auth/guest-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (!res.ok) {
        let msg = 'Guest login failed';
        try { const d = await res.json(); msg = d.error; } catch(e){}
        throw new Error(msg);
      }
      const data = await res.json();
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', this.token);
    },
    
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

    async uploadAvatar(file) {
      if (file.size > 2 * 1024 * 1024) throw new Error('Файл слишком большой (макс 2МБ)');
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = async (e) => {
          try {
            const res = await fetch(`${this.API_URL}/api/upload/avatar`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
              },
              body: JSON.stringify({ avatar: e.target.result })
            });
            if (res.ok) {
              if (this.socket) this.socket.emit('player:updateAvatar');
              resolve();
            } else {
              reject(new Error('Ошибка загрузки'));
            }
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsDataURL(file);
      });
    },

    async createRoom(maxPlayers) {
      const res = await fetch(`${this.API_URL}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ maxPlayers: maxPlayers || 8 })
      });
      if (!res.ok) throw new Error('Create room failed');
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
      
      this.socket = io(`${this.API_URL}`, {
        auth: { token: this.token }
      });
      
      this.socket.on('connect', () => {
        this.connected = true;
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
        }
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });

      this.socket.on('playerKicked', (kickedId) => {
        if (this.user?.id === kickedId) {
          alert('Вас кикнул ведущий.');
          this.logout();
          window.location.href = '/';
        }
      });

      this.socket.on('gameStateUpdated', (newState) => {
        this.host = newState.host;
        this.gameStarted = newState.gameStarted;
        this.roundsData = newState.roundsData;
        this.currentRoundIndex = newState.currentRoundIndex;
        this.board = newState.board;
        this.players = newState.players;
        this.spectators = newState.spectators || [];
        this.maxPlayers = newState.maxPlayers || 8;
        this.activeCell = newState.activeCell;
        this.showAnswer = newState.showAnswer;
        this.questionStatus = newState.questionStatus;
        this.answeringPlayerId = newState.answeringPlayerId;
        this.selectingPlayerId = newState.selectingPlayerId;
        this.highlightedQuestion = newState.highlightedQuestion;
        this.failedPlayers = newState.failedPlayers;
        this.activeBet = newState.activeBet;
        this.glitchSeed = newState.glitchSeed;
        this.textAnswers = newState.textAnswers;
        this.sketchAnswers = newState.sketchAnswers;
        this.sketchVotes = newState.sketchVotes;
        this.pokerActivePlayers = newState.pokerActivePlayers;
        this.pokerBets = newState.pokerBets;
        this.pokerCurrentBet = newState.pokerCurrentBet;
        this.pokerTurnIdx = newState.pokerTurnIdx;
        this.pokerPlayersActed = newState.pokerPlayersActed;
        this.imposterId = newState.imposterId;
        this.amongUsTimerState = newState.amongUsTimerState;
        this.revealedTextAnswers = newState.revealedTextAnswers;
        this.auctionBets = newState.auctionBets;
        this.catTargetId = newState.catTargetId;
        this.auctionTiePlayers = newState.auctionTiePlayers;
        this.eventLog = newState.eventLog;
        this.buzzerResults = newState.buzzerResults || [];
        this.amongUsVotes = newState.amongUsVotes || {};
      });

      this.socket.on('playerReaction', ({ playerId, emoji }) => {
        this.reactions = { ...this.reactions, [playerId]: emoji };
        setTimeout(() => {
          this.reactions = { ...this.reactions, [playerId]: null };
        }, 2500);
      });
    },

    getAvatarUrl(avatarPath) {
      if (!avatarPath) return null;
      if (avatarPath.startsWith('http')) return avatarPath;
      return `${this.API_URL}${avatarPath}`;
    },
    getAssetUrl(assetPath) {
      if (!assetPath) return null;
      if (assetPath.startsWith('http')) return assetPath;
      // Если путь начинается с /assets/, добавляем API_URL
      return `${this.API_URL}${assetPath}`;
    },

    // proxy actions
    startRound() { this.socket?.emit('host:startRound') },
    nextRound() { this.socket?.emit('host:nextRound') },
    setSelectingPlayer(playerId) { this.socket?.emit('host:setSelectingPlayer', playerId) },
    highlightQuestion(catIdx, qIdx) { this.socket?.emit('player:highlightQuestion', { catIdx, qIdx }) },
    selectQuestion(catIdx, qIdx) { this.socket?.emit('host:selectQuestion', { catIdx, qIdx }) },
    closeQuestion() { this.socket?.emit('host:closeQuestion') },
    adjustScore(playerId, amount) { this.socket?.emit('host:adjustScore', { playerId, amount }) },
    setScore(playerId, amount) { this.socket?.emit('host:setScore', { playerId, amount }) },
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

    assignCatToPlayer(playerId) { this.socket?.emit('host:assignCatToPlayer', playerId) },
    setAuctionWinner(playerId, betAmount) { this.socket?.emit('host:setAuctionWinner', { playerId, betAmount }) },
    submitTextAnswer(text) { this.socket?.emit('player:submitTextAnswer', { text }) },
    submitSketch(dataUrl) { this.socket?.emit('player:submitSketch', { dataUrl }) },
    voteSketch(targetPlayerId) { this.socket?.emit('player:voteSketch', targetPlayerId) },
    pokerAction(action, amount = 0) { this.socket?.emit('player:pokerAction', { action, amount }) },
    startAmongUsTimer() { this.socket?.emit('host:startAmongUsTimer') },
    pauseAmongUsTimer(timeLeft) { this.socket?.emit('host:pauseAmongUsTimer', { timeLeft }) },
    resumeAmongUsTimer(timeLeft) { this.socket?.emit('host:resumeAmongUsTimer', { timeLeft }) },
    controlMedia(params) { this.socket?.emit('host:controlMedia', params) },
    voteAmongUs(targetId) { this.socket?.emit('player:voteAmongUs', targetId) },
    revealAmongUs() { this.socket?.emit('host:revealAmongUs') },
    revealSketches() { this.socket?.emit('host:revealSketches') },
    awardSketchWinner(winnerId) { this.socket?.emit('host:awardSketchWinner', winnerId) },
    revealTextAnswers() { this.socket?.emit('host:revealTextAnswers') },
    judgeSingleTextAnswer(playerId, isCorrect) { this.socket?.emit('host:judgeSingleTextAnswer', { playerId, isCorrect }) },
    resetGame() { this.socket?.emit('host:resetGame') },
    pauseGlitch() { this.socket?.emit('player:pauseGlitch') },
    sendReaction(emoji) { this.socket?.emit('player:sendReaction', { emoji }) },
    makeSpectator(playerId) { this.socket?.emit('host:makeSpectator', playerId) },
    promoteSpectator(spectatorId) { this.socket?.emit('host:promoteSpectator', spectatorId) },
    takeSeat() { this.socket?.emit('spectator:takeSeat') }
  }
})