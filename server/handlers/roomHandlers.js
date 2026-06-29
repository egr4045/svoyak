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
        room.correctAnswer({ io });
      });
      socket.on('host:wrongAnswer', () => {
        room.wrongAnswer({ io });
      });

      socket.on('host:rouletteCatPlayer', () => {
        room.handleAction('host:rouletteCatPlayer', null, { io });
      });
      
      socket.on('host:revealAuctionBets', () => {
        room.handleAction('host:revealAuctionBets', null, { io });
      });

      socket.on('host:revealSketches', () => {
        room.handleAction('host:revealSketches', null, { io });
      });

      socket.on('host:awardSketchWinner', (winnerId) => {
        room.handleAction('host:awardSketchWinner', winnerId, { io });
      });

      socket.on('host:startAmongUsTimer', () => {
        room.handleAction('host:startAmongUsTimer', null, { io });
      });
      socket.on('host:revealAmongUs', () => {
        room.handleAction('host:revealAmongUs', null, { io });
      });
      socket.on('host:pauseAmongUsTimer', ({ timeLeft }) => {
        room.handleAction('host:pauseAmongUsTimer', { timeLeft }, { io });
      });
      socket.on('host:resumeAmongUsTimer', ({ timeLeft }) => {
        room.handleAction('host:resumeAmongUsTimer', { timeLeft }, { io });
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
        room.handleAction('host:revealTextAnswers', null, { io });
      });

      socket.on('host:judgeSingleTextAnswer', ({ playerId, isCorrect }) => {
        room.handleAction('host:judgeSingleTextAnswer', { playerId, isCorrect }, { io });
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
      room.handleAction('player:pauseGlitch', null, { io, socket, user });
    });
    socket.on('player:highlightQuestion', ({ catIdx, qIdx }) => {
      if (room.state.selectingPlayerId === user.id) {
        room.highlightQuestion(catIdx, qIdx);
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      }
    });

    socket.on('player:pressBuzzer', ({ reactionTime }) => {
      if (room.state.questionStatus !== 'buzzer_active' || !room.state.buzzerReceiving) return;
      if (room.state.failedPlayers.includes(user.id)) return;
      
      const q = room.getCurrentQuestion();
      if (q && q.type === 'glitch') {
        room.handleAction('player:pressBuzzer', { reactionTime }, { io, socket, user });
        return;
      }

      if (!room.state.buzzerResults.find(r => r.playerId === user.id)) {
        room.state.buzzerResults.push({ playerId: user.id, time: reactionTime || 0 });
        io.to(room.roomCode).emit('gameStateUpdated', room.state);
      }

      if (room.state.questionStatus === 'buzzer_active' && !room.timers.buzzerFirstHit) {
        room.timers.buzzerFirstHit = setTimeout(() => {
          room.state.buzzerReceiving = false;
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
      room.handleAction('player:submitTextAnswer', { text }, { io, socket, user });
    });

    socket.on('player:submitAuctionBet', ({ betAmount }) => {
      room.handleAction('player:submitAuctionBet', { betAmount }, { io, socket, user });
    });

    socket.on('player:submitSketch', ({ dataUrl }) => {
      room.handleAction('player:submitSketch', { dataUrl }, { io, socket, user });
    });

    socket.on('player:pokerAction', ({ action, amount }) => {
      room.handleAction('player:pokerAction', { action, amount }, { io, socket, user });
    });

    socket.on('player:voteSketch', (targetPlayerId) => {
      room.handleAction('player:voteSketch', targetPlayerId, { io, socket, user });
    });

    socket.on('player:voteAmongUs', (targetId) => {
      room.handleAction('player:voteAmongUs', targetId, { io, socket, user });
    });

    socket.on('player:loaded', () => {
      room.setPlayerLoaded(user.id, true);
      io.to(room.roomCode).emit('gameStateUpdated', room.state);
    });
  });
}

module.exports = handleRoomEvents;
