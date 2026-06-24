const GameState = require('./GameState');

// Замокаем базу данных для изоляции тестов
jest.mock('./initialData', () => [
  {
    name: "Mock Round",
    categories: [
      { category: "Cat 1", questions: [ 
        { points: 100, type: "standard", q: "q1", a: "a1", answered: false },
        { points: 200, type: "auction", q: "q2", a: "a2", answered: false },
        { points: 300, type: "cat", q: "q3", a: "a3", answered: false }
      ]}
    ]
  }
]);

describe('GameState Core Logic', () => {
  let game;

  beforeEach(() => {
    jest.useFakeTimers();
    game = new GameState('TEST', { id: 'host1', username: 'Host' });
    game.addPlayer({ id: 'p1', name: 'Alice' });
    game.addPlayer({ id: 'p2', name: 'Bob' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize correctly and add players', () => {
    expect(game.state.players).toHaveLength(2);
    expect(game.state.currentRoundIndex).toBe(0);
    expect(game.state.players.find(p=>p.id === 'p1').score).toBe(0);
  });

  test('adjustScore should update player score correctly', () => {
    game.adjustScore('p1', 100);
    expect(game.state.players.find(p=>p.id === 'p1').score).toBe(100);
    game.adjustScore('p1', -50);
    expect(game.state.players.find(p=>p.id === 'p1').score).toBe(50);
  });
  
  test('selectQuestion transitions to reading status', () => {
    game.startGame();
    game.selectQuestion(0, 0); // Cat 1, 100
    expect(game.state.activeCell).toEqual({ catIdx: 0, qIdx: 0 });
    expect(game.state.questionStatus).toBe('reading');
  });

  test('closeQuestion resets current question state and marks it answered', () => {
    game.startGame();
    game.selectQuestion(0, 0);
    game.closeQuestion();
    expect(game.state.activeCell).toBeNull();
    expect(game.state.showAnswer).toBe(false);
    expect(game.state.board[0].questions[0].answered).toBe(true);
  });

  test('pokerAction processing and turn advancing', () => {
    game.startGame();
    game.selectQuestion(0, 0); // Need an active cell so q points can be calculated
    game.state.questionStatus = 'poker_bidding';
    game.state.pokerActivePlayers = ['p1', 'p2'];
    game.state.pokerBets = { p1: 0, p2: 0 };
    game.state.pokerTurnIdx = 0; // p1
    game.pokerAction('p1', 'raise', 100);
    
    expect(game.state.pokerBets['p1']).toBe(100);
    expect(game.state.pokerCurrentBet).toBe(100);
    expect(game.state.pokerTurnIdx).toBe(1); // p2
    expect(game.state.pokerPlayersActed).toContain('p1');
  });

  test('removePlayer should filter out the player safely', () => {
    game.removePlayer('p1');
    expect(game.state.players).toHaveLength(1);
    expect(game.state.players[0].id).toBe('p2');
  });

  test('resetGame should clear all states and scores', () => {
    game.startGame();
    game.adjustScore('p1', 500);
    game.timers.dummy = 123456; 
    
    game.resetGame();
    
    expect(game.state.questionStatus).toBe('idle');
    expect(game.state.players.find(p=>p.id === 'p1').score).toBe(0);
    expect(Object.keys(game.timers).length).toBe(0);
  });
});
