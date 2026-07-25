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
      gameState.broadcast(io);
    } else if (action === 'host:revealSketches') {
      io.to(gameState.roomCode).emit('sketch:forceSubmit');
      setTimeout(() => {
        gameState.state.questionStatus = 'sketch_judging';
        gameState.broadcast(io);
      }, 800);
    } else if (action === 'player:voteSketch') {
      gameState.state.sketchVotes[user.id] = data;
      gameState.broadcast(io);
    } else if (action === 'host:awardSketchWinner') {
      const q = gameState.getCurrentQuestion();
      gameState.adjustScore(data, q.points);
      gameState.closeQuestion();
      gameState.broadcast(io);
    }
  }
}

module.exports = SketchHandler;
