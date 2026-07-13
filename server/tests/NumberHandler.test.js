const NumberHandler = require('../game/questions/NumberHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('NumberHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    handler = new NumberHandler();
    gs = createMockGameState();
    io = createMockIo();
  });

  test('onSelect: ввод, ответ спрятан, цель распарсена', () => {
    const q = { points: 300, a: '1969', numberKind: 'year' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    expect(gs.state.questionStatus).toBe('number_inputting');
    expect(gs._priv.numberTarget).toBe(1969);
    expect(q.a).toBeNull(); // затёрт в broadcast
  });

  test('submitNumber: догадка в sealed, в стейте только факт', () => {
    const q = { points: 300, a: '1969', numberKind: 'year' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    handler.handleAction(gs, 'player:submitNumber', { value: '1970' }, { io, user: { id: 'p1' } });
    expect(gs.sealed.p1.num).toBe(1970);
    expect(gs.state.numberGuesses.p1).toBe(true);
    // Само значение догадки не в broadcast-стейте
    expect(JSON.stringify(gs.state.numberGuesses)).not.toContain('1970');
  });

  test('revealNumber: ближайший берёт очки, ранжирование по |diff|', () => {
    const q = { points: 300, a: '1969', numberKind: 'year' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    handler.handleAction(gs, 'player:submitNumber', { value: '1975' }, { io, user: { id: 'p1' } }); // diff 6
    handler.handleAction(gs, 'player:submitNumber', { value: '1968' }, { io, user: { id: 'p2' } }); // diff 1 → ближе
    handler.handleAction(gs, 'player:submitNumber', { value: '2000' }, { io, user: { id: 'p3' } }); // diff 31
    handler.handleAction(gs, 'host:revealNumber', null, { io });
    expect(gs.state.questionStatus).toBe('number_results');
    expect(gs.state.numberReveal.winnerId).toBe('p2');
    expect(gs.state.numberReveal.ranked[0].id).toBe('p2');
    expect(gs.state.numberReveal.answer).toBe('1969');
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', 300);
  });

  test('дата парсится в epoch и сравнивается', () => {
    const q = { points: 200, a: '2020-01-01', numberKind: 'date' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    handler.handleAction(gs, 'player:submitNumber', { value: '2020-01-05' }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:submitNumber', { value: '2019-06-01' }, { io, user: { id: 'p2' } });
    handler.handleAction(gs, 'host:revealNumber', null, { io });
    expect(gs.state.numberReveal.winnerId).toBe('p1'); // 4 дня ближе, чем полгода
  });

  test('нечисловая догадка игнорируется', () => {
    const q = { points: 100, a: '10', numberKind: 'number' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    handler.handleAction(gs, 'player:submitNumber', { value: 'абв' }, { io, user: { id: 'p1' } });
    expect(gs.state.numberGuesses.p1).toBeUndefined();
  });
});
