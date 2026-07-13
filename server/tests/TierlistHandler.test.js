const TierlistHandler = require('../game/questions/TierlistHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('TierlistHandler', () => {
  let handler, gs, io;
  const q = { points: 100, items: [{ label: 'A' }, { label: 'B' }] };
  beforeEach(() => {
    handler = new TierlistHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
  });

  test('onSelect ставит оценку', () => {
    expect(gs.state.questionStatus).toBe('tier_rating');
    expect(gs.state.tierSubmitted).toEqual([]);
  });

  test('submitTier: оценки в sealed, клампятся 1..10, факт в tierSubmitted', () => {
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 15, 1: 0 } }, { io, user: { id: 'p1' } });
    expect(gs.sealed.p1).toEqual({ 0: 10, 1: 1 });
    expect(gs.state.tierSubmitted).toContain('p1');
    // Значения оценок не в broadcast (только список сдавших)
    expect(JSON.stringify(gs.state.tierSubmitted)).not.toContain('10');
  });

  test('revealTier: медиана по объекту и очки за близость', () => {
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 8 } }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 6 } }, { io, user: { id: 'p2' } });
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 10 } }, { io, user: { id: 'p3' } });
    handler.handleAction(gs, 'host:revealTier', null, { io });

    expect(gs.state.questionStatus).toBe('tier_results');
    expect(gs.state.tierMedians).toEqual([5, 8]);
    // p1 точно на медиане по обоим → полные 100
    expect(gs.state.tierResults.scores.p1).toBe(100);
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 100);
    // p2/p3 отклонились по объекту B → меньше
    expect(gs.state.tierResults.scores.p2).toBeLessThan(100);
    expect(gs.state.tierResults.scores.p3).toBeLessThan(100);
  });

  test('чётное число оценок → медиана как среднее двух центральных', () => {
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 2, 1: 1 } }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 4, 1: 1 } }, { io, user: { id: 'p2' } });
    handler.handleAction(gs, 'host:revealTier', null, { io });
    expect(gs.state.tierMedians[0]).toBe(3); // (2+4)/2
  });
});
