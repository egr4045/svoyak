const BaseQuestionHandler = require('./BaseQuestionHandler');

class StandardHandler extends BaseQuestionHandler {
  constructor(type) {
    super(type);
  }

  onSelect(gameState, question) {
    if (this.type === 'media') {
       gameState.state.questionStatus = 'buzzer_active';
       gameState.state.buzzerReceiving = true;
       gameState.state.buzzerResults = [];
       gameState.addLog(`Активирован медиа-вопрос! Баззер включен.`, 'info');
    } else if (this.type === 'text_input') {
      gameState.state.questionStatus = 'text_inputting';
      gameState.addLog(`Активирован вопрос с вводом текста!`, 'info');
    } else {
      super.onSelect(gameState, question);
    }
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:submitTextAnswer') {
      const playerExists = gameState.state.players.some(p => p.id === user.id);
      if (!playerExists) return;
      
      gameState.state.textAnswers[user.id] = data.text;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealTextAnswers') {
      gameState.state.questionStatus = 'text_judging';
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:judgeSingleTextAnswer') {
      const { playerId, isCorrect } = data;
      const q = gameState.getCurrentQuestion();
      const points = gameState.state.activeBet !== null ? gameState.state.activeBet : q.points;
      
      const targetPlayer = gameState.state.players.find(p => p.id === playerId);
      if (!targetPlayer) return;

      if (isCorrect) {
        gameState.adjustScore(playerId, points);
      } else {
        gameState.adjustScore(playerId, -points);
      }
      delete gameState.state.textAnswers[playerId];
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = StandardHandler;
