const initialGameData = require('./initialData');

class GameState {
  constructor(roomCode, hostUser) {
    this.roomCode = roomCode;
    this.state = this.getInitialState(hostUser);
    this.timers = {};
  }

  getInitialState(hostUser) {
    return {
      host: { id: hostUser.id, username: hostUser.username, socketId: null, connected: false },
      gameStarted: false,
      roundsData: JSON.parse(JSON.stringify(initialGameData)),
      currentRoundIndex: 0,
      board: [], // categories of the current round
      players: [], // { id, name, avatar, score, connected, socketId, loadedAssets }
      activeCell: null,
      showAnswer: false,
      questionStatus: 'idle', // 'reading', 'buzzer_active', 'answering', 'auction_bidding', 'question_highlighted' etc
      answeringPlayerId: null,
      selectingPlayerId: null, // Кто сейчас выбирает вопрос
      highlightedQuestion: null, // {catIdx, qIdx} - вопрос, выбранный игроком, ожидающий подтверждения
      failedPlayers: [],
      activeBet: null,
      glitchSeed: null,
      textAnswers: {},
      sketchAnswers: {},
      sketchVotes: {},
      pokerActivePlayers: [],
      pokerBets: {},
      pokerCurrentBet: 0,
      pokerTurnIdx: 0,
      pokerPlayersActed: [],
      imposterId: null,
      amongUsVotes: {},
      amongUsResult: null,
      amongUsTimerState: null,
      revealedTextAnswers: false,
      auctionBets: {},
      catTargetId: null,
      mediaState: { status: 'stopped', currentTime: 0 },
      eventLog: []
    };
  }

  addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    this.state.eventLog.unshift({ time, text, type });
    if (this.state.eventLog.length > 50) this.state.eventLog.pop();
  }

  addPlayer(user) {
    let p = this.state.players.find(x => x.id === user.id);
    if (!p) {
      p = { 
        id: user.id, 
        name: user.username, 
        avatar: user.avatar, 
        score: 0, 
        connected: false, 
        socketId: null,
        loadedAssets: false 
      };
      this.state.players.push(p);
      this.addLog(`Игрок ${user.username} присоединился к лобби.`, 'info');
    }
    return p;
  }

  removePlayer(playerId) {
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    this.addLog(`Игрок удален из лобби.`, 'warning');
  }

  setPlayerConnection(userId, socketId, isConnected) {
    if (this.state.host.id === userId) {
      this.state.host.socketId = isConnected ? socketId : null;
      this.state.host.connected = isConnected;
      return;
    }
    const p = this.state.players.find(x => x.id === userId);
    if (p) {
      p.socketId = isConnected ? socketId : null;
      p.connected = isConnected;
    }
  }

  setPlayerLoaded(userId, isLoaded) {
    const p = this.state.players.find(x => x.id === userId);
    if (p) p.loadedAssets = isLoaded;
  }

  startGame() {
    this.state.gameStarted = true;
    this.state.questionStatus = 'showing_round_splash';
    this.state.board = this.state.roundsData[this.state.currentRoundIndex].categories;
    this.addLog('Игра началась!', 'system');
  }

  startRound() {
    this.state.questionStatus = 'idle';
    this.addLog(`Начат раунд: ${this.state.roundsData[this.state.currentRoundIndex].name}`, 'system');
  }

  nextRound() {
    if (this.state.currentRoundIndex < this.state.roundsData.length - 1) {
      this.state.currentRoundIndex++;
      this.state.board = this.state.roundsData[this.state.currentRoundIndex].categories;
      this.state.questionStatus = 'showing_round_splash';
    } else {
      this.state.questionStatus = 'game_over';
      this.addLog('Игра окончена!', 'system');
    }
  }

  getCurrentQuestion() {
    if (!this.state.activeCell) return null;
    return this.state.board[this.state.activeCell.catIdx].questions[this.state.activeCell.qIdx];
  }

  adjustScore(playerId, amount) {
    const p = this.state.players.find(x => x.id === playerId);
    if (p) {
      p.score += amount;
      const sign = amount > 0 ? '+' : '';
      this.addLog(`Игрок ${p.name} ${sign}${amount} очков.`, amount > 0 ? 'success' : 'error');
    }
  }

  selectQuestion(catIdx, qIdx) {
    const q = this.state.board[catIdx].questions[qIdx];
    if (q.answered) return;
    
    this.state.activeCell = { catIdx, qIdx };
    this.state.showAnswer = false;
    this.state.answeringPlayerId = null;
    this.state.highlightedQuestion = null;
    this.state.failedPlayers = [];
    this.state.textAnswers = {};
    this.state.revealedTextAnswers = false;
    this.state.amongUsVotes = {};
    this.state.amongUsResult = null;
    this.state.activeBet = null;
    this.state.auctionBets = {};
    this.state.catTargetId = null;
    this.state.mediaState = { status: 'stopped', currentTime: 0 };

    if (q.type === 'media') {
       this.state.questionStatus = 'buzzer_active';
       this.state.buzzerReceiving = true;
       this.state.buzzerResults = [];
       this.addLog(`Активирован медиа-вопрос! Баззер включен.`, 'info');
    } else if (q.type === 'text_input') {
      this.state.questionStatus = 'text_inputting';
    } else if (q.type === 'glitch') {
      this.state.questionStatus = 'buzzer_active';
      this.state.glitchSeed = Math.floor(Math.random() * 1000000);
      this.state.buzzerReceiving = true;
      this.state.buzzerResults = [];
      this.addLog(`Активирован Glitch-вопрос!`, 'warning');
    } else if (q.type === 'sketch') {
      this.state.questionStatus = 'sketch_drawing';
      this.state.sketchAnswers = {};
      this.state.sketchVotes = {};
      this.addLog(`Активирован вопрос-скетч!`, 'warning');
    } else if (q.type === 'poker') {
      this.state.questionStatus = 'poker_bidding';
      const initialBet = Math.floor(q.points / 5);
      
      this.state.pokerActivePlayers = this.state.players.map(p => p.id);
      this.state.pokerBets = {};
      this.state.players.forEach(p => {
        this.state.pokerBets[p.id] = initialBet;
      });
      this.state.pokerCurrentBet = initialBet;
      this.state.pokerTurnIdx = 0;
      this.state.pokerPlayersActed = [];
      this.addLog(`Вопрос-Покер! Принудительная базовая ставка: ${initialBet}`, 'warning');
    } else if (q.type === 'among_us') {
      this.state.questionStatus = 'text_inputting';
      if (this.state.players.length > 0) {
        const randomIdx = Math.floor(Math.random() * this.state.players.length);
        this.state.imposterId = this.state.players[randomIdx].id;
      }
      this.state.amongUsTimerState = null;
      this.addLog(`Амогус! Шпион среди нас.`, 'error');
    } else if (q.type === 'cat') {
      this.state.questionStatus = 'cat_target_selection';
    } else if (q.type === 'auction') {
      this.state.questionStatus = 'auction_bidding';
      // Implement initial bet per requirements 1/5
      this.state.activeBet = Math.ceil(q.points / 5);
      this.addLog(`Аукцион! Начальная ставка: ${this.state.activeBet}`, 'warning');
    } else {
      this.state.questionStatus = 'reading';
    }
    this.addLog(`Выбран вопрос: ${this.state.board[catIdx].category} за ${q.points}`, 'info');
  }

  clearTimers() {
    for (const key in this.timers) {
      clearTimeout(this.timers[key]);
      delete this.timers[key];
    }
  }

  closeQuestion() {
    this.clearTimers();
    if (this.state.activeCell) {
      this.state.board[this.state.activeCell.catIdx].questions[this.state.activeCell.qIdx].answered = true;
    }
    this.state.activeCell = null;
    this.state.showAnswer = false;
    this.state.questionStatus = 'idle';
    this.state.activeBet = null;
    this.state.highlightedQuestion = null;
    this.state.answeringPlayerId = null;
    this.state.catTargetId = null;
    this.state.auctionTiePlayers = [];
    this.state.buzzerResults = [];
    this.state.textAnswers = {};
    this.state.amongUsTimerState = null;
    this.state.amongUsVotes = {};
    // Баг #6: сбрасываем imposterId и glitchSeed, чтобы не протекали в следующий вопрос
    this.state.imposterId = null;
    this.state.glitchSeed = null;
    this.state.failedPlayers = [];
  }

  resetGame() {
    this.clearTimers();
    // Баг #7: пересоздаём roundsData из исходных данных, иначе вопросы остаются answered:true
    this.state.roundsData = JSON.parse(JSON.stringify(initialGameData));
    this.state.board = [];
    this.state.questionStatus = 'idle';
    this.state.answeringPlayerId = null;
    this.state.selectingPlayerId = null;
    this.state.activeCell = null;
    this.state.showAnswer = false;
    this.state.imposterId = null;
    this.state.glitchSeed = null;
    this.state.amongUsTimerState = null;
    this.state.revealedTextAnswers = false;
    this.state.auctionBets = {};
    this.state.catTargetId = null;
    this.state.auctionTiePlayers = [];
    this.state.textAnswers = {};
    this.state.sketchAnswers = {};
    this.state.pokerActivePlayers = [];
    this.state.pokerBets = {};
    this.state.failedPlayers = [];
    this.state.highlightedQuestion = null;
    this.state.activeBet = null;
    this.state.buzzerResults = [];
    this.state.players.forEach(p => p.score = 0);
    this.state.gameStarted = false;
    this.state.currentRoundIndex = 0;
    this.addLog('Ведущий сбросил игру.', 'warning');
  }

  setSelectingPlayer(playerId) {
    this.state.selectingPlayerId = playerId;
    const p = this.state.players.find(x => x.id === playerId);
    if (p) this.addLog(`Право выбора передано: ${p.name}`, 'info');
  }

  highlightQuestion(catIdx, qIdx) {
    if (this.state.questionStatus !== 'idle') return;
    this.state.highlightedQuestion = { catIdx, qIdx };
    // Не меняем статус полностью, просто добавляем подсветку
  }

  pokerAction(playerId, action, amount = 0) {
    if (this.state.questionStatus !== 'poker_bidding') return;
    const activeIdx = this.state.pokerTurnIdx;
    const activePlayerId = this.state.pokerActivePlayers[activeIdx];
    
    if (playerId !== activePlayerId) return;

    const q = this.getCurrentQuestion();
    const playerName = this.state.players.find(p=>p.id===playerId)?.name;
    
    if (action === 'fold') {
      // Баг #2: убираем игрока из активных, НЕ добавляем в pokerPlayersActed
      // (сфолдивший не участвует в проверке allActed)
      this.state.pokerActivePlayers.splice(activeIdx, 1);
      this.addLog(`Игрок ${playerName} спасовал.`, 'info');
      // Индекс не двигаем явно: после splice следующий элемент занял текущую позицию,
      // но если удалили последнего — сбрасываем на начало
      if (this.state.pokerTurnIdx >= this.state.pokerActivePlayers.length) {
        this.state.pokerTurnIdx = 0;
      }
    } else if (action === 'call') {
      this.state.pokerBets[playerId] = this.state.pokerCurrentBet;
      this.addLog(`Игрок ${playerName} коллировал (${this.state.pokerCurrentBet}).`, 'info');
      this.state.pokerPlayersActed.push(playerId);
      this.state.pokerTurnIdx = (this.state.pokerTurnIdx + 1) % this.state.pokerActivePlayers.length;
    } else if (action === 'raise') {
      // Баг #1: newTotal считаем так же как на клиенте: pokerCurrentBet + amount
      // (клиент отправляет шаг рейза, а не итоговую сумму)
      const newTotal = this.state.pokerCurrentBet + amount;
      const player = this.state.players.find(p=>p.id===playerId);
      const maxAllowedTotal = Math.max(q.points, player ? player.score : 0);
      
      if (newTotal <= maxAllowedTotal && amount > 0) {
        this.state.pokerCurrentBet = newTotal;
        this.state.pokerBets[playerId] = newTotal;
        this.state.pokerPlayersActed = [playerId]; // Сбрасываем acted, т.к. ставка выросла
        this.addLog(`Игрок ${playerName} поднял ставку на ${amount}. Текущая ставка: ${newTotal}`, 'warning');
        this.state.pokerTurnIdx = (this.state.pokerTurnIdx + 1) % this.state.pokerActivePlayers.length;
      }
    }

    // Баг #3: если остался один — списываем очки только у проигравших (НЕ у победителя)
    // и НЕ списываем повторно в блоке allEqual&&allActed (return сразу)
    if (this.state.pokerActivePlayers.length === 1) {
      const winnerId = this.state.pokerActivePlayers[0];
      // Списываем ставки у всех кто участвовал (кроме победителя)
      for (const [pId, bet] of Object.entries(this.state.pokerBets)) {
        if (pId !== winnerId && this.state.players.find(p => p.id === pId)) {
          this.adjustScore(pId, -bet);
        }
      }
      // Победитель получает только чужие ставки (свою он не платит, т.к. ответа не было)
      const othersBets = Object.entries(this.state.pokerBets)
        .filter(([pId]) => pId !== winnerId)
        .reduce((sum, [, bet]) => sum + bet, 0);
      this.adjustScore(winnerId, othersBets);
      const totalPot = Object.values(this.state.pokerBets).reduce((a,b)=>a+b, 0);
      this.addLog(`Все спасовали! Игрок ${this.state.players.find(p=>p.id===winnerId)?.name} забирает банк ${totalPot} очков без ответа!`, 'success');
      this.closeQuestion();
      return;
    }

    let allEqual = true;
    for (let id of this.state.pokerActivePlayers) {
      if (this.state.pokerBets[id] !== this.state.pokerCurrentBet) {
        allEqual = false; break;
      }
    }

    const allActed = this.state.pokerActivePlayers.every(id => this.state.pokerPlayersActed.includes(id));

    if (allEqual && allActed) {
      // Списываем ставки у всех оставшихся активных игроков
      for (const pId of this.state.pokerActivePlayers) {
        const bet = this.state.pokerBets[pId] || 0;
        if (this.state.players.find(p => p.id === pId)) {
          this.adjustScore(pId, -bet);
        }
      }
      const totalPot = Object.values(this.state.pokerBets).reduce((a,b)=>a+b, 0);
      this.state.activeBet = totalPot;
      this.state.questionStatus = 'text_inputting';
      this.addLog(`Торги завершены! В банке ${totalPot} очков. Ожидание ответов оставшихся игроков.`, 'system');
    }
  }
}

module.exports = GameState;
