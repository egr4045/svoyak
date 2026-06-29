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
    
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
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
    
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  /**
   * Вспомогательный метод для перезапуска баззера (после неправильного ответа).
   */
  restartBuzzer(gameState, io) {
    gameState.clearTimers();
    gameState.state.questionStatus = 'buzzer_countdown';
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);

    gameState.timers.buzzerStart = setTimeout(() => {
      gameState.state.questionStatus = 'buzzer_active';
      gameState.state.buzzerReceiving = true;
      gameState.state.buzzerResults = [];
      delete gameState.timers.buzzerFirstHit;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }, 3000);
  }
}

module.exports = BaseQuestionHandler;
