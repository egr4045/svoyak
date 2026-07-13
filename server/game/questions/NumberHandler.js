const BaseQuestionHandler = require('./BaseQuestionHandler');

// Парсинг ответа/догадки в сравнимое число. date → epoch(ms), number/year → float.
function toNumber(kind, raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (kind === 'date') { const t = Date.parse(s); return Number.isNaN(t) ? null : t; }
  const n = parseFloat(s.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

// Угадай число: все вводят число/год/дату, ближайший к ответу берёт очки. Ответ прячем из
// broadcast на время ввода; догадки держим в sealed store (не анкорим друг друга), в стейте —
// только факт ответа. На reveal ранжируем по |догадка − ответ|.
class NumberHandler extends BaseQuestionHandler {
  constructor() { super('number'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'number_inputting';
    gameState.state.numberGuesses = {};
    gameState.state.numberReveal = null;
    gameState._priv.numberTarget = toNumber(question.numberKind, question.a);
    gameState._priv.numberAnswer = question.a; // исходная строка для показа
    gameState.blankActiveQuestionFields(['a']);
    gameState.addLog('Угадай число!', 'info');
  }

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:submitNumber') {
      if (gameState.state.questionStatus !== 'number_inputting') return;
      const q = gameState.getCurrentQuestion();
      const parsed = toNumber(q.numberKind, data && data.value);
      if (parsed == null) return;
      gameState.sealed[String(user.id)] = { raw: String(data.value), num: parsed };
      gameState.state.numberGuesses[String(user.id)] = true; // только факт ответа
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealNumber') {
      if (gameState.state.questionStatus !== 'number_inputting') return;
      this.reveal(gameState, io);
    }
  }

  reveal(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const target = gameState._priv.numberTarget;
    const ranked = Object.entries(gameState.sealed).map(([id, v]) => {
      const p = gameState.state.players.find(pp => String(pp.id) === String(id));
      return { id, name: p ? p.name : id, raw: v.raw, num: v.num, diff: target == null ? Infinity : Math.abs(v.num - target) };
    }).sort((a, b) => a.diff - b.diff);
    const winnerId = ranked.length && ranked[0].diff !== Infinity ? ranked[0].id : null;
    if (winnerId) gameState.adjustScore(winnerId, q.points);
    gameState.state.numberReveal = {
      kind: q.numberKind || 'number',
      answer: gameState._priv.numberAnswer != null ? String(gameState._priv.numberAnswer) : null,
      ranked, winnerId
    };
    gameState.state.questionStatus = 'number_results';
    gameState.addLog(winnerId ? `Ближе всех: ${ranked[0].name}.` : 'Никто не ответил.', 'success');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = NumberHandler;
