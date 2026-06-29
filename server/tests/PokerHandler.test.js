const PokerHandler = require('../game/questions/PokerHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('PokerHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    handler = new PokerHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  test('onSelect initializes poker state correctly', () => {
    handler.onSelect(mockGS, { points: 500 });
    expect(mockGS.state.questionStatus).toBe('poker_bidding');
    expect(mockGS.state.pokerCurrentBet).toBe(100); // 500 / 5
    expect(mockGS.state.pokerActivePlayers).toHaveLength(3);
    expect(mockGS.state.pokerBets['p1']).toBe(100);
  });

  test('processPokerAction fold removes player and awards pot if last', () => {
    handler.onSelect(mockGS, { points: 500 });
    // p1 folds, p2 folds -> p3 wins
    handler.processPokerAction(mockGS, 'p1', 'fold');
    expect(mockGS.state.pokerActivePlayers).not.toContain('p1');
    expect(mockGS.state.pokerTurnIdx).toBe(0); // Index adjusted (p2 is now at 0)
    
    handler.processPokerAction(mockGS, 'p2', 'fold');
    // Now p3 should win automatically
    expect(mockGS.closeQuestion).toHaveBeenCalled();
    // p1 lost 100, p2 lost 100, p3 won 200 (others' bets)
    expect(mockGS.state.players.find(p => p.id === 'p1').score).toBe(900);
    expect(mockGS.state.players.find(p => p.id === 'p2').score).toBe(900);
    expect(mockGS.state.players.find(p => p.id === 'p3').score).toBe(1200);
  });

  test('processPokerAction raise increases bet and resets acted players', () => {
    handler.onSelect(mockGS, { points: 500 });
    mockGS.state.pokerPlayersActed = ['p1'];
    handler.processPokerAction(mockGS, 'p1', 'raise', 100);
    expect(mockGS.state.pokerCurrentBet).toBe(200);
    expect(mockGS.state.pokerBets['p1']).toBe(200);
    expect(mockGS.state.pokerPlayersActed).toEqual(['p1']);
    expect(mockGS.state.pokerTurnIdx).toBe(1); // p2's turn
  });

  test('processPokerAction ignores action out of turn', () => {
    handler.onSelect(mockGS, { points: 500 });
    // Current turn is p1 (idx 0). p2 tries to act.
    handler.processPokerAction(mockGS, 'p2', 'call');
    expect(mockGS.state.pokerTurnIdx).toBe(0);
    expect(mockGS.state.pokerBets['p2']).toBe(100); // Initial mandatory bet
  });

  test('processPokerAction ignores invalid action type', () => {
    handler.onSelect(mockGS, { points: 500 });
    handler.processPokerAction(mockGS, 'p1', 'all-in-invalid');
    expect(mockGS.state.pokerTurnIdx).toBe(0);
  });

  test('bidding ends when all players act and match current bet', () => {
    handler.onSelect(mockGS, { points: 500 });
    // All start at 100.
    handler.processPokerAction(mockGS, 'p1', 'call');
    handler.processPokerAction(mockGS, 'p2', 'call');
    handler.processPokerAction(mockGS, 'p3', 'call');
    
    expect(mockGS.state.questionStatus).toBe('text_inputting');
    expect(mockGS.state.activeBet).toBe(300);
    // Everyone paid 100
    expect(mockGS.state.players.every(p => p.score === 900)).toBe(true);
  });
});
