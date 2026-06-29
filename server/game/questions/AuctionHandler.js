const BaseQuestionHandler = require('./BaseQuestionHandler');

class AuctionHandler extends BaseQuestionHandler {
  constructor() {
    super('auction');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'auction_bidding';
    gameState.state.activeBet = Math.ceil(question.points / 5);
    gameState.state.auctionBets = {};
    gameState.addLog(`Аукцион! Начальная ставка: ${gameState.state.activeBet}`, 'warning');
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:submitAuctionBet') {
      const { betAmount } = data;
      const player = gameState.state.players.find(p => p.id === user.id);
      const playerBalance = player?.score || 0;
      const q = gameState.getCurrentQuestion();
      const maxAllowed = playerBalance <= 0 ? q.points : playerBalance;
      
      if (typeof betAmount !== 'number' || betAmount < 1 || betAmount > maxAllowed) return;
      
      gameState.state.auctionBets[user.id] = betAmount;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealAuctionBets') {
      this.revealAuctionBets(gameState, io);
    }
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

    if (winners.length > 1) {
      gameState.state.questionStatus = 'text_inputting';
      gameState.state.auctionTiePlayers = winners;
      gameState.addLog(`Аукцион: ничья! Отвечают текстом: ${winners.map(id => gameState.state.players.find(p=>p.id===id)?.name).join(', ')}`, 'warning');
    } else {
      gameState.state.answeringPlayerId = winners[0];
      gameState.state.questionStatus = 'answering';
      gameState.addLog(`Аукцион: победил ${gameState.state.players.find(p=>p.id===winners[0])?.name} со ставкой ${maxBet}!`, 'success');
    }
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = AuctionHandler;
