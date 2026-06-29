const BaseQuestionHandler = require('./BaseQuestionHandler');

class PokerHandler extends BaseQuestionHandler {
  constructor() {
    super('poker');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'poker_bidding';
    const initialBet = Math.floor(question.points / 5);
    
    gameState.state.pokerActivePlayers = gameState.state.players.map(p => p.id);
    gameState.state.pokerBets = {};
    gameState.state.players.forEach(p => {
      gameState.state.pokerBets[p.id] = initialBet;
    });
    gameState.state.pokerCurrentBet = initialBet;
    gameState.state.pokerTurnIdx = 0;
    gameState.state.pokerPlayersActed = [];
    gameState.addLog(`Вопрос-Покер! Принудительная базовая ставка: ${initialBet}`, 'warning');
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:pokerAction') {
      const { action: pokerAction, amount } = data;
      this.processPokerAction(gameState, user.id, pokerAction, amount);
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }

  processPokerAction(gameState, playerId, action, amount = 0) {
    if (gameState.state.questionStatus !== 'poker_bidding') return;
    const activeIdx = gameState.state.pokerTurnIdx;
    const activePlayerId = gameState.state.pokerActivePlayers[activeIdx];
    
    if (playerId !== activePlayerId) return;

    const q = gameState.getCurrentQuestion();
    const playerName = gameState.state.players.find(p=>p.id===playerId)?.name;
    
    if (action === 'fold') {
      gameState.state.pokerActivePlayers.splice(activeIdx, 1);
      gameState.addLog(`Игрок ${playerName} спасовал.`, 'info');
      if (gameState.state.pokerTurnIdx >= gameState.state.pokerActivePlayers.length) {
        gameState.state.pokerTurnIdx = 0;
      }
    } else if (action === 'call') {
      gameState.state.pokerBets[playerId] = gameState.state.pokerCurrentBet;
      gameState.addLog(`Игрок ${playerName} коллировал (${gameState.state.pokerCurrentBet}).`, 'info');
      if (!gameState.state.pokerPlayersActed.includes(playerId)) {
          gameState.state.pokerPlayersActed.push(playerId);
      }
      gameState.state.pokerTurnIdx = (gameState.state.pokerTurnIdx + 1) % gameState.state.pokerActivePlayers.length;
    } else if (action === 'raise') {
      const newTotal = gameState.state.pokerCurrentBet + amount;
      const player = gameState.state.players.find(p=>p.id===playerId);
      const maxAllowedTotal = Math.max(q.points, player ? player.score : 0);
      
      if (newTotal <= maxAllowedTotal && amount > 0) {
        gameState.state.pokerCurrentBet = newTotal;
        gameState.state.pokerBets[playerId] = newTotal;
        gameState.state.pokerPlayersActed = [playerId]; // Reset acted because bet increased
        gameState.addLog(`Игрок ${playerName} поднял ставку на ${amount}. Текущая ставка: ${newTotal}`, 'warning');
        gameState.state.pokerTurnIdx = (gameState.state.pokerTurnIdx + 1) % gameState.state.pokerActivePlayers.length;
      }
    }

    // Check if only one player left
    if (gameState.state.pokerActivePlayers.length === 1) {
      const winnerId = gameState.state.pokerActivePlayers[0];
      let totalPot = 0;
      for (const [pId, bet] of Object.entries(gameState.state.pokerBets)) {
        totalPot += bet;
        if (pId !== winnerId && gameState.state.players.find(p => p.id === pId)) {
          gameState.adjustScore(pId, -bet);
        }
      }
      const othersBets = totalPot - (gameState.state.pokerBets[winnerId] || 0);
      gameState.adjustScore(winnerId, othersBets);
      gameState.addLog(`Все спасовали! Игрок ${gameState.state.players.find(p=>p.id===winnerId)?.name} забирает банк ${totalPot} очков без ответа!`, 'success');
      gameState.closeQuestion();
      return;
    }

    let allEqual = true;
    for (let id of gameState.state.pokerActivePlayers) {
      if (gameState.state.pokerBets[id] !== gameState.state.pokerCurrentBet) {
        allEqual = false; break;
      }
    }

    const allActed = gameState.state.pokerActivePlayers.every(id => gameState.state.pokerPlayersActed.includes(id));

    if (allEqual && allActed) {
      let totalPot = 0;
      for (const pId of gameState.state.pokerActivePlayers) {
        const bet = gameState.state.pokerBets[pId] || 0;
        totalPot += bet;
        if (gameState.state.players.find(p => p.id === pId)) {
          gameState.adjustScore(pId, -bet);
        }
      }
      gameState.state.activeBet = totalPot;
      gameState.state.questionStatus = 'text_inputting';
      gameState.addLog(`Торги завершены! В банке ${totalPot} очков. Ожидание ответов оставшихся игроков.`, 'system');
    }
  }
}

module.exports = PokerHandler;
