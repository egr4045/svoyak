const BaseQuestionHandler = require('./BaseQuestionHandler');

// «Викторина» — единый тип вопрос-ответ, вобравший бывшие text / media / text_input /
// glitch / snippet / auction / cat (и мигрированный poker → ставка «аукцион»).
// Особенности включаются модификаторами вопроса:
//   answerMode: 'buzzer' (дефолт) | 'written'   — баззер или письменный ответ у всех
//   glitch: true                                — глитч-текст; первый нажавший сразу отвечает
//   snippet: true (+ mediaSrc)                  — фрагмент: «открыть больше» снижает цену
//   stake: 'none' (дефолт) | 'auction' | 'cat'  — обычный / торги вслепую / случайная жертва
// Приоритет несочетаемых комбинаций задаёт порядок ветвления в onSelect:
// ставка > фрагмент > письменный > глитч > медиа > чтение.
const SNIPPET_LEVELS = 5; // шагов раскрытия фрагмента до минимальной цены

class QuizHandler extends BaseQuestionHandler {
  constructor() { super('quiz'); }

  onSelect(gameState, question) {
    if (question.stake === 'auction') {
      gameState.state.questionStatus = 'auction_bidding';
      gameState.state.activeBet = Math.ceil(question.points / 5);
      gameState.state.auctionBets = {};
      gameState.addLog(`Аукцион! Начальная ставка: ${gameState.state.activeBet}`, 'warning');
      return;
    }
    if (question.stake === 'cat') {
      gameState.state.questionStatus = 'cat_target_selection';
      gameState.state.catTargetId = null;
      gameState.addLog(`Активирован кот в мешке!`, 'warning');
      return;
    }
    if (question.snippet && question.mediaSrc) {
      gameState.state.questionStatus = 'snippet_playing';
      gameState.state.snippetLevel = 0;
      gameState.state.activeBet = question.points; // стартовая (полная) цена
      gameState.addLog('Угадай по фрагменту!', 'info');
      return;
    }
    if (question.answerMode === 'written') {
      gameState.state.questionStatus = 'text_inputting';
      gameState.addLog(`Активирован вопрос с вводом текста!`, 'info');
      return;
    }
    if (question.glitch) {
      gameState.state.questionStatus = 'buzzer_active';
      gameState.state.glitchSeed = Math.floor(Math.random() * 1000000);
      gameState.state.buzzerReceiving = true;
      gameState.state.buzzerResults = [];
      gameState.state.buzzerOpenedAt = Date.now();
      gameState.addLog(`Активирован Glitch-вопрос!`, 'warning');
      return;
    }
    if (question.mediaSrc || question.mediaType) {
      gameState.state.questionStatus = 'buzzer_active';
      gameState.state.buzzerReceiving = true;
      gameState.state.buzzerResults = [];
      gameState.state.buzzerOpenedAt = Date.now();
      gameState.addLog(`Активирован медиа-вопрос! Баззер включен.`, 'info');
      return;
    }
    super.onSelect(gameState, question);
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    const q = gameState.getCurrentQuestion() || {};

    // Глитч-баззер: первый нажавший сразу отвечает, без окна сбора откликов
    if (action === 'player:pauseGlitch' || action === 'player:pressBuzzer') {
      if (!q.glitch) return;
      if (gameState.state.questionStatus !== 'buzzer_active' && gameState.state.questionStatus !== 'buzzer_countdown') return;
      gameState.clearTimers();
      gameState.state.questionStatus = 'answering';
      gameState.state.answeringPlayerId = user.id;
      gameState.state.buzzerReceiving = false;
      gameState.broadcast(io);
      return;
    }

    // Письменные ответы (и ответ банка при ничьей аукциона)
    if (action === 'player:submitTextAnswer') {
      const playerExists = gameState.state.players.some(p => p.id === user.id);
      if (!playerExists) return;
      gameState.state.textAnswers[user.id] = data.text;
      gameState.broadcast(io);
    } else if (action === 'host:revealTextAnswers') {
      gameState.state.questionStatus = 'text_judging';
      gameState.broadcast(io);
    } else if (action === 'host:judgeSingleTextAnswer') {
      const { playerId, isCorrect } = data;
      const points = gameState.state.activeBet !== null ? gameState.state.activeBet : q.points;
      // playerId — ключ textAnswers (строка), p.id — числовой id из БД → String-сравнение
      const targetPlayer = gameState.state.players.find(p => String(p.id) === String(playerId));
      if (!targetPlayer) return;
      gameState.adjustScore(playerId, isCorrect ? points : -points);
      delete gameState.state.textAnswers[playerId];
      gameState.broadcast(io);

    // Ставка «аукцион»
    } else if (action === 'player:submitAuctionBet') {
      const { betAmount } = data;
      const player = gameState.state.players.find(p => p.id === user.id);
      const playerBalance = player?.score || 0;
      const maxAllowed = playerBalance <= 0 ? q.points : playerBalance;
      if (typeof betAmount !== 'number' || betAmount < 1 || betAmount > maxAllowed) return;
      gameState.state.auctionBets[user.id] = betAmount;
      gameState.broadcast(io);
    } else if (action === 'host:revealAuctionBets') {
      this.revealAuctionBets(gameState, io);

    // Ставка «кот в мешке»
    } else if (action === 'host:rouletteCatPlayer') {
      this.startRoulette(gameState, io);

    // Фрагмент: открыть больше → цена вниз (скоринг не меняем — база берёт activeBet)
    } else if (action === 'host:revealMore') {
      const step = Math.max(1, Math.round(q.points / SNIPPET_LEVELS));
      const minPrice = Math.max(1, q.points - (SNIPPET_LEVELS - 1) * step);
      gameState.state.snippetLevel = (gameState.state.snippetLevel || 0) + 1;
      gameState.state.activeBet = Math.max(minPrice, q.points - gameState.state.snippetLevel * step);
      gameState.addLog(`Открыто больше — цена ${gameState.state.activeBet}.`, 'warning');
      gameState.broadcast(io);
    }
  }

  // При ставке отвечает один назначенный (победитель торгов/жертва рулетки):
  // неверный ответ закрывает вопрос, а НЕ открывает общий баззер
  onWrong(gameState, ctx) {
    const q = gameState.getCurrentQuestion() || {};
    if (q.stake === 'auction' || q.stake === 'cat') {
      const { io } = ctx;
      const points = gameState.state.activeBet !== null ? gameState.state.activeBet : q.points;
      gameState.adjustScore(gameState.state.answeringPlayerId, -points);
      gameState.state.answeringPlayerId = null;
      gameState.state.showAnswer = true;
      gameState.state.questionStatus = 'idle';
      gameState.broadcast(io);
      return;
    }
    super.onWrong(gameState, ctx);
  }

  revealAuctionBets(gameState, io) {
    if (gameState.state.questionStatus !== 'auction_bidding') return;

    let maxBet = -Infinity;
    let winners = [];
    for (const [pId, bet] of Object.entries(gameState.state.auctionBets)) {
      if (bet > maxBet) { maxBet = bet; winners = [pId]; }
      else if (bet === maxBet) { winners.push(pId); }
    }

    if (winners.length === 0) return;

    gameState.clearTimers();
    gameState.state.activeBet = maxBet;

    // Ключи auctionBets — строки; канонизируем в настоящие id игроков, иначе
    // downstream-сравнения (onCorrect/adjustScore/клиент) молча промахиваются
    const byId = (id) => gameState.state.players.find(p => String(p.id) === String(id));

    if (winners.length > 1) {
      gameState.state.questionStatus = 'text_inputting';
      gameState.state.auctionTiePlayers = winners.map(id => byId(id)?.id ?? id);
      gameState.addLog(`Аукцион: ничья! Отвечают текстом: ${winners.map(id => byId(id)?.name).join(', ')}`, 'warning');
    } else {
      const winner = byId(winners[0]);
      gameState.state.answeringPlayerId = winner ? winner.id : winners[0];
      gameState.state.questionStatus = 'answering';
      gameState.addLog(`Аукцион: победил ${winner?.name} со ставкой ${maxBet}!`, 'success');
    }
    gameState.broadcast(io);
  }

  startRoulette(gameState, io) {
    gameState.state.questionStatus = 'cat_roulette';
    gameState.clearTimers();
    const available = gameState.state.players.filter(p => p.connected);
    const candidates = available.length > 0 ? available : gameState.state.players;
    const randomPlayerId = candidates[Math.floor(Math.random() * candidates.length)]?.id;
    gameState.state.catTargetId = randomPlayerId;
    gameState.broadcast(io);

    gameState.timers.catRoulette = setTimeout(() => {
      gameState.state.answeringPlayerId = randomPlayerId;
      gameState.state.questionStatus = 'answering';
      gameState.broadcast(io);
    }, 7500);
  }
}

module.exports = QuizHandler;
