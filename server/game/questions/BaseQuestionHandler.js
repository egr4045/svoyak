class BaseQuestionHandler {
  constructor(type) {
    this.type = type;
  }

  /**
   * Вызывается при выборе вопроса на доске.
   */
  onSelect(gameState, question) {
    gameState.state.questionStatus = 'reading';
    gameState.addLog(`Выбран вопрос: ${gameState.state.board[gameState.state.activeCell.catIdx].category} за ${question.points}`, 'info');
  }

  /**
   * Вызывается сразу после onSelect, но уже с доступом к io (для типов, которым нужно
   * что-то разослать/запустить таймер при открытии вопроса — напр. «горячая картошка»).
   */
  afterSelect(gameState, context) {
    // по умолчанию ничего
  }

  /**
   * Вызывается при закрытии вопроса (переход обратно к доске).
   */
  onClose(gameState) {
    // Базовая очистка уже в GameState.closeQuestion, 
    // здесь можно добавить специфичную для типа логику.
  }

  /**
   * Обработка специфичных действий типа вопроса.
   */
  handleAction(gameState, action, data, { io, socket, user }) {
    console.warn(`Action ${action} not implemented for ${this.type}`);
  }

  /**
   * Логика при подтверждении правильного ответа.
   */
  onCorrect(gameState, { io }) {
    const q = gameState.getCurrentQuestion();
    const points = gameState.state.activeBet !== null ? gameState.state.activeBet : q.points;
    
    gameState.adjustScore(gameState.state.answeringPlayerId, points);
    gameState.setSelectingPlayer(gameState.state.answeringPlayerId);
    
    gameState.state.answeringPlayerId = null;
    gameState.state.showAnswer = true;
    gameState.state.questionStatus = 'idle';
    
    gameState.broadcast(io);
  }

  /**
   * Логика при подтверждении неправильного ответа.
   */
  onWrong(gameState, { io }) {
    const q = gameState.getCurrentQuestion();
    const points = gameState.state.activeBet !== null ? gameState.state.activeBet : q.points;
    
    gameState.adjustScore(gameState.state.answeringPlayerId, -points);
    gameState.state.failedPlayers.push(gameState.state.answeringPlayerId);
    gameState.state.answeringPlayerId = null;

    if (gameState.state.failedPlayers.length >= gameState.state.players.length) {
      gameState.state.showAnswer = true;
      gameState.state.questionStatus = 'idle';
    } else {
      this.restartBuzzer(gameState, io);
    }
    
    gameState.broadcast(io);
  }

  /**
   * Вспомогательный метод для перезапуска баззера (после неправильного ответа).
   */
  restartBuzzer(gameState, io) {
    gameState.clearTimers();
    gameState.state.questionStatus = 'buzzer_countdown';
    gameState.broadcast(io);

    gameState.timers.buzzerStart = setTimeout(() => {
      gameState.state.questionStatus = 'buzzer_active';
      gameState.state.buzzerReceiving = true;
      gameState.state.buzzerResults = [];
      gameState.state.buzzerOpenedAt = Date.now(); // якорь анти-чита реакции
      delete gameState.timers.buzzerFirstHit;
      gameState.broadcast(io);
    }, 3000);
  }
}

module.exports = BaseQuestionHandler;
