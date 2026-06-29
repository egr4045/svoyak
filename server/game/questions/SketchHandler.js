const BaseQuestionHandler = require('./BaseQuestionHandler');

class SketchHandler extends BaseQuestionHandler {
  constructor() {
    super('sketch');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'sketch_drawing';
    gameState.state.sketchAnswers = {};
    gameState.state.sketchVotes = {};
    gameState.addLog(`Активирован вопрос-скетч!`, 'warning');
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:submitSketch') {
      gameState.state.sketchAnswers[user.id] = data.dataUrl;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealSketches') {
      io.to(gameState.roomCode).emit('sketch:forceSubmit');
      setTimeout(() => {
        gameState.state.questionStatus = 'sketch_judging';
        io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
      }, 800);
    } else if (action === 'player:voteSketch') {
      gameState.state.sketchVotes[user.id] = data;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:awardSketchWinner') {
      const q = gameState.getCurrentQuestion();
      gameState.adjustScore(data, q.points);
      gameState.closeQuestion();
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = SketchHandler;
