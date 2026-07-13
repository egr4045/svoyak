const BaseQuestionHandler = require('./BaseQuestionHandler');

// Кто это сказал: все анонимно пишут ответ на промпт (sealed store, в стейте только счётчик),
// затем ответы вскрываются перемешанными без авторов, и все угадывают, чей какой. За верные
// догадки — очки. Свой ответ в зачёт не идёт.
class WhoSaidHandler extends BaseQuestionHandler {
  constructor() { super('whosaid'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'whosaid_collecting';
    gameState.state.whoSaidCount = 0;
    gameState.state.whoSaidAnswers = null;
    gameState.state.whoSaidGuesses = {};
    gameState.state.whoSaidResult = null;
    gameState.addLog('Кто это сказал: напишите свой ответ.', 'info');
  }

  handleAction(gameState, action, data, { io, user }) {
    const st = gameState.state.questionStatus;
    if (action === 'player:submitWhoSaid') {
      if (st !== 'whosaid_collecting') return;
      const text = data && typeof data.text === 'string' ? data.text.trim().slice(0, 300) : '';
      if (!text) return;
      gameState.sealed[String(user.id)] = { text };
      gameState.state.whoSaidCount = Object.keys(gameState.sealed).length;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealWhoSaid') {
      if (st !== 'whosaid_collecting') return;
      this.reveal(gameState, io);
    } else if (action === 'player:guessAuthor') {
      if (st !== 'whosaid_guessing') return;
      const guesses = (data && data.guesses) || {};
      gameState.sealed[String(user.id)] = { guesses }; // перезапись до подсчёта
      gameState.state.whoSaidCount = Object.keys(gameState.sealed).length;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:scoreWhoSaid') {
      if (st !== 'whosaid_guessing') return;
      this.score(gameState, io);
    }
  }

  reveal(gameState, io) {
    const entries = Object.entries(gameState.sealed).map(([uid, v]) => ({ uid, text: v.text }));
    for (let i = entries.length - 1; i > 0; i--) { // перемешиваем (Fisher–Yates)
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const authors = {};
    const answers = entries.map((e, idx) => { authors[idx] = e.uid; return { idx, text: e.text }; });
    gameState._priv.whoSaidAuthors = authors; // соответствие idx→автор держим вне broadcast
    gameState.state.whoSaidAnswers = answers; // анонимно
    gameState.sealed = {};                    // переиспользуем под догадки
    gameState.state.whoSaidCount = 0;
    gameState.state.questionStatus = 'whosaid_guessing';
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  score(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const authors = gameState._priv.whoSaidAuthors || {};
    const answers = gameState.state.whoSaidAnswers || [];
    const perCorrect = Math.max(1, Math.round((q.points || 0) / Math.max(1, answers.length)));
    const scores = {};
    for (const [voterId, v] of Object.entries(gameState.sealed)) {
      const guesses = v.guesses || {};
      let correct = 0;
      for (const a of answers) {
        const authorId = authors[a.idx];
        if (String(authorId) === String(voterId)) continue;      // свой ответ не считаем
        if (String(guesses[a.idx]) === String(authorId)) correct++;
      }
      scores[voterId] = correct * perCorrect;
      if (scores[voterId] > 0) gameState.adjustScore(voterId, scores[voterId]);
    }
    gameState.state.whoSaidResult = {
      answers: answers.map(a => {
        const authorId = authors[a.idx];
        const p = gameState.state.players.find(pp => String(pp.id) === String(authorId));
        return { idx: a.idx, text: a.text, authorId, authorName: p ? p.name : '—' };
      }),
      scores
    };
    gameState.state.questionStatus = 'whosaid_results';
    gameState.addLog('Кто сказал: авторы раскрыты.', 'success');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = WhoSaidHandler;
