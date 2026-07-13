const AliasHandler = require('../game/questions/AliasHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('AliasHandler', () => {
  let handler, gs, io;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new AliasHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 300, words: ['кот', 'дом', 'мяч'], timerSec: 60 });
  });
  afterEach(() => jest.useRealTimers());

  test('onSelect ставит выбор объясняющего', () => {
    handler.onSelect(gs, {});
    expect(gs.state.questionStatus).toBe('performer_select');
  });

  test('setPerformer стартует раунд, приватит первое слово, армит таймер', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
    expect(gs.state.questionStatus).toBe('alias_playing');
    expect(gs.state.aliasState.total).toBe(3);
    expect(gs.state.aliasState.wordPoints).toBe(100); // round(300/3)
    expect(gs.privateReveal.performerPayload.text).toBe('кот');
    // Слово не утекло в broadcast
    expect(JSON.stringify(gs.state)).not.toContain('кот');
    expect(gs.timers.aliasTimer).toBeDefined();
  });

  test('aliasGuessed начисляет обоим и переходит к следующему слову', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io }); // p1 объясняет
    handler.handleAction(gs, 'host:aliasGuessed', 'p2', { io }); // p2 угадал 1-е
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', 100);
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 100);
    expect(gs.state.aliasState.guessedCount).toBe(1);
    expect(gs.state.aliasState.index).toBe(1);
    expect(gs.privateReveal.performerPayload.text).toBe('дом');
  });

  test('aliasSkip двигает слово без начисления', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
    gs.adjustScore.mockClear();
    handler.handleAction(gs, 'host:aliasSkip', null, { io });
    expect(gs.adjustScore).not.toHaveBeenCalled();
    expect(gs.state.aliasState.index).toBe(1);
  });

  test('после последнего слова — финиш с итогом', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
    handler.handleAction(gs, 'host:aliasGuessed', 'p2', { io }); // 1
    handler.handleAction(gs, 'host:aliasSkip', null, { io });    // 2
    handler.handleAction(gs, 'host:aliasSkip', null, { io });    // 3 → finish
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.aliasResult).toEqual({ guessed: 1, total: 3 });
    expect(gs.timers.aliasTimer).toBeUndefined();
  });

  test('таймер сам завершает раунд', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
    jest.advanceTimersByTime(60_000);
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.aliasResult.total).toBe(3);
  });

  test('без слов setPerformer не стартует', () => {
    gs.getCurrentQuestion.mockReturnValue({ points: 300, words: [] });
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
    expect(gs.state.questionStatus).toBe('performer_select');
  });
});
