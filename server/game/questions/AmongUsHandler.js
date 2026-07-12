const BaseQuestionHandler = require('./BaseQuestionHandler');

class AmongUsHandler extends BaseQuestionHandler {
  constructor() {
    super('among_us');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'text_inputting';
    if (gameState.state.players.length > 0) {
      const randomIdx = Math.floor(Math.random() * gameState.state.players.length);
      gameState.state.imposterId = gameState.state.players[randomIdx].id;
    }
    gameState.state.amongUsTimerState = null;
    gameState.addLog(`Амогус! Шпион среди нас.`, 'error');
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:submitTextAnswer') {
      gameState.state.textAnswers[user.id] = data.text;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealTextAnswers') {
       gameState.state.questionStatus = 'text_judging';
       io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:judgeSingleTextAnswer') {
       const { playerId, isCorrect } = data;
       const q = gameState.getCurrentQuestion();
       const points = q.points;
       if (isCorrect) gameState.adjustScore(playerId, points);
       else gameState.adjustScore(playerId, -points);
       delete gameState.state.textAnswers[playerId];
       io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:startAmongUsTimer') {
      gameState.state.questionStatus = 'among_us_voting';
      gameState.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + 120000, timeLeft: 120 };
      gameState.state.amongUsVotes = {};
      // Авто-вскрытие по истечении времени, чтобы голосование не зависало навсегда
      gameState.timers.amongUsAuto = setTimeout(() => this.revealAmongUs(gameState, io), 120000);
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:pauseAmongUsTimer') {
      gameState.state.amongUsTimerState = { status: 'paused', timeLeft: data.timeLeft };
      if (gameState.timers.amongUsAuto) { clearTimeout(gameState.timers.amongUsAuto); delete gameState.timers.amongUsAuto; }
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:resumeAmongUsTimer') {
      gameState.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + data.timeLeft * 1000, timeLeft: data.timeLeft };
      if (gameState.timers.amongUsAuto) clearTimeout(gameState.timers.amongUsAuto);
      gameState.timers.amongUsAuto = setTimeout(() => this.revealAmongUs(gameState, io), data.timeLeft * 1000);
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'player:voteAmongUs') {
      if (gameState.state.questionStatus !== 'among_us_voting') return;
      if (!gameState.state.amongUsVotes) gameState.state.amongUsVotes = {};
      gameState.state.amongUsVotes[user.id] = data;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealAmongUs') {
      this.revealAmongUs(gameState, io);
    }
  }

  revealAmongUs(gameState, io) {
    if (gameState.state.amongUsResult) return;
    
    const imposterId = gameState.state.imposterId;
    const votes = gameState.state.amongUsVotes || {};
    const q = gameState.getCurrentQuestion();
    if (!q) return;
     
    const validPlayersCount = Object.keys(gameState.state.textAnswers).length || gameState.state.players.length;
    let imposterVotes = 0;
    Object.values(votes).forEach(vote => { if(vote === imposterId) imposterVotes++; });
     
    if (imposterVotes >= Math.ceil(validPlayersCount / 2)) {
       gameState.state.amongUsResult = 'crew_win';
       gameState.adjustScore(imposterId, -q.points * 2);
       for (const [voter, target] of Object.entries(votes)) {
         if (target === imposterId && voter !== imposterId) gameState.adjustScore(voter, q.points);
       }
       gameState.addLog(`Мирные победили! Шпион ${gameState.state.players.find(p=>p.id===imposterId)?.name} разоблачен.`, 'success');
    } else {
       gameState.state.amongUsResult = 'imposter_win';
       gameState.adjustScore(imposterId, q.points * 2);
       for (const [voter, target] of Object.entries(votes)) {
         if (voter !== imposterId) gameState.adjustScore(voter, -q.points);
       }
       gameState.addLog(`Шпион победил! Им был ${gameState.state.players.find(p=>p.id===imposterId)?.name}.`, 'error');
    }
     
    gameState.state.showAnswer = true;
    gameState.clearTimers();
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = AmongUsHandler;
