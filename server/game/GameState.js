const initialGameData = require('./initialData');
const StandardHandler = require('./questions/StandardHandler');
const PokerHandler = require('./questions/PokerHandler');
const AmongUsHandler = require('./questions/AmongUsHandler');
const SketchHandler = require('./questions/SketchHandler');
const AuctionHandler = require('./questions/AuctionHandler');
const CatHandler = require('./questions/CatHandler');
const GlitchHandler = require('./questions/GlitchHandler');

const HANDLERS = {
  'text': new StandardHandler('text'),
  'media': new StandardHandler('media'),
  'text_input': new StandardHandler('text_input'),
  'poker': new PokerHandler(),
  'among_us': new AmongUsHandler(),
  'sketch': new SketchHandler(),
  'auction': new AuctionHandler(),
  'cat': new CatHandler(),
  'glitch': new GlitchHandler()
};


const DEFAULT_MAX_PLAYERS = 8;

function clampMaxPlayers(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return DEFAULT_MAX_PLAYERS;
  return Math.min(16, Math.max(2, n));
}

class GameState {
  constructor(roomCode, hostUser, options = {}) {
    this.roomCode = roomCode;
    this.state = this.getInitialState(hostUser, options);
    this.timers = {};
  }

  getInitialState(hostUser, options = {}) {
    return {
      host: { id: hostUser.id, username: hostUser.username, socketId: null, connected: false, platformId: hostUser.platformId || null },
      maxPlayers: clampMaxPlayers(options.maxPlayers),
      spectators: [], // { id, name, avatar, platformId, score, connected, socketId, loadedAssets }
      gameStarted: false,
      roundsData: JSON.parse(JSON.stringify(initialGameData)),
      currentRoundIndex: 0,
      board: [], // categories of the current round
      players: [], // { id, name, avatar, score, connected, socketId, loadedAssets }
      activeCell: null,
      showAnswer: false,
      questionStatus: 'idle', // 'reading', 'buzzer_active', 'answering', 'auction_bidding', 'question_highlighted' etc
      answeringPlayerId: null,
      selectingPlayerId: null, // Кто сейчас выбирает вопрос
      highlightedQuestion: null, // {catIdx, qIdx} - вопрос, выбранный игроком, ожидающий подтверждения
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
      revealedTextAnswers: false,
      auctionBets: {},
      catTargetId: null,
      mediaState: { status: 'stopped', currentTime: 0 },
      eventLog: []
    };
  }

  addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    this.state.eventLog.unshift({ time, text, type });
    if (this.state.eventLog.length > 50) this.state.eventLog.pop();
  }

  makeParticipant(user) {
    return {
      id: user.id,
      name: user.username,
      avatar: user.avatar,
      platformId: user.platformId || null,
      score: 0,
      connected: false,
      socketId: null,
      loadedAssets: false
    };
  }

  addPlayer(user) {
    const existing = this.state.players.find(x => x.id === user.id);
    if (existing) return existing;
    // Уже наблюдатель (например, переподключился) — роль не меняем
    const spec = this.state.spectators.find(x => x.id === user.id);
    if (spec) return spec;
    // Мест нет или игра уже идёт — автоматически наблюдатель
    if (this.state.players.length >= this.state.maxPlayers || this.state.gameStarted) {
      return this.addSpectator(user);
    }
    const p = this.makeParticipant(user);
    this.state.players.push(p);
    this.addLog(`Игрок ${user.username} присоединился к лобби.`, 'info');
    return p;
  }

  addSpectator(user) {
    const asPlayer = this.state.players.find(x => x.id === user.id);
    if (asPlayer) return asPlayer;
    let s = this.state.spectators.find(x => x.id === user.id);
    if (!s) {
      s = this.makeParticipant(user);
      this.state.spectators.push(s);
      this.addLog(`Наблюдатель ${user.username} присоединился.`, 'info');
    }
    return s;
  }

  promoteSpectator(spectatorId) {
    // Как и demotePlayer: смена роли только между вопросами, иначе ломается
    // подсчёт голосов among_us / порядок хода в покере
    if (this.state.gameStarted && this.state.questionStatus !== 'idle') return false;
    if (this.state.players.length >= this.state.maxPlayers) return false;
    const idx = this.state.spectators.findIndex(s => String(s.id) === String(spectatorId));
    if (idx === -1) return false;
    const [s] = this.state.spectators.splice(idx, 1);
    this.state.players.push(s); // счёт сохраняется (возврат ранее разжалованного игрока)
    this.addLog(`${s.name} теперь игрок.`, 'success');
    return true;
  }

  demotePlayer(playerId) {
    if (this.state.gameStarted && this.state.questionStatus !== 'idle') return false;
    const idx = this.state.players.findIndex(p => String(p.id) === String(playerId));
    if (idx === -1) return false;
    const [p] = this.state.players.splice(idx, 1);
    this.state.spectators.push(p);
    if (String(this.state.selectingPlayerId) === String(playerId)) this.state.selectingPlayerId = null;
    if (String(this.state.answeringPlayerId) === String(playerId)) this.state.answeringPlayerId = null;
    this.addLog(`${p.name} теперь наблюдатель.`, 'warning');
    return true;
  }

  findParticipant(userId) {
    return this.state.players.find(x => x.id === userId)
      || this.state.spectators.find(x => x.id === userId);
  }

  removePlayer(playerId) {
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    this.state.spectators = this.state.spectators.filter(s => s.id !== playerId);
    this.addLog(`Игрок удален из лобби.`, 'warning');
  }

  setPlayerConnection(userId, socketId, isConnected) {
    if (this.state.host.id === userId) {
      this.state.host.socketId = isConnected ? socketId : null;
      this.state.host.connected = isConnected;
      return;
    }
    const p = this.findParticipant(userId);
    if (p) {
      p.socketId = isConnected ? socketId : null;
      p.connected = isConnected;
    }
  }

  setPlayerLoaded(userId, isLoaded) {
    const p = this.findParticipant(userId);
    if (p) p.loadedAssets = isLoaded;
  }

  hasConnectedMembers() {
    if (this.state.host.connected) return true;
    return this.state.players.some(p => p.connected) || this.state.spectators.some(s => s.connected);
  }

  startGame() {
    this.state.gameStarted = true;
    this.state.questionStatus = 'showing_round_splash';
    this.state.board = this.state.roundsData[this.state.currentRoundIndex].categories;
    this.addLog('Игра началась!', 'system');
  }

  startRound() {
    this.state.questionStatus = 'idle';
    this.addLog(`Начат раунд: ${this.state.roundsData[this.state.currentRoundIndex].name}`, 'system');
  }

  nextRound() {
    if (this.state.currentRoundIndex < this.state.roundsData.length - 1) {
      this.state.currentRoundIndex++;
      this.state.board = this.state.roundsData[this.state.currentRoundIndex].categories;
      this.state.questionStatus = 'showing_round_splash';
    } else {
      this.state.questionStatus = 'game_over';
      this.addLog('Игра окончена!', 'system');
    }
  }

  getCurrentQuestion() {
    if (!this.state.activeCell) return null;
    return this.state.board[this.state.activeCell.catIdx].questions[this.state.activeCell.qIdx];
  }

  adjustScore(playerId, amount) {
    const p = this.state.players.find(x => x.id === playerId);
    if (p) {
      p.score += amount;
      const sign = amount > 0 ? '+' : '';
      this.addLog(`Игрок ${p.name} ${sign}${amount} очков.`, amount > 0 ? 'success' : 'error');
    }
  }

  selectQuestion(catIdx, qIdx) {
    const q = this.state.board[catIdx].questions[qIdx];
    if (q.answered) return;
    
    this.state.activeCell = { catIdx, qIdx };
    this.state.showAnswer = false;
    this.state.answeringPlayerId = null;
    this.state.highlightedQuestion = null;
    this.state.failedPlayers = [];
    this.state.textAnswers = {};
    this.state.revealedTextAnswers = false;
    this.state.amongUsVotes = {};
    this.state.amongUsResult = null;
    this.state.activeBet = null;
    this.state.auctionBets = {};
    this.state.catTargetId = null;
    this.state.mediaState = { status: 'stopped', currentTime: 0 };

    const handler = HANDLERS[q.type] || HANDLERS['text'];
    handler.onSelect(this, q);
  }

  getHandler() {
    const q = this.getCurrentQuestion();
    if (!q) return null;
    return HANDLERS[q.type] || HANDLERS['text'];
  }

  handleAction(action, data, context) {
    const handler = this.getHandler();
    if (handler) {
      handler.handleAction(this, action, data, context);
    }
  }

  correctAnswer(context) {
    const handler = this.getHandler();
    if (handler) {
      handler.onCorrect(this, context);
    }
  }

  wrongAnswer(context) {
    const handler = this.getHandler();
    if (handler) {
      handler.onWrong(this, context);
    }
  }


  clearTimers() {
    for (const key in this.timers) {
      clearTimeout(this.timers[key]);
      delete this.timers[key];
    }
  }

  closeQuestion() {
    this.clearTimers();
    if (this.state.activeCell) {
      this.state.board[this.state.activeCell.catIdx].questions[this.state.activeCell.qIdx].answered = true;
    }
    this.state.activeCell = null;
    this.state.showAnswer = false;
    this.state.questionStatus = 'idle';
    this.state.activeBet = null;
    this.state.highlightedQuestion = null;
    this.state.answeringPlayerId = null;
    this.state.catTargetId = null;
    this.state.auctionTiePlayers = [];
    this.state.buzzerResults = [];
    this.state.textAnswers = {};
    this.state.amongUsTimerState = null;
    this.state.amongUsVotes = {};
    // Баг #6: сбрасываем imposterId и glitchSeed, чтобы не протекали в следующий вопрос
    this.state.imposterId = null;
    this.state.glitchSeed = null;
    this.state.failedPlayers = [];
  }

  resetGame() {
    this.clearTimers();
    // Баг #7: пересоздаём roundsData из исходных данных, иначе вопросы остаются answered:true
    this.state.roundsData = JSON.parse(JSON.stringify(initialGameData));
    this.state.board = [];
    this.state.questionStatus = 'idle';
    this.state.answeringPlayerId = null;
    this.state.selectingPlayerId = null;
    this.state.activeCell = null;
    this.state.showAnswer = false;
    this.state.imposterId = null;
    this.state.glitchSeed = null;
    this.state.amongUsTimerState = null;
    this.state.revealedTextAnswers = false;
    this.state.auctionBets = {};
    this.state.catTargetId = null;
    this.state.auctionTiePlayers = [];
    this.state.textAnswers = {};
    this.state.sketchAnswers = {};
    this.state.pokerActivePlayers = [];
    this.state.pokerBets = {};
    this.state.failedPlayers = [];
    this.state.highlightedQuestion = null;
    this.state.activeBet = null;
    this.state.buzzerResults = [];
    this.state.players.forEach(p => p.score = 0);
    this.state.spectators.forEach(s => s.score = 0);
    this.state.gameStarted = false;
    this.state.currentRoundIndex = 0;
    this.addLog('Ведущий сбросил игру.', 'warning');
  }

  setSelectingPlayer(playerId) {
    this.state.selectingPlayerId = playerId;
    const p = this.state.players.find(x => x.id === playerId);
    if (p) this.addLog(`Право выбора передано: ${p.name}`, 'info');
  }

  highlightQuestion(catIdx, qIdx) {
    if (this.state.questionStatus !== 'idle') return;
    this.state.highlightedQuestion = { catIdx, qIdx };
    // Не меняем статус полностью, просто добавляем подсветку
  }


}

module.exports = GameState;
