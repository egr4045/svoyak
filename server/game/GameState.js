const db = require('../db/database');
const initialGameData = require('./initialData');
const { migratePack } = require('./packMigrate');
const QuizHandler = require('./questions/QuizHandler');
const ShowHandler = require('./questions/ShowHandler');
const EveryoneHandler = require('./questions/EveryoneHandler');
const AmongUsHandler = require('./questions/AmongUsHandler');
const SketchHandler = require('./questions/SketchHandler');
const RpsHandler = require('./questions/RpsHandler');
const PotatoHandler = require('./questions/PotatoHandler');
const ReactionHandler = require('./questions/ReactionHandler');

// 8 типов ядра. Легаси-id (text/cat/karaoke/…) — алиасы на те же инстансы: это страховка
// на случай немигрированного вопроса; основной механизм — migratePack на всех входах данных.
const quiz = new QuizHandler();
const show = new ShowHandler();
const everyone = new EveryoneHandler();

const HANDLERS = {
  'quiz': quiz,
  'show': show,
  'everyone': everyone,
  'among_us': new AmongUsHandler(),
  'sketch': new SketchHandler(),
  'rps': new RpsHandler(),
  'potato': new PotatoHandler(),
  'reaction': new ReactionHandler(),
  // легаси-алиасы (сыграют в деградированном режиме без модификаторов, но не упадут)
  'text': quiz, 'media': quiz, 'text_input': quiz, 'glitch': quiz,
  'snippet': quiz, 'auction': quiz, 'cat': quiz, 'poker': quiz,
  'charades': show, 'karaoke': show, 'alias': show,
  'number': everyone, 'tierlist': everyone, 'whosaid': everyone
};


const DEFAULT_MAX_PLAYERS = 8;

function clampMaxPlayers(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return DEFAULT_MAX_PLAYERS;
  return Math.min(16, Math.max(2, n));
}

// Достаём массив раундов из объекта пака {rounds:[...]} или принимаем массив как есть.
// Всегда прогоняем через migratePack: пак мог прийти из старого ZIP/БД с легаси-типами.
function extractRounds(pack) {
  if (Array.isArray(pack)) return migratePack(pack);
  if (pack && Array.isArray(pack.rounds)) return migratePack(pack.rounds);
  return migratePack(initialGameData);
}

// Доп-поля стейта новых типов-мини-игр. Все обнуляются при выборе/закрытии вопроса,
// чтобы следующий вопрос того же типа не унаследовал мусор (см. resetQuestionExtras).
function questionExtraDefaults() {
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
  };
}

class GameState {
  constructor(roomCode, hostUser, options = {}) {
    this.roomCode = roomCode;
    // Кастомный пак из кабинета ведущего (или встроенный дефолт)
    this.pack = extractRounds(options.pack);
    // id пака в БД (null для встроенного) — нужен только для записи «прошёл пак» при game_over
    this.packId = options.packId || null;
    this.state = this.getInitialState(hostUser, options);
    this.timers = {};
    // Приватный показ и запечатанные сабмиты живут ВНЕ broadcast-стейта (иначе секрет
    // утечёт всем в gameStateUpdated). См. setPrivateReveal / sealed-хелперы ниже.
    this.privateReveal = null; // { performerId, performerPayload, hostPayload }
    this.sealed = {};          // ephemeral per-question: { [userId]: submission }
    this._priv = {};           // серверные секреты вопроса вне broadcast (слова алиаса, цель числа…)
  }

  getInitialState(hostUser, options = {}) {
    return {
      host: { id: hostUser.id, username: hostUser.username, socketId: null, connected: false, platformId: hostUser.platformId || null },
      maxPlayers: clampMaxPlayers(options.maxPlayers),
      spectators: [], // { id, name, avatar, platformId, score, connected, socketId, loadedAssets }
      gameStarted: false,
      roundsData: JSON.parse(JSON.stringify(this.pack || initialGameData)),
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
      imposterId: null,
      amongUsVotes: {},
      amongUsResult: null,
      amongUsTimerState: null,
      revealedTextAnswers: false,
      auctionBets: {},
      catTargetId: null,
      mediaState: { status: 'stopped', anchorPosition: 0, anchorAt: 0 },
      eventLog: [],
      ...questionExtraDefaults()
    };
  }

  // Централизованный сброс доп-полей новых типов + приватного/запечатанного хранилища.
  // Вызывается из selectQuestion / closeQuestion / resetGame.
  resetQuestionExtras() {
    Object.assign(this.state, questionExtraDefaults());
    this.privateReveal = null;
    this.sealed = {};
    this._priv = {};
  }

  // Приватный показ: секрет только исполнителю (perf) и ведущему (host), вне общего стейта.
  setPrivateReveal(performerId, performerPayload, hostPayload, io) {
    this.privateReveal = { performerId, performerPayload, hostPayload: hostPayload || performerPayload };
    this.emitPrivateReveal(io);
  }

  emitPrivateReveal(io) {
    if (!io || !this.privateReveal) return;
    const perf = this.findParticipant(this.privateReveal.performerId);
    if (perf && perf.socketId) io.to(perf.socketId).emit('privateReveal', this.privateReveal.performerPayload);
    if (this.state.host.socketId) io.to(this.state.host.socketId).emit('privateReveal', this.privateReveal.hostPayload);
  }

  // Затираем секретные поля активного вопроса в broadcast (весь пак рассылается всем в
  // gameStateUpdated). board и roundsData ссылаются на один объект вопроса — правка убирает
  // секрет из обоих. this.pack не трогается, поэтому resetGame честно восстановит вопрос.
  blankActiveQuestionFields(fields) {
    const q = this.getCurrentQuestion();
    if (!q) return;
    for (const f of fields) q[f] = null;
  }

  // Слим-стейт: всё, кроме roundsData (весь пак). Пак летит только адресно при room:join
  // и всем при resetGame — иначе каждый чих гонял мегабайты и перерендеривал клиентов.
  slimState() {
    const { roundsData, ...rest } = this.state;
    return { ...rest, roundsCount: this.state.roundsData.length };
  }

  fullState() {
    return { ...this.state, roundsCount: this.state.roundsData.length };
  }

  // Единая точка рассылки состояния комнаты (хендлеры зовут её вместо прямого emit)
  broadcast(io) {
    io.to(this.roomCode).emit('gameStateUpdated', this.slimState());
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
    // подсчёт голосов among_us / запечатанные сабмиты активного вопроса
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

  // ВАЖНО: id сравниваем через String — реальные id из БД числовые, но ключи объектов
  // (textAnswers/sealed/votes) всегда строки. Строгий === здесь молча ломал начисления.
  findParticipant(userId) {
    return this.state.players.find(x => String(x.id) === String(userId))
      || this.state.spectators.find(x => String(x.id) === String(userId));
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

  setPlayerLoaded(userId, isLoaded, failedAssets = 0) {
    const p = this.findParticipant(userId);
    if (p) {
      p.loadedAssets = isLoaded;
      p.failedAssets = failedAssets; // сколько медиа не прогрузилось (⚠ в лобби у ведущего)
    }
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
    const r = this.state.roundsData[this.state.currentRoundIndex];
    this.addLog(`Начат раунд: ${r.name || r.round || 'Раунд'}`, 'system');
  }

  nextRound() {
    if (this.state.currentRoundIndex < this.state.roundsData.length - 1) {
      this.state.currentRoundIndex++;
      this.state.board = this.state.roundsData[this.state.currentRoundIndex].categories;
      this.state.questionStatus = 'showing_round_splash';
    } else {
      this.state.questionStatus = 'game_over';
      this.addLog('Игра окончена!', 'system');
      this.recordPlays();
    }
  }

  // Отмечает всех участников (игроков+наблюдателей, кроме самого ведущего) как «прошедших» этот
  // пак — даёт им право самим хостить этот же пак (без прав редактировать/удалять/экспортировать
  // оригинал). Ничего не делает для встроенного пака (packId не задан).
  recordPlays() {
    if (!this.packId) return;
    const hostPid = this.state.host.platformId;
    const pids = new Set();
    [...this.state.players, ...this.state.spectators].forEach(p => {
      if (p.platformId && p.platformId !== hostPid) pids.add(p.platformId);
    });
    const now = Date.now();
    pids.forEach(pid => {
      db.run(
        `INSERT INTO pack_plays (pack_id, platform_id, played_at) VALUES (?, ?, ?)
         ON CONFLICT(pack_id, platform_id) DO UPDATE SET played_at = excluded.played_at`,
        [this.packId, pid, now]
      );
    });
  }

  getCurrentQuestion() {
    if (!this.state.activeCell) return null;
    return this.state.board[this.state.activeCell.catIdx].questions[this.state.activeCell.qIdx];
  }

  adjustScore(playerId, amount) {
    // String-сравнение обязательно: playerId часто приходит ключом объекта (строкой),
    // а p.id — числовой id из БД (см. комментарий у findParticipant)
    const p = this.state.players.find(x => String(x.id) === String(playerId));
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
    this.state.mediaState = { status: 'stopped', anchorPosition: 0, anchorAt: 0 };
    this.resetQuestionExtras();

    const handler = HANDLERS[q.type] || HANDLERS['quiz'];
    handler.onSelect(this, q);
  }

  getHandler() {
    const q = this.getCurrentQuestion();
    if (!q) return null;
    return HANDLERS[q.type] || HANDLERS['quiz'];
  }

  // Пост-выбор с доступом к io (roomHandlers вызывает сразу после selectQuestion)
  afterSelect(context) {
    const handler = this.getHandler();
    if (handler) handler.afterSelect(this, context);
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
    this.resetQuestionExtras();
  }

  resetGame() {
    this.clearTimers();
    // Баг #7: пересоздаём roundsData из пака комнаты, иначе вопросы остаются answered:true
    this.state.roundsData = JSON.parse(JSON.stringify(this.pack || initialGameData));
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
    this.state.failedPlayers = [];
    this.state.highlightedQuestion = null;
    this.state.activeBet = null;
    this.state.buzzerResults = [];
    this.resetQuestionExtras();
    this.state.players.forEach(p => p.score = 0);
    this.state.spectators.forEach(s => s.score = 0);
    this.state.gameStarted = false;
    this.state.currentRoundIndex = 0;
    this.addLog('Ведущий сбросил игру.', 'warning');
  }

  setSelectingPlayer(playerId) {
    // Канонизируем id по объекту игрока: если пришла строка (ключ объекта),
    // в стейт кладём настоящий id — клиентские === сравнения остаются простыми
    const p = this.state.players.find(x => String(x.id) === String(playerId));
    this.state.selectingPlayerId = p ? p.id : playerId;
    if (p) this.addLog(`Право выбора передано: ${p.name}`, 'info');
  }

  highlightQuestion(catIdx, qIdx) {
    if (this.state.questionStatus !== 'idle') return;
    this.state.highlightedQuestion = { catIdx, qIdx };
    // Не меняем статус полностью, просто добавляем подсветку
  }


}

module.exports = GameState;
// Единый источник правды для доп-полей стейта мини-игр: тесты (test-utils) берут его
// отсюда, а клиентское зеркало живёт в src/stores/game.js (граница CJS/ESM)
module.exports.questionExtraDefaults = questionExtraDefaults;
