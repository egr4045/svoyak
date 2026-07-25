const roomManager = require('../managers/RoomManager');
const { registerFunTools } = require('./funTools');

function handleRoomEvents(io, socket, user) {
  // Join room
  socket.on('room:join', (roomCode, opts) => {
    opts = opts || {}; // старые клиенты передают только код
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return socket.emit('error', 'Room not found');
    }

    socket.join(room.roomCode);
    roomManager.cancelCleanup(room.roomCode);

    // Add player to GameState
    if (room.state.host.id === user.id) {
      room.setPlayerConnection(user.id, socket.id, true);
    } else {
      if (opts.spectate === true) {
        room.addSpectator(user);
      } else {
        room.addPlayer(user); // сам сфолбэчит в наблюдателя при переполнении/начатой игре
      }
      room.setPlayerConnection(user.id, socket.id, true);
    }

    // Присоединившемуся — полный стейт (с roundsData: лобби прелоадит медиа пака),
    // остальным — слим без пака (см. GameState.slimState)
    socket.emit('gameStateUpdated', room.fullState());
    socket.to(room.roomCode).emit('gameStateUpdated', room.slimState());

    // Приватный показ переживает реконнект: тело room:join выполняется на каждый (ре)коннект
    // (в т.ч. ниже гварда _handlersBound), а setPlayerConnection выше уже обновил socketId.
    // Дошлём секрет напрямую этому сокету, если он исполнитель или ведущий.
    if (room.privateReveal) {
      if (String(room.privateReveal.performerId) === String(user.id)) {
        socket.emit('privateReveal', room.privateReveal.performerPayload);
      }
      if (String(room.state.host.id) === String(user.id)) {
        socket.emit('privateReveal', room.privateReveal.hostPayload);
      }
    }

    // Динамический guard: роль может смениться посреди сессии (promote/demote)
    const isPlayer = () => room.state.players.some(p => String(p.id) === String(user.id));

    // Слушатели действий вешаем один раз на сокет: повторный room:join
    // (дубль-emit / навигация) не должен навесить второй комплект обработчиков,
    // иначе один клик хоста сработает несколько раз
    if (socket._handlersBound) return;
    socket._handlersBound = true;

    socket.on('disconnect', () => {
      // Устаревший сокет (вторая вкладка, поздний ping-timeout после переподключения)
      // не должен затирать живое соединение того же пользователя
      const member = room.state.host.id === user.id ? room.state.host : room.findParticipant(user.id);
      if (!member || member.socketId !== socket.id) return;
      room.setPlayerConnection(user.id, socket.id, false);
      room.broadcast(io);
      roomManager.scheduleCleanup(room.roomCode);
    });

    socket.on('room:start', () => {
      if (room.state.host.id !== user.id) return;
      room.startGame();
      room.broadcast(io);
    });

    // --- GAME ACTIONS (Host only mostly) ---
    const isHost = String(room.state.host.id) === String(user.id);

    if (isHost) {
      // Якорь синхронизации: позиция медиа у ведущего + серверная метка времени.
      // Клиенты считают ожидаемую позицию = anchorPosition + (now+delta − anchorAt)/1000
      // (см. src/composables/useSyncedMedia.js) — опоздавшие стартуют с нужного места.
      socket.on('host:controlMedia', ({ status, position }) => {
        room.state.mediaState = { status, anchorPosition: Number(position) || 0, anchorAt: Date.now() };
        room.broadcast(io);
      });

      socket.on('host:selectQuestion', ({ catIdx, qIdx }) => {
        room.selectQuestion(catIdx, qIdx);
        room.afterSelect({ io }); // типам с таймером/рассылкой при открытии (напр. картошка)
        room.broadcast(io);
      });
      socket.on('host:kickPlayer', (playerId) => {
        room.removePlayer(playerId);
        io.to(room.roomCode).emit('playerKicked', playerId);
        room.broadcast(io);
      });
      socket.on('host:resetGame', () => {
        room.resetGame();
        // roundsData пересоздана из пака — единственный случай полного стейта всем
        io.to(room.roomCode).emit('gameStateUpdated', room.fullState());
      });
      socket.on('host:closeQuestion', () => {
        room.closeQuestion();
        room.broadcast(io);
      });
      socket.on('host:adjustScore', ({ playerId, amount }) => {
        room.adjustScore(playerId, amount);
        room.broadcast(io);
      });
      socket.on('host:startBuzzer', () => {
        room.clearTimers();
        room.state.questionStatus = 'buzzer_countdown';
        room.broadcast(io);

        room.timers.buzzerStart = setTimeout(() => {
          room.state.questionStatus = 'buzzer_active';
          room.state.buzzerReceiving = true;
          room.state.buzzerResults = [];
          room.state.buzzerOpenedAt = Date.now(); // серверный якорь для анти-чита реакции
          delete room.timers.buzzerFirstHit;
          room.broadcast(io);
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
        room.broadcast(io);
      });

      socket.on('host:nextRound', () => {
        room.nextRound();
        room.broadcast(io);
      });

      socket.on('host:setSelectingPlayer', (playerId) => {
        room.setSelectingPlayer(playerId);
        room.broadcast(io);
      });

      socket.on('host:revealTextAnswers', () => {
        room.handleAction('host:revealTextAnswers', null, { io });
      });

      socket.on('host:judgeSingleTextAnswer', ({ playerId, isCorrect }) => {
        room.handleAction('host:judgeSingleTextAnswer', { playerId, isCorrect }, { io });
      });

      socket.on('host:makeSpectator', (playerId) => {
        if (room.demotePlayer(playerId)) {
          room.broadcast(io);
        }
      });

      socket.on('host:promoteSpectator', (spectatorId) => {
        if (room.promoteSpectator(spectatorId)) {
          room.broadcast(io);
        }
      });

      // Приколы ведущего: саундборд, эффекты, очковая рулетка (см. funTools.js)
      registerFunTools(io, socket, room);

      // --- Ведущий-действия новых типов-мини-игр (делегируются текущему хендлеру) ---
      // Клиент шлёт их универсальным мостом emitAction; хендлер, не знающий действие, просто игнорит.
      for (const ev of [
        'host:setPerformer', 'host:awardGuess', 'host:passQuestion',   // крокодил/караоке/алиас
        'host:aliasGuessed', 'host:aliasSkip',                          // алиас
        'host:revealNumber',                                           // угадай число
        'host:revealTier',                                            // тир-лист
        'host:setDuel', 'host:revealDuel',                            // камень-ножницы
        'host:revealMore',                                           // угадай по фрагменту
        'host:revealWhoSaid', 'host:scoreWhoSaid',                  // кто сказал
        'host:endReaction',                                         // реакция
        'host:passPotato'                                           // горячая картошка (пасует ведущий)
      ]) {
        socket.on(ev, (data) => room.handleAction(ev, data, { io, socket, user }));
      }
    }

    // Наблюдатель занимает свободное место сам (сервер валидирует; первый клик выигрывает)
    socket.on('spectator:takeSeat', () => {
      const isSpectator = room.state.spectators.some(s => String(s.id) === String(user.id));
      if (!isSpectator) return;
      if (room.promoteSpectator(user.id)) {
        room.broadcast(io);
      }
    });

    // Игрок сообщает свой платформенный аватар (строка: URL/эмодзи из профиля хаба)
    socket.on('player:setAvatar', ({ avatar }) => {
      if (typeof avatar !== 'string' || avatar.length > 512) return;
      const p = room.findParticipant(user.id);
      if (p && p.avatar !== avatar) {
        p.avatar = avatar;
        room.broadcast(io);
      }
    });

    // --- PLAYER-ONLY ACTIONS (наблюдатели отсекаются guard'ом isPlayer) ---
    socket.on('player:pauseGlitch', () => {
      if (!isPlayer()) return;
      room.handleAction('player:pauseGlitch', null, { io, socket, user });
    });
    socket.on('player:highlightQuestion', ({ catIdx, qIdx }) => {
      if (!isPlayer()) return;
      if (room.state.selectingPlayerId === user.id) {
        room.highlightQuestion(catIdx, qIdx);
        room.broadcast(io);
      }
    });

    socket.on('player:pressBuzzer', ({ reactionTime }) => {
      if (!isPlayer()) return;
      if (room.state.questionStatus !== 'buzzer_active' || !room.state.buzzerReceiving) return;
      if (room.state.failedPlayers.includes(user.id)) return;
      
      const q = room.getCurrentQuestion();
      if (q && q.glitch === true) {
        room.handleAction('player:pressBuzzer', { reactionTime }, { io, socket, user });
        return;
      }

      // Анти-чит: клиентское reactionTime клампим серверным таймингом. Подделанный «0 мс»
      // не может быть меньше (серверное время с открытия баззера − 1200 мс форы на сеть).
      const serverElapsed = room.state.buzzerOpenedAt ? Date.now() - room.state.buzzerOpenedAt : 0;
      const effective = Math.max(Number(reactionTime) || 0, serverElapsed - 1200);

      if (!room.state.buzzerResults.find(r => r.playerId === user.id)) {
        room.state.buzzerResults.push({ playerId: user.id, time: effective });
        room.broadcast(io);
      }

      if (room.state.questionStatus === 'buzzer_active' && !room.timers.buzzerFirstHit) {
        room.timers.buzzerFirstHit = setTimeout(() => {
          room.state.buzzerReceiving = false;
          room.state.buzzerResults.sort((a, b) => a.time - b.time);
          room.state.questionStatus = 'buzzer_results';
          room.broadcast(io);
          
          room.timers.buzzerShowResults = setTimeout(() => {
            room.state.questionStatus = 'answering';
            room.state.answeringPlayerId = room.state.buzzerResults[0].playerId;
            room.broadcast(io);
          }, 3500);
          
        }, 5000); 
      }
    });

    socket.on('player:submitTextAnswer', ({ text }) => {
      if (!isPlayer()) return;
      room.handleAction('player:submitTextAnswer', { text }, { io, socket, user });
    });

    socket.on('player:submitAuctionBet', ({ betAmount }) => {
      if (!isPlayer()) return;
      room.handleAction('player:submitAuctionBet', { betAmount }, { io, socket, user });
    });

    socket.on('player:submitSketch', ({ dataUrl }) => {
      if (!isPlayer()) return;
      room.handleAction('player:submitSketch', { dataUrl }, { io, socket, user });
    });

    socket.on('player:voteSketch', (targetPlayerId) => {
      if (!isPlayer()) return;
      room.handleAction('player:voteSketch', targetPlayerId, { io, socket, user });
    });

    socket.on('player:voteAmongUs', (targetId) => {
      if (!isPlayer()) return;
      room.handleAction('player:voteAmongUs', targetId, { io, socket, user });
    });

    // --- Игрок-действия новых типов-мини-игр (наблюдатели отсекаются isPlayer) ---
    for (const ev of [
      'player:rpsPick',       // камень-ножницы
      'player:submitNumber',  // угадай число
      'player:submitTier',    // тир-лист
      'player:submitWhoSaid', 'player:guessAuthor', // кто сказал
      'player:tapTarget'      // реакция
    ]) {
      socket.on(ev, (data) => {
        if (!isPlayer()) return;
        room.handleAction(ev, data, { io, socket, user });
      });
    }

    // failedCount — сколько медиафайлов НЕ загрузилось у игрока при прелоаде
    // (лобби показывает ⚠ ведущему; игра всё равно стартует — см. LobbyView)
    socket.on('player:loaded', (payload) => {
      room.setPlayerLoaded(user.id, true, payload?.failedCount || 0);
      room.broadcast(io);
    });

    // Часовой зонд для оценки дельты клиент↔сервер (синхронизация позиции медиа)
    socket.on('sync:ping', (cb) => {
      if (typeof cb === 'function') cb(Date.now());
    });
  });
}

module.exports = handleRoomEvents;
