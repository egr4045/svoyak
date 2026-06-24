const roomManager = require('../managers/RoomManager');

function handleRoomEvents(io, socket, user) {
  // Join room
  socket.on('room:join', (roomCode) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return socket.emit('error', 'Room not found');
    }

    socket.join(room.roomCode);
    
    // Add player to GameState
    if (room.state.host.id === user.id) {
      room.setPlayerConnection(user.id, socket.id, true);
    } else {
      room.addPlayer(user);
      room.setPlayerConnection(user.id, socket.id, true);
    }

    io.to(room.roomCode).emit('gameStateUpdated', room.state);
    
    socket.on('disconnect', () => {
      room.setPlayerConnection(user.id, socket.id, false);
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('room:start', () => {
      if (room.state.host.id !== user.id) return;
      room.startGame();
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    // --- GAME ACTIONS (Host only mostly) ---
    const isHost = String(room.state.host.id) === String(user.id);

    if (isHost) {
      socket.on('host:controlMedia', ({ status, currentTime }) => {
        console.log(`[Media] Host ${user.username} controlled media: ${status}`);
        room.state.mediaState = { status, currentTime: currentTime || 0 };
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:selectQuestion', ({ catIdx, qIdx }) => {
        room.selectQuestion(catIdx, qIdx);
        const q = room.getCurrentQuestion();
        // Авторулетка для вопроса «Кот в мешке»
        if (q && q.type === 'cat') {
          room.clearTimers();
          const available = room.state.players.filter(p => p.connected);
          const candidates = available.length > 0 ? available : room.state.players;
          const randomPlayerId = candidates[Math.floor(Math.random() * candidates.length)]?.id;
          room.state.catTargetId = randomPlayerId;
          room.state.questionStatus = 'cat_roulette';
          io.to(room.roomCode).emit('gameStateUpdated', room.state);

          room.timers.catRoulette = setTimeout(() => {
            room.state.answeringPlayerId = randomPlayerId;
            room.state.questionStatus = 'answering';
            io.to(room.roomCode).emit('gameStateUpdated', room.state);
          }, 7500);
          return;
        }
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:kickPlayer', (playerId) => {
        room.removePlayer(playerId);
        io.to(room.roomCode).emit('playerKicked', playerId);
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:resetGame', () => {
        room.resetGame();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:closeQuestion', () => {
        room.closeQuestion();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:adjustScore', ({ playerId, amount }) => {
        room.adjustScore(playerId, amount);
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:startBuzzer', () => {
        room.clearTimers();
        room.state.questionStatus = 'buzzer_countdown';
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
        
        room.timers.buzzerStart = setTimeout(() => {
          room.state.questionStatus = 'buzzer_active';
          room.state.buzzerReceiving = true;
          room.state.buzzerResults = [];
          delete room.timers.buzzerFirstHit;
          io.to(room.roomCode).emit('gameStateUpdated', room.state);
        }, 3000);
      });
      socket.on('host:correctAnswer', () => {
        const q = room.getCurrentQuestion();
        const points = room.state.activeBet !== null ? room.state.activeBet : q.points;
        room.adjustScore(room.state.answeringPlayerId, points);
        room.setSelectingPlayer(room.state.answeringPlayerId);
        room.state.answeringPlayerId = null;
        room.state.showAnswer = true;
        room.state.questionStatus = 'idle';
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:wrongAnswer', () => {
        const q = room.getCurrentQuestion();
        const points = room.state.activeBet !== null ? room.state.activeBet : q.points;
        room.adjustScore(room.state.answeringPlayerId, -points);
        room.state.failedPlayers.push(room.state.answeringPlayerId);
        room.state.answeringPlayerId = null;
        
        if (q.type === 'cat' || q.type === 'auction' || room.state.failedPlayers.length >= room.state.players.length) {
          room.state.showAnswer = true;
          room.state.questionStatus = 'idle';
        } else {
          room.clearTimers();
          room.state.questionStatus = 'buzzer_countdown';
          io.to(room.roomCode).emit('gameStateUpdated', room.state);

          room.timers.buzzerStart = setTimeout(() => {
            room.state.questionStatus = 'buzzer_active';
            room.state.buzzerReceiving = true;
            room.state.buzzerResults = [];
            delete room.timers.buzzerFirstHit;
            io.to(room.roomCode).emit('gameStateUpdated', room.state);
          }, 3000);
          return;
        }
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:rouletteCatPlayer', () => {
        room.state.questionStatus = 'cat_roulette';
        room.clearTimers();
        const available = room.state.players.filter(p => p.connected);
        const candidates = available.length > 0 ? available : room.state.players;
        const randomPlayerId = candidates[Math.floor(Math.random() * candidates.length)]?.id;
        room.state.catTargetId = randomPlayerId;
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
        
        room.timers.catRoulette = setTimeout(() => {
          room.state.answeringPlayerId = randomPlayerId; 
          room.state.questionStatus = 'answering';
          io.to(room.roomCode).emit('gameStateUpdated', room.state);
        }, 7500);
      });
      
      socket.on('host:revealAuctionBets', () => {
        if (room.state.questionStatus !== 'auction_bidding') return;
        let maxBet = -Infinity;
        let winners = [];
        for (const [pId, bet] of Object.entries(room.state.auctionBets)) {
          if (bet > maxBet) { maxBet = bet; winners = [pId]; }
          else if (bet === maxBet) { winners.push(pId); }
        }
        
        if (winners.length === 0) return; 
        
        room.clearTimers();
        room.state.activeBet = maxBet;

        if (winners.length > 1) {
          room.state.questionStatus = 'text_inputting';
          room.state.auctionTiePlayers = winners;
          room.addLog(`Аукцион: ничья! Отвечают текстом: ${winners.map(id => room.state.players.find(p=>p.id===id)?.name).join(', ')}`, 'warning');
        } else {
          room.state.answeringPlayerId = winners[0];
          room.state.questionStatus = 'answering';
          room.addLog(`Аукцион: победил ${room.state.players.find(p=>p.id===winners[0])?.name} со ставкой ${maxBet}!`, 'success');
        }
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:revealSketches', () => {
        // Сначала форсируем сдачу рисунков у всех, затем показываем результаты
        io.to(room.roomCode).emit('sketch:forceSubmit');
        setTimeout(() => {
          room.state.questionStatus = 'sketch_judging';
          io.to(room.roomCode).emit('gameStateUpdated', room.state);
        }, 800);
      });

      socket.on('host:awardSketchWinner', (winnerId) => {
        const q = room.getCurrentQuestion();
        room.adjustScore(winnerId, q.points); // No Number()
        room.closeQuestion();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:startAmongUsTimer', () => {
        room.state.questionStatus = 'among_us_voting';
        room.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + 120000, timeLeft: 120 };
        room.state.amongUsVotes = {};
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:revealAmongUs', () => {
        if (room.state.amongUsResult) return; // ПРЕКРАЩАЕМ ЕСЛИ УЖЕ ПОДСЧИТАЛИ
        
        const imposterId = room.state.imposterId;
        const votes = room.state.amongUsVotes || {};
        const q = room.getCurrentQuestion();
        if (!q) return;
         
        const validPlayersCount = Object.keys(room.state.textAnswers).length || room.state.players.length;
        let imposterVotes = 0;
        Object.values(votes).forEach(vote => { if(vote === imposterId) imposterVotes++; });
         
        // Если проголосовали за импостера хотя бы 50%
        if (imposterVotes >= Math.ceil(validPlayersCount / 2)) {
           room.state.amongUsResult = 'crew_win';
           room.adjustScore(imposterId, -q.points * 2);
           for (const [voter, target] of Object.entries(votes)) {
             if (target === imposterId && voter !== imposterId) room.adjustScore(voter, q.points);
           }
           room.addLog(`Мирные победили! Шпион ${room.state.players.find(p=>p.id===imposterId)?.name} разоблачен.`, 'success');
        } else {
           room.state.amongUsResult = 'imposter_win';
           // Шпиону за победу даем очки (например x2 от номинала за риск)
           room.adjustScore(imposterId, q.points * 2);
           for (const [voter, target] of Object.entries(votes)) {
             if (voter !== imposterId) room.adjustScore(voter, -q.points);
           }
           room.addLog(`Шпион победил! Им был ${room.state.players.find(p=>p.id===imposterId)?.name}.`, 'error');
        }
         
        room.state.showAnswer = true;
        room.clearTimers();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:pauseAmongUsTimer', ({ timeLeft }) => {
        room.state.amongUsTimerState = { status: 'paused', timeLeft };
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
      socket.on('host:resumeAmongUsTimer', ({ timeLeft }) => {
        room.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + timeLeft * 1000, timeLeft };
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
    socket.on('host:startRound', () => {
        room.startRound();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:nextRound', () => {
        room.nextRound();
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:setSelectingPlayer', (playerId) => {
        room.setSelectingPlayer(playerId);
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:revealTextAnswers', () => {
        room.state.questionStatus = 'text_judging';
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });

      socket.on('host:judgeSingleTextAnswer', ({ playerId, isCorrect }) => {
        const q = room.getCurrentQuestion();
        const points = room.state.activeBet !== null ? room.state.activeBet : q.points;
        
        if (isCorrect) {
          room.adjustScore(playerId, points); // No Number()
        } else {
          room.adjustScore(playerId, -points); // No Number()
        }
        delete room.state.textAnswers[playerId];
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      });
    }

    socket.on('player:updateAvatar', () => {
      const p = room.state.players.find(p => p.id === user.id);
      if (p) {
        // Добавляем кэш-бастер, чтобы браузеры перекачали картинку
        // Используем относительный путь, клиент сам подставит нужный хост
        p.avatar = `/api/avatar/${user.id}?t=${Date.now()}`;
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
        room.addLog(`Игрок ${user.username} обновил аватар`);
      }
    });

    // --- ANY PLAYER ACTIONS ---
    socket.on('player:sendReaction', ({ emoji }) => {
      const ALLOWED = ['😂', '🔥', '👏', '💀', '🤔', '😤'];
      if (!ALLOWED.includes(emoji)) return;
      io.to(room.roomCode).emit('playerReaction', { playerId: user.id, emoji });
    });

    socket.on('player:pauseGlitch', () => {
      // Баг #5: проверяем и статус, и тип вопроса — иначе можно сломать любой вопрос
      const q = room.getCurrentQuestion();
      if (!q || q.type !== 'glitch') return;
      if (room.state.questionStatus !== 'buzzer_countdown' && room.state.questionStatus !== 'buzzer_active') {
         return;
      }
      room.clearTimers();
      room.state.questionStatus = 'answering';
      room.state.answeringPlayerId = user.id;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });
    socket.on('player:highlightQuestion', ({ catIdx, qIdx }) => {
      if (room.state.selectingPlayerId === user.id) {
        room.highlightQuestion(catIdx, qIdx);
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      }
    });

    socket.on('player:pressBuzzer', ({ reactionTime }) => {
      // Игнорируем фейковые нажатия, если не идет сбор
      if (room.state.questionStatus !== 'buzzer_active' || !room.state.buzzerReceiving) return;
      if (room.state.failedPlayers.includes(user.id)) return;
      
      if (!room.state.buzzerResults.find(r => r.playerId === user.id)) {
        room.state.buzzerResults.push({ playerId: user.id, time: reactionTime || 0 });
        
        const q = room.getCurrentQuestion();
        if (q && q.type === 'glitch') {
          // Для глитча — сразу в режим ответа
          room.clearTimers();
          room.state.questionStatus = 'answering';
          room.state.answeringPlayerId = user.id;
          room.state.buzzerReceiving = false;
        }
        
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      }

      // Устанавливаем таймаут окна сбора, если это первый клик
      if (room.state.questionStatus === 'buzzer_active' && !room.timers.buzzerFirstHit) {
        // Увеличено окно с 400мс до 5 секунд по запросу
        room.timers.buzzerFirstHit = setTimeout(() => {
          room.state.buzzerReceiving = false;
          // Сортировка по возрастанию времени реакции
          room.state.buzzerResults.sort((a, b) => a.time - b.time);
          room.state.questionStatus = 'buzzer_results';
          io.to(room.roomCode).emit('gameStateUpdated', room.state);
          
          room.timers.buzzerShowResults = setTimeout(() => {
            room.state.questionStatus = 'answering';
            room.state.answeringPlayerId = room.state.buzzerResults[0].playerId;
            io.to(room.roomCode).emit('gameStateUpdated', room.state);
          }, 3500);
          
        }, 5000); 
      }
    });

    socket.on('player:submitTextAnswer', ({ text }) => {
      room.state.textAnswers[user.id] = text;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:submitAuctionBet', ({ betAmount }) => {
      if (room.state.questionStatus !== 'auction_bidding') return;
      // Серверная валидация: проверяем лимит по балансу
      const player = room.state.players.find(p => p.id === user.id);
      const playerBalance = player?.score || 0;
      const q = room.getCurrentQuestion();
      const maxAllowed = playerBalance <= 0 ? q.points : playerBalance;
      if (typeof betAmount !== 'number' || betAmount < 1 || betAmount > maxAllowed) return;
      room.state.auctionBets[user.id] = betAmount;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:submitSketch', ({ dataUrl }) => {
      room.state.sketchAnswers[user.id] = dataUrl;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:pokerAction', ({ action, amount }) => {
      room.pokerAction(user.id, action, amount);
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:voteSketch', (targetPlayerId) => {
      room.state.sketchVotes[user.id] = targetPlayerId;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:voteAmongUs', (targetId) => {
      if (room.state.questionStatus !== 'among_us_voting') return;
      if (!room.state.amongUsVotes) room.state.amongUsVotes = {};
      room.state.amongUsVotes[user.id] = targetId;
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });

    socket.on('player:loaded', () => {
      room.setPlayerLoaded(user.id, true);
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });
  });
}

module.exports = handleRoomEvents;
