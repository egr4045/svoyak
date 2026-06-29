const BaseQuestionHandler = require('./BaseQuestionHandler');

class CatHandler extends BaseQuestionHandler {
  constructor() {
    super('cat');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'cat_target_selection';
    gameState.state.catTargetId = null;
    gameState.addLog(`Активирован кот в мешке!`, 'warning');
    // Note: Automatic roulette is handled in roomHandlers or here if we want to move it.
    // Let's keep the option for manual selection or host trigger.
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'host:rouletteCatPlayer') {
      this.startRoulette(gameState, io);
    }
  }

  startRoulette(gameState, io) {
    gameState.state.questionStatus = 'cat_roulette';
    gameState.clearTimers();
    const available = gameState.state.players.filter(p => p.connected);
    const candidates = available.length > 0 ? available : gameState.state.players;
    const randomPlayerId = candidates[Math.floor(Math.random() * candidates.length)]?.id;
    gameState.state.catTargetId = randomPlayerId;
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    
    gameState.timers.catRoulette = setTimeout(() => {
      gameState.state.answeringPlayerId = randomPlayerId; 
      gameState.state.questionStatus = 'answering';
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }, 7500);
  }
}

module.exports = CatHandler;
