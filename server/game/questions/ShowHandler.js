const BaseQuestionHandler = require('./BaseQuestionHandler');

// «Шоу» — общий скелет «исполнитель»: performer_select → performing/alias_playing → idle (итог).
// Режим задаёт вопрос: showMode = 'charades' (крокодил, дефолт) | 'karaoke' | 'alias'.
//  - charades: исполнитель объясняет/показывает слово, не называя его; слово приватно.
//  - karaoke: приватный показ несёт реф-аудио — исполнитель слушает в наушник и напевает.
//  - alias: объясняющему по одному приходят слова на таймере; ведущий отмечает угадавших.
// Секреты уходят адресным privateReveal и затираются из broadcast (blankActiveQuestionFields).
class ShowHandler extends BaseQuestionHandler {
  constructor() { super('show'); }

  mode(question) {
    const m = question?.showMode;
    return m === 'karaoke' || m === 'alias' ? m : 'charades';
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'performer_select';
    gameState.state.performerId = null;
    const m = this.mode(question);
    if (m === 'alias') {
      gameState.state.aliasState = null;
      gameState.state.aliasResult = null;
    }
    const label = m === 'karaoke' ? 'Караоке! Ведущий выбирает исполнителя.'
      : m === 'alias' ? 'Алиас! Ведущий выбирает, кто объясняет.'
      : 'Крокодил! Ведущий выбирает исполнителя.';
    gameState.addLog(label, 'warning');
  }

  // Секрет, который получают приватно исполнитель и ведущий
  buildReveal(gameState, question) {
    if (this.mode(question) === 'karaoke') {
      return {
        kind: 'karaoke',
        text: question.a,                      // название песни
        prompt: question.q || '',
        mediaSrc: question.mediaSrc || null,   // реф-аудио — проигрывается ТОЛЬКО у исполнителя
        mediaType: question.mediaType || null
      };
    }
    return { kind: 'charades', text: question.a, prompt: question.q || '' };
  }

  // Какие поля активного вопроса убрать из broadcast (чтобы секрет не утёк угадывающим).
  // Караоке дополнительно прячет реф-аудио (иначе угадывающий откроет URL и услышит оригинал).
  secretFields(question) {
    return this.mode(question) === 'karaoke' ? ['a', 'mediaSrc', 'mediaType'] : ['a'];
  }

  // Слово для публичного показа в итоге (берём из приватного показа — он ещё жив до close)
  revealText(gameState) {
    return gameState.privateReveal && gameState.privateReveal.performerPayload
      ? gameState.privateReveal.performerPayload.text : null;
  }

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
    gameState.blankActiveQuestionFields(this.secretFields(q));
    gameState.addLog(`${target.name} показывает.`, 'info');
    gameState.broadcast(io);
  }

  // Начисление угадавшему + исполнителю; слово раскрывается всем через performResult.answer
  awardGuess(gameState, guesserId, io) {
    const q = gameState.getCurrentQuestion();
    const guesser = gameState.state.players.find(p => String(p.id) === String(guesserId));
    if (!guesser) return;
    gameState.adjustScore(guesser.id, q.points);
    const perfShare = Math.max(1, Math.ceil(q.points / 2));
    if (gameState.state.performerId) gameState.adjustScore(gameState.state.performerId, perfShare);
    gameState.state.performResult = { guesserId: guesser.id, performerId: gameState.state.performerId, answer: this.revealText(gameState) };
    gameState.state.questionStatus = 'idle';
    gameState.broadcast(io);
  }

  // --- Алиас: список слов на таймере ------------------------------------

  // Слова берём из _priv комнаты — в самом вопросе они затёрты для broadcast.
  // До старта (в setPerformer) читаем из вопроса.
  wordList(gameState) {
    if (Array.isArray(gameState._priv.aliasWords)) return gameState._priv.aliasWords;
    const q = gameState.getCurrentQuestion();
    return (q.words || []).map(w => (w == null ? '' : String(w))).filter(w => w.trim());
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
    gameState.timers.aliasTimer = setTimeout(() => this.finishAlias(gameState, io), ms);
  }

  startAlias(gameState, target, io) {
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
    gameState.broadcast(io);
  }

  advanceAlias(gameState, io) {
    const st = gameState.state.aliasState;
    st.index++;
    if (st.index >= st.total) { this.finishAlias(gameState, io); return; }
    this.revealWord(gameState, io);
    gameState.broadcast(io);
  }

  finishAlias(gameState, io) {
    if (gameState.state.questionStatus !== 'alias_playing') return;
    if (gameState.timers.aliasTimer) { clearTimeout(gameState.timers.aliasTimer); delete gameState.timers.aliasTimer; }
    const st = gameState.state.aliasState;
    gameState.state.aliasResult = { guessed: st ? st.guessedCount : 0, total: st ? st.total : 0 };
    gameState.state.questionStatus = 'idle';
    gameState.privateReveal = null; // компонент прячет слово вне alias_playing и без явной чистки
    gameState.addLog(`Алиас завершён: угадано ${gameState.state.aliasResult.guessed} из ${gameState.state.aliasResult.total}.`, 'success');
    gameState.broadcast(io);
  }

  // --- Действия ----------------------------------------------------------

  handleAction(gameState, action, data, { io }) {
    const q = gameState.getCurrentQuestion() || {};
    const m = this.mode(q);

    if (action === 'host:setPerformer') {
      if (gameState.state.questionStatus !== 'performer_select') return;
      const target = this.pickSeated(gameState, data);
      if (!target) return;
      if (m === 'alias') this.startAlias(gameState, target, io);
      else this.startPerforming(gameState, target, io);
    } else if (action === 'host:awardGuess') {
      if (gameState.state.questionStatus !== 'performing') return;
      this.awardGuess(gameState, data, io);
    } else if (action === 'host:passQuestion') {
      if (gameState.state.questionStatus !== 'performing') return;
      gameState.state.performResult = { pass: true, performerId: gameState.state.performerId, answer: this.revealText(gameState) };
      gameState.state.questionStatus = 'idle';
      gameState.broadcast(io);
    } else if (action === 'host:aliasGuessed') {
      if (gameState.state.questionStatus !== 'alias_playing') return;
      const st = gameState.state.aliasState;
      const guesser = gameState.state.players.find(p => String(p.id) === String(data));
      if (guesser) {
        gameState.adjustScore(guesser.id, st.wordPoints);
        if (gameState.state.performerId) gameState.adjustScore(gameState.state.performerId, st.wordPoints);
        st.guessedCount++;
      }
      this.advanceAlias(gameState, io);
    } else if (action === 'host:aliasSkip') {
      if (gameState.state.questionStatus !== 'alias_playing') return;
      this.advanceAlias(gameState, io);
    }
  }
}

module.exports = ShowHandler;
