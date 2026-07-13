const BaseQuestionHandler = require('./BaseQuestionHandler');

// Горячая картошка: игроки по кругу называют варианты из категории (голосом) и передают ход.
// Скрытый случайный таймер «взрывается» — держатель в этот момент теряет очки. Время взрыва
// не в broadcast (иначе не страшно). Ход двигает только текущий держатель (player:passPotato).
class PotatoHandler extends BaseQuestionHandler {
  constructor() { super('potato'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'potato_playing';
    const conn = gameState.state.players.filter(p => p.connected);
    const pool = conn.length ? conn : gameState.state.players;
    gameState.state.potatoRing = pool.map(p => p.id);
    gameState.state.potatoTurnId = gameState.state.potatoRing[0] || null;
    gameState.state.potatoResult = null;
    gameState.addLog('Горячая картошка! Называйте по очереди и передавайте.', 'warning');
  }

  // io доступен только после onSelect (см. roomHandlers host:selectQuestion → room.afterSelect)
  afterSelect(gameState, { io }) {
    this.armBomb(gameState, io);
  }

  armBomb(gameState, io) {
    if (gameState.timers.potatoBomb) clearTimeout(gameState.timers.potatoBomb);
    const ms = 15000 + Math.floor(Math.random() * 25000); // 15–40с, скрыто от игроков
    gameState.timers.potatoBomb = setTimeout(() => this.explode(gameState, io), ms);
  }

  explode(gameState, io) {
    if (gameState.state.questionStatus !== 'potato_playing') return;
    if (gameState.timers.potatoBomb) { clearTimeout(gameState.timers.potatoBomb); delete gameState.timers.potatoBomb; }
    const q = gameState.getCurrentQuestion();
    const loserId = gameState.state.potatoTurnId;
    if (loserId) gameState.adjustScore(loserId, -(q.points || 0));
    gameState.state.potatoResult = { loserId };
    gameState.state.questionStatus = 'idle';
    const name = gameState.state.players.find(p => p.id === loserId)?.name;
    gameState.addLog(`💥 Взорвалась у ${name || '—'}! −${q.points}.`, 'error');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:passPotato') {
      if (gameState.state.questionStatus !== 'potato_playing') return;
      if (String(gameState.state.potatoTurnId) !== String(user.id)) return; // только держатель
      const ring = gameState.state.potatoRing || [];
      if (!ring.length) return;
      const idx = ring.findIndex(id => String(id) === String(user.id));
      gameState.state.potatoTurnId = ring[(idx + 1) % ring.length];
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = PotatoHandler;
