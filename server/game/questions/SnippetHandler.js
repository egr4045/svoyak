const BaseQuestionHandler = require('./BaseQuestionHandler');

// Угадай по фрагменту: медиа + баззер. «Открыть больше» снижает цену (state.activeBet),
// а скоринг НЕ переопределяется — база onCorrect/onWrong уже берёт activeBet вместо q.points.
// Ведущий: играет медиа (host:controlMedia) → при желании «Открыть больше» → «Пуск баззера».
const LEVELS = 5; // столько шагов раскрытия до минимальной цены

class SnippetHandler extends BaseQuestionHandler {
  constructor() { super('snippet'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'snippet_playing';
    gameState.state.snippetLevel = 0;
    gameState.state.activeBet = question.points; // стартовая (полная) цена
    gameState.addLog('Угадай по фрагменту!', 'info');
  }

  handleAction(gameState, action, data, { io }) {
    if (action === 'host:revealMore') {
      const q = gameState.getCurrentQuestion();
      const step = Math.max(1, Math.round(q.points / LEVELS));
      const minPrice = Math.max(1, q.points - (LEVELS - 1) * step);
      gameState.state.snippetLevel = (gameState.state.snippetLevel || 0) + 1;
      gameState.state.activeBet = Math.max(minPrice, q.points - gameState.state.snippetLevel * step);
      gameState.addLog(`Открыто больше — цена ${gameState.state.activeBet}.`, 'warning');
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = SnippetHandler;
