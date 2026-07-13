const BaseQuestionHandler = require('./BaseQuestionHandler');

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const CHOICES = ['rock', 'paper', 'scissors'];

// Камень-ножницы-бумага: ведущий выбирает двух дуэлянтов, те тайно выбирают (sealed store,
// вне broadcast), при обоих выборах — вскрытие и очки победителю. Ничья → переигровка.
class RpsHandler extends BaseQuestionHandler {
  constructor() { super('rps'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'rps_picking';
    gameState.state.duelState = {
      aId: null, bId: null, aReady: false, bReady: false,
      revealed: false, aPick: null, bPick: null, winnerId: null, tie: false
    };
    gameState.addLog('Камень-ножницы-бумага! Ведущий выбирает дуэлянтов.', 'warning');
  }

  handleAction(gameState, action, data, { io, user }) {
    const ds = gameState.state.duelState;
    if (!ds) return;

    if (action === 'host:setDuel') {
      if (ds.revealed) return;
      if (data == null) {                       // сброс выбора дуэлянтов
        Object.assign(ds, { aId: null, bId: null, aReady: false, bReady: false, tie: false });
        gameState.sealed = {};
      } else {
        const target = gameState.state.players.find(p => String(p.id) === String(data));
        if (!target) return;
        if (ds.aId == null) ds.aId = target.id;
        else if (ds.bId == null && String(target.id) !== String(ds.aId)) ds.bId = target.id;
      }
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);

    } else if (action === 'host:revealDuel') {
      if (ds.aReady && ds.bReady) this.resolve(gameState, io);

    } else if (action === 'player:rpsPick') {
      if (ds.revealed || ds.aId == null || ds.bId == null) return;
      const choice = data && data.choice;
      if (!CHOICES.includes(choice)) return;
      const uid = String(user.id);
      if (uid !== String(ds.aId) && uid !== String(ds.bId)) return; // только дуэлянты
      gameState.sealed[uid] = choice;           // тайно, вне broadcast
      if (uid === String(ds.aId)) ds.aReady = true;
      if (uid === String(ds.bId)) ds.bReady = true;
      ds.tie = false;
      if (ds.aReady && ds.bReady) this.resolve(gameState, io);
      else io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }

  resolve(gameState, io) {
    const ds = gameState.state.duelState;
    const q = gameState.getCurrentQuestion();
    const a = gameState.sealed[String(ds.aId)];
    const b = gameState.sealed[String(ds.bId)];
    if (a === b) {                              // ничья — переигровка
      ds.tie = true; ds.aReady = false; ds.bReady = false;
      delete gameState.sealed[String(ds.aId)];
      delete gameState.sealed[String(ds.bId)];
      gameState.addLog('Ничья — выбираем заново.', 'info');
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
      return;
    }
    ds.tie = false;
    ds.aPick = a; ds.bPick = b; ds.revealed = true;
    ds.winnerId = (BEATS[a] === b) ? ds.aId : ds.bId;
    gameState.adjustScore(ds.winnerId, q.points);
    const wName = gameState.state.players.find(p => p.id === ds.winnerId)?.name;
    gameState.addLog(`Победил ${wName} (${a} vs ${b}).`, 'success');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = RpsHandler;
