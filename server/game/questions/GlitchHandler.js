const BaseQuestionHandler = require('./BaseQuestionHandler');

class GlitchHandler extends BaseQuestionHandler {
  constructor() {
    super('glitch');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'buzzer_active';
    gameState.state.glitchSeed = Math.floor(Math.random() * 1000000);
    gameState.state.buzzerReceiving = true;
    gameState.state.buzzerResults = [];
    gameState.addLog(`Активирован Glitch-вопрос!`, 'warning');
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:pauseGlitch' || action === 'player:pressBuzzer') {
      // Glitch specialized buzzer logic
      if (gameState.state.questionStatus !== 'buzzer_active' && gameState.state.questionStatus !== 'buzzer_countdown') return;
      
      gameState.clearTimers();
      gameState.state.questionStatus = 'answering';
      gameState.state.answeringPlayerId = user.id;
      gameState.state.buzzerReceiving = false;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = GlitchHandler;
