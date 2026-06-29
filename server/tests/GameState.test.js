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
    game = new GameState('TEN', { id: 'host', username: 'Host' });
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
