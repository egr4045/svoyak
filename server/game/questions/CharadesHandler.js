const BaseQuestionHandler = require('./BaseQuestionHandler');

// Общий скелет «исполнитель»: performer_select → performing → awardGuess / passQuestion.
// Крокодил объясняет слово голосом, не называя его; слово приватно у исполнителя и ведущего.
// Караоке и Алиас наследуют этот скелет и переопределяют buildReveal / детали.
class CharadesHandler extends BaseQuestionHandler {
  constructor(type = 'charades') { super(type); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'performer_select';
    gameState.state.performerId = null;
    gameState.addLog('Крокодил! Ведущий выбирает исполнителя.', 'warning');
  }

  // Секрет, который получают приватно исполнитель и ведущий. Переопределяется в наследниках.
  buildReveal(gameState, question) {
    return { kind: this.type, text: question.a, prompt: question.q || '' };
  }

  // Какие поля активного вопроса убрать из broadcast (чтобы слово не утекло угадывающим).
  // Караоке дополнительно прячет реф-аудио.
  secretFields() { return ['a']; }

  // Слово для публичного показа в итоге (берём из приватного показа — он ещё жив до close).
  revealText(gameState) { return gameState.privateReveal && gameState.privateReveal.performerPayload
    ? gameState.privateReveal.performerPayload.text : null; }

  // Выбор строго среди мест (adjustScore не начисляет наблюдателям/ведущему).
  // playerId == null → случайный подключённый игрок (кнопка «🎲» в HostPanel).
  pickSeated(gameState, playerId) {
    if (playerId != null && playerId !== '') {
      return gameState.state.players.find(p => String(p.id) === String(playerId)) || null;
    }
    const conn = gameState.state.players.filter(p => p.connected);
    const pool = conn.length ? conn : gameState.state.players;
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  startPerforming(gameState, target, io) {
    const q = gameState.getCurrentQuestion();
    gameState.state.performerId = target.id;
    gameState.state.questionStatus = 'performing';
    // Сначала строим приватный показ (пока секрет ещё в вопросе), затем прячем его из broadcast
    const reveal = this.buildReveal(gameState, q);
    gameState.setPrivateReveal(target.id, reveal, reveal, io);
    gameState.blankActiveQuestionFields(this.secretFields());
    gameState.addLog(`${target.name} показывает.`, 'info');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  // Начисление угадавшему + исполнителю; слово раскрывается всем через performResult.answer
  // (сам вопрос в broadcast «пустой», поэтому showAnswer тут не используется).
  awardGuess(gameState, guesserId, io) {
    const q = gameState.getCurrentQuestion();
    const guesser = gameState.state.players.find(p => String(p.id) === String(guesserId));
    if (!guesser) return;
    gameState.adjustScore(guesser.id, q.points);
    const perfShare = Math.max(1, Math.ceil(q.points / 2));
    if (gameState.state.performerId) gameState.adjustScore(gameState.state.performerId, perfShare);
    gameState.state.performResult = { guesserId: guesser.id, performerId: gameState.state.performerId, answer: this.revealText(gameState) };
    gameState.state.questionStatus = 'idle';
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  handleAction(gameState, action, data, { io }) {
    if (action === 'host:setPerformer') {
      if (gameState.state.questionStatus !== 'performer_select') return;
      const target = this.pickSeated(gameState, data);
      if (!target) return;
      this.startPerforming(gameState, target, io);
    } else if (action === 'host:awardGuess') {
      if (gameState.state.questionStatus !== 'performing') return;
      this.awardGuess(gameState, data, io);
    } else if (action === 'host:passQuestion') {
      if (gameState.state.questionStatus !== 'performing') return;
      gameState.state.performResult = { pass: true, performerId: gameState.state.performerId, answer: this.revealText(gameState) };
      gameState.state.questionStatus = 'idle';
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = CharadesHandler;
