const AmongUsHandler = require('../game/questions/AmongUsHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('AmongUsHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    handler = new AmongUsHandler();
    mockGS = createMockGameState({
      state: {
        textAnswers: { p1: 'a', p2: 'b', p3: 'c' }
      }
    });
    mockIo = createMockIo();
  });

  test('onSelect назначает шпиона ВНЕ broadcast (утечка через devtools закрыта)', () => {
    handler.onSelect(mockGS, { points: 200 });
    expect(mockGS.state.imposterId).toBeNull();               // в стейте пусто до вскрытия
    expect(['p1', 'p2', 'p3']).toContain(mockGS._priv.imposterId);
  });

  test('afterSelect приватно сообщает роль шпиону и имя — ведущему', () => {
    handler.onSelect(mockGS, { points: 200 });
    handler.afterSelect(mockGS, { io: mockIo });
    expect(mockGS.setPrivateReveal).toHaveBeenCalled();
    const [target, perfPayload, hostPayload] = mockGS.setPrivateReveal.mock.calls[0];
    expect(target).toBe(mockGS._priv.imposterId);
    expect(perfPayload.kind).toBe('imposter');
    expect(hostPayload.kind).toBe('imposter_host');
    expect(typeof hostPayload.imposterName).toBe('string');
  });

  test('revealAmongUs публикует imposterId для бейджа «ШПИОН»', () => {
    handler.onSelect(mockGS, { points: 200 });
    const imp = mockGS._priv.imposterId;
    mockGS.state.questionStatus = 'among_us_voting';
    mockGS.state.amongUsVotes = {};
    mockGS.state.textAnswers = { p1: 'a', p2: 'b', p3: 'c' };
    handler.revealAmongUs(mockGS, mockIo);
    expect(mockGS.state.imposterId).toBe(imp);
  });

  test('revealAmongUs awards crew if imposter is found (majority votes)', () => {
    mockGS.state.imposterId = 'p1';
    mockGS.state.amongUsVotes = {
      p2: 'p1',
      p3: 'p1'
    };
    handler.revealAmongUs(mockGS, mockIo);
    expect(mockGS.state.amongUsResult).toBe('crew_win');
    // Alice (p1) loses 2*500 = 1000 (adjustScore uses 500 from mock GS q)
    expect(mockGS.state.players.find(p => p.id === 'p1').score).toBe(0);
    // Bob and Charlie get 500
    expect(mockGS.state.players.find(p => p.id === 'p2').score).toBe(1500);
    expect(mockGS.state.players.find(p => p.id === 'p3').score).toBe(1500);
  });

  test('revealAmongUs awards imposter if NOT found', () => {
    mockGS.state.imposterId = 'p1';
    mockGS.state.amongUsVotes = {
      p2: 'p3',
      p3: 'p2'
    };
    handler.revealAmongUs(mockGS, mockIo);
    expect(mockGS.state.amongUsResult).toBe('imposter_win');
    // Alice (p1) gets 2*500 = 1000
    expect(mockGS.state.players.find(p => p.id === 'p1').score).toBe(2000);
    // Bob and Charlie lose 500
    expect(mockGS.state.players.find(p => p.id === 'p2').score).toBe(500);
  });

  test('revealAmongUs handles tie (imp vs crew) - imposter wins by default if not strictly majority?', () => {
    // Actually, let's check the logic in AmongUsHandler.js for ties.
    // If we have 3 players: p1(imp), p2, p3. 
    // Votes: p2:p1, p3:p2. It's a tie between p1 and p2.
    mockGS.state.imposterId = 'p1';
    mockGS.state.amongUsVotes = {
      p1: 'p2',
      p2: 'p1',
      p3: 'p1'
    };
    // Wait, p1:1, p2:1. In AmongUsHandler.js:
    // for (const vote of Object.values(gameState.state.amongUsVotes)) counts[vote] = (counts[vote] || 0) + 1;
    // let maxVotes = 0; let votedId = null;
    // for (const [id, count] of Object.entries(counts)) { if (count > maxVotes) { maxVotes = count; votedId = id; } else if (count === maxVotes) { votedId = null; } }
    
    // In this case (p1:2, p2:1), p1 is found.
    // Let's test a real tie: p2 votes p1, p3 votes p2.
    mockGS.state.amongUsVotes = {
      p2: 'p1',
      p3: 'p2'
    };
    handler.revealAmongUs(mockGS, mockIo);
    // Tie means votedId = null -> Imposter wins.
    expect(mockGS.state.amongUsResult).toBe('imposter_win');
  });

  test('handleAction player:voteAmongUs allows voting (including self)', () => {
    mockGS.state.questionStatus = 'among_us_voting';
    handler.handleAction(mockGS, 'player:voteAmongUs', 'p1', { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.amongUsVotes['p1']).toBe('p1');
  });
});
