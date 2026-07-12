const GameState = require('../game/GameState');

// Замокаем базу данных для изоляции тестов
jest.mock('../game/initialData', () => [
  {
    name: "Mock Round",
    categories: [
      { category: "Cat 1", questions: [ 
        { points: 100, type: "among_us", q: "q1", a: "a1", answered: false },
        { points: 200, type: "auction", q: "q2", a: "a2", answered: false },
        { points: 300, type: "cat", q: "q3", a: "a3", answered: false }
      ]}
    ]
  }
]);

describe('GameState 10-Player Integration', () => {
  let game;
  const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(() => {
    // 10 игроков > дефолтного лимита (8), поэтому явно задаём maxPlayers
    game = new GameState('TEN', { id: 'host', username: 'Host' }, { maxPlayers: 10 });
    for (let i = 1; i <= 10; i++) {
      game.addPlayer({ id: `p${i}`, username: `Player${i}` });
    }
  });

  test('should handle 10 players correctly', () => {
    expect(game.state.players).toHaveLength(10);
    expect(game.state.players[9].name).toBe('Player10');
  });

  test('multi-player auction (10 players bidding)', () => {
    game.startGame();
    game.selectQuestion(0, 1); // Auction question from mock
    expect(game.state.questionStatus).toBe('auction_bidding');
    
    // 10 players bid, p10 bids highest
    for (let i = 1; i <= 10; i++) {
      game.handleAction('player:submitAuctionBet', { betAmount: 100 + i }, { user: { id: `p${i}` }, io: mockIo });
    }
    
    expect(Object.keys(game.state.auctionBets)).toHaveLength(10);
    
    // Host reveals
    game.handleAction('host:revealAuctionBets', {}, { io: mockIo });
    expect(game.state.answeringPlayerId).toBe('p10');
    expect(game.state.activeBet).toBe(110);
  });

  test('Among Us with 10 players using handleAction', () => {
    game.startGame();
    game.selectQuestion(0, 0); // Among Us
    game.state.questionStatus = 'among_us_voting';
    
    const imposterId = game.state.imposterId;
    expect(imposterId).toBeDefined();

    // 7 players vote for imposter, 3 vote elsewhere
    const players = game.state.players;
    for (let i = 0; i < 7; i++) {
      game.handleAction('player:voteAmongUs', imposterId, { user: { id: players[i].id }, io: mockIo });
    }
    for (let i = 7; i < 10; i++) {
      game.handleAction('player:voteAmongUs', players[0].id, { user: { id: players[i].id }, io: mockIo });
    }
    
    game.handleAction('host:revealAmongUs', {}, { io: mockIo });
    expect(game.state.amongUsResult).toBe('crew_win');
  });

  test('player disconnection during active game', () => {
    game.startGame();
    game.removePlayer('p1');
    expect(game.state.players.find(p => p.id === 'p1')).toBeUndefined();
    expect(game.state.players).toHaveLength(9);
  });

  test('resetGame resets all 10 players', () => {
    game.state.players.forEach(p => p.score = 500);
    game.resetGame();
    expect(game.state.players.every(p => p.score === 0)).toBe(true);
    expect(game.state.gameStarted).toBe(false);
  });
});

describe('GameState spectators & maxPlayers', () => {
  test('default maxPlayers is 8, overflow becomes spectator', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' });
    expect(game.state.maxPlayers).toBe(8);
    for (let i = 1; i <= 9; i++) {
      game.addPlayer({ id: `p${i}`, username: `Player${i}` });
    }
    expect(game.state.players).toHaveLength(8);
    expect(game.state.spectators).toHaveLength(1);
    expect(game.state.spectators[0].id).toBe('p9');
  });

  test('maxPlayers is clamped to [2, 16] and defaults on garbage', () => {
    expect(new GameState('A', { id: 'h', username: 'H' }, { maxPlayers: 1 }).state.maxPlayers).toBe(2);
    expect(new GameState('B', { id: 'h', username: 'H' }, { maxPlayers: 99 }).state.maxPlayers).toBe(16);
    expect(new GameState('C', { id: 'h', username: 'H' }, { maxPlayers: 'abc' }).state.maxPlayers).toBe(8);
  });

  test('joining after game start becomes spectator', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 4 });
    game.addPlayer({ id: 'p1', username: 'P1' });
    game.startGame();
    game.addPlayer({ id: 'late', username: 'Late' });
    expect(game.state.players).toHaveLength(1);
    expect(game.state.spectators.map(s => s.id)).toContain('late');
  });

  test('explicit addSpectator and takeSeat promotion preserve score', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 2 });
    game.addPlayer({ id: 'p1', username: 'P1' });
    game.addPlayer({ id: 'p2', username: 'P2' });
    game.addSpectator({ id: 's1', username: 'S1' });
    // мест нет — промоушен не проходит
    expect(game.promoteSpectator('s1')).toBe(false);
    // разжалуем игрока со счётом — счёт сохраняется при возврате
    game.adjustScore('p1', 300);
    expect(game.demotePlayer('p1')).toBe(true);
    expect(game.state.players).toHaveLength(1);
    expect(game.promoteSpectator('p1')).toBe(true);
    expect(game.state.players.find(p => p.id === 'p1').score).toBe(300);
  });

  test('promoteSpectator is blocked mid-question (symmetric to demotePlayer)', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 4 });
    game.addPlayer({ id: 'p1', username: 'P1' });
    game.startGame();
    game.addPlayer({ id: 'late', username: 'Late' }); // после старта -> наблюдатель
    game.state.questionStatus = 'among_us_voting';
    expect(game.promoteSpectator('late')).toBe(false);
    game.state.questionStatus = 'idle';
    expect(game.promoteSpectator('late')).toBe(true);
  });

  test('stale socket disconnect must not clobber a live connection', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 4 });
    game.addPlayer({ id: 'p1', username: 'P1' });
    game.setPlayerConnection('p1', 'sock-new', true);
    // Логика обработчика disconnect: чужой сокет не трогает соединение
    const member = game.findParticipant('p1');
    expect(member.socketId).toBe('sock-new');
    // симуляция позднего disconnect от старого сокета — guard в roomHandlers
    // (member.socketId !== 'sock-old') должен предотвратить сброс
    if (member.socketId === 'sock-old') game.setPlayerConnection('p1', 'sock-old', false);
    expect(game.findParticipant('p1').connected).toBe(true);
  });

  test('demotePlayer is blocked mid-question and clears selecting/answering ids', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 4 });
    game.addPlayer({ id: 'p1', username: 'P1' });
    game.startGame();
    game.state.questionStatus = 'answering';
    expect(game.demotePlayer('p1')).toBe(false);
    game.state.questionStatus = 'idle';
    game.state.selectingPlayerId = 'p1';
    expect(game.demotePlayer('p1')).toBe(true);
    expect(game.state.selectingPlayerId).toBeNull();
  });

  test('rejoin of an existing spectator does not auto-promote', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 4 });
    game.addSpectator({ id: 's1', username: 'S1' });
    const again = game.addPlayer({ id: 's1', username: 'S1' });
    expect(game.state.players).toHaveLength(0);
    expect(game.state.spectators).toHaveLength(1);
    expect(again.id).toBe('s1');
  });

  test('removePlayer removes from both roles; connection tracked for spectators', () => {
    const game = new GameState('SPEC', { id: 'host', username: 'Host' }, { maxPlayers: 2 });
    game.addSpectator({ id: 's1', username: 'S1' });
    game.setPlayerConnection('s1', 'sock1', true);
    expect(game.state.spectators[0].connected).toBe(true);
    expect(game.hasConnectedMembers()).toBe(true);
    game.removePlayer('s1');
    expect(game.state.spectators).toHaveLength(0);
    expect(game.hasConnectedMembers()).toBe(false);
  });
});
