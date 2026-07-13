const CharadesHandler = require('./CharadesHandler');

// Алиас: один объясняет всем стопку слов на таймере. Слова приватны (по одному) у
// объясняющего и ведущего; ведущий отмечает угадавших — очки угадавшему и объясняющему.
// Статусы: performer_select → alias_playing → idle (aliasResult).
class AliasHandler extends CharadesHandler {
  constructor() { super('alias'); }

  // Слова берём из инстанса комнаты (_aliasWords) — в самом вопросе они затёрты для broadcast.
  // До старта (в setPerformer) читаем из вопроса.
  wordList(gameState) {
    if (Array.isArray(gameState._priv.aliasWords)) return gameState._priv.aliasWords;
    const q = gameState.getCurrentQuestion();
    return (q.words || []).map(w => (w == null ? '' : String(w))).filter(w => w.trim());
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'performer_select';
    gameState.state.performerId = null;
    gameState.state.aliasState = null;
    gameState.state.aliasResult = null;
    gameState.addLog('Алиас! Ведущий выбирает, кто объясняет.', 'warning');
  }

  // Текущее слово — приватно объясняющему и ведущему (не в broadcast-стейт)
  revealWord(gameState, io) {
    const words = this.wordList(gameState);
    const st = gameState.state.aliasState;
    const payload = { kind: 'alias', text: words[st.index] || null, index: st.index, total: st.total };
    gameState.setPrivateReveal(gameState.state.performerId, payload, payload, io);
  }

  armTimer(gameState, io) {
    const st = gameState.state.aliasState;
    if (gameState.timers.aliasTimer) clearTimeout(gameState.timers.aliasTimer);
    const ms = Math.max(5, st.timerSec || 60) * 1000;
    st.endsAt = Date.now() + ms;
    gameState.timers.aliasTimer = setTimeout(() => this.finish(gameState, io), ms);
  }

  handleAction(gameState, action, data, { io }) {
    if (action === 'host:setPerformer') {
      if (gameState.state.questionStatus !== 'performer_select') return;
      const target = this.pickSeated(gameState, data);
      if (!target) return;
      const words = this.wordList(gameState);
      if (words.length === 0) return;
      gameState._priv.aliasWords = words; // сохраняем до затирания q.words из broadcast
      const q = gameState.getCurrentQuestion();
      gameState.state.performerId = target.id;
      gameState.state.questionStatus = 'alias_playing';
      gameState.state.aliasState = {
        index: 0, total: words.length, guessedCount: 0,
        timerSec: q.timerSec || 60, endsAt: null,
        wordPoints: Math.max(1, Math.round((q.points || 0) / words.length))
      };
      this.revealWord(gameState, io);
      // Прячем весь список слов из broadcast: текущее слово идёт приватно объясняющему
      gameState.blankActiveQuestionFields(['words']);
      this.armTimer(gameState, io);
      gameState.addLog(`${target.name} объясняет слова.`, 'info');
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:aliasGuessed') {
      if (gameState.state.questionStatus !== 'alias_playing') return;
      const st = gameState.state.aliasState;
      const guesser = gameState.state.players.find(p => String(p.id) === String(data));
      if (guesser) {
        gameState.adjustScore(guesser.id, st.wordPoints);
        if (gameState.state.performerId) gameState.adjustScore(gameState.state.performerId, st.wordPoints);
        st.guessedCount++;
      }
      this.advance(gameState, io);
    } else if (action === 'host:aliasSkip') {
      if (gameState.state.questionStatus !== 'alias_playing') return;
      this.advance(gameState, io);
    }
  }

  advance(gameState, io) {
    const st = gameState.state.aliasState;
    st.index++;
    if (st.index >= st.total) { this.finish(gameState, io); return; }
    this.revealWord(gameState, io);
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  finish(gameState, io) {
    if (gameState.state.questionStatus !== 'alias_playing') return;
    if (gameState.timers.aliasTimer) { clearTimeout(gameState.timers.aliasTimer); delete gameState.timers.aliasTimer; }
    const st = gameState.state.aliasState;
    gameState.state.aliasResult = { guessed: st ? st.guessedCount : 0, total: st ? st.total : 0 };
    gameState.state.questionStatus = 'idle';
    gameState.privateReveal = null; // компонент прячет слово вне alias_playing и без явной чистки
    gameState.addLog(`Алиас завершён: угадано ${gameState.state.aliasResult.guessed} из ${gameState.state.aliasResult.total}.`, 'success');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = AliasHandler;
