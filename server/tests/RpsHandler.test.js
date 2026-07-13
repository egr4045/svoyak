const RpsHandler = require('../game/questions/RpsHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('RpsHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    handler = new RpsHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 200 });
    handler.onSelect(gs, { points: 200 });
  });

  test('onSelect ставит rps_picking и пустой duelState', () => {
    expect(gs.state.questionStatus).toBe('rps_picking');
    expect(gs.state.duelState.aId).toBeNull();
    expect(gs.state.duelState.bId).toBeNull();
  });

  test('host:setDuel назначает A, затем B; повтор того же — игнор', () => {
    handler.handleAction(gs, 'host:setDuel', 'p1', { io });
    expect(gs.state.duelState.aId).toBe('p1');
    handler.handleAction(gs, 'host:setDuel', 'p1', { io }); // тот же — не в B
    expect(gs.state.duelState.bId).toBeNull();
    handler.handleAction(gs, 'host:setDuel', 'p2', { io });
    expect(gs.state.duelState.bId).toBe('p2');
  });

  test('host:setDuel(null) сбрасывает выбор', () => {
    handler.handleAction(gs, 'host:setDuel', 'p1', { io });
    handler.handleAction(gs, 'host:setDuel', 'p2', { io });
    handler.handleAction(gs, 'host:setDuel', null, { io });
    expect(gs.state.duelState.aId).toBeNull();
    expect(gs.state.duelState.bId).toBeNull();
  });

  test('rpsPick не-дуэлянта игнорируется, секрет не в стейте', () => {
    handler.handleAction(gs, 'host:setDuel', 'p1', { io });
    handler.handleAction(gs, 'host:setDuel', 'p2', { io });
    handler.handleAction(gs, 'player:rpsPick', { choice: 'rock' }, { io, user: { id: 'p3' } });
    expect(gs.state.duelState.aReady).toBe(false);
    expect(gs.state.duelState.bReady).toBe(false);
  });

  test('оба выбрали → вскрытие и очки победителю (rock бьёт scissors)', () => {
    handler.handleAction(gs, 'host:setDuel', 'p1', { io });
    handler.handleAction(gs, 'host:setDuel', 'p2', { io });
    handler.handleAction(gs, 'player:rpsPick', { choice: 'rock' }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:rpsPick', { choice: 'scissors' }, { io, user: { id: 'p2' } });
    expect(gs.state.duelState.revealed).toBe(true);
    expect(gs.state.duelState.winnerId).toBe('p1');
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 200);
    // Выборы не утекли в broadcast до вскрытия — но после вскрытия они в duelState (норм)
    expect(gs.state.duelState.aPick).toBe('rock');
  });

  test('ничья → переигровка (готовности сброшены, не вскрыто)', () => {
    handler.handleAction(gs, 'host:setDuel', 'p1', { io });
    handler.handleAction(gs, 'host:setDuel', 'p2', { io });
    handler.handleAction(gs, 'player:rpsPick', { choice: 'paper' }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:rpsPick', { choice: 'paper' }, { io, user: { id: 'p2' } });
    expect(gs.state.duelState.revealed).toBe(false);
    expect(gs.state.duelState.tie).toBe(true);
    expect(gs.state.duelState.aReady).toBe(false);
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });
});
