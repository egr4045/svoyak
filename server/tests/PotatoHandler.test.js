const PotatoHandler = require('../game/questions/PotatoHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('PotatoHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    jest.useFakeTimers();
    handler = new PotatoHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 150, q: 'Марки машин' });
    handler.onSelect(gs, { points: 150 });
  });
  afterEach(() => jest.useRealTimers());

  test('onSelect строит кольцо и держателя', () => {
    expect(gs.state.questionStatus).toBe('potato_playing');
    expect(gs.state.potatoRing).toEqual(['p1', 'p2', 'p3']);
    expect(gs.state.potatoTurnId).toBe('p1');
  });

  test('passPotato держателем двигает ход по кругу', () => {
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p1' } });
    expect(gs.state.potatoTurnId).toBe('p2');
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p2' } });
    expect(gs.state.potatoTurnId).toBe('p3');
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p3' } });
    expect(gs.state.potatoTurnId).toBe('p1'); // по кругу
  });

  test('passPotato не-держателем игнорируется', () => {
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p2' } });
    expect(gs.state.potatoTurnId).toBe('p1');
  });

  test('скрытый таймер взрывается у текущего держателя (−очки)', () => {
    handler.afterSelect(gs, { io });
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p1' } }); // теперь p2
    jest.advanceTimersByTime(40000); // максимум окна
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.potatoResult.loserId).toBe('p2');
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', -150);
  });

  test('после взрыва passPotato не действует', () => {
    handler.afterSelect(gs, { io });
    jest.advanceTimersByTime(40000);
    const loser = gs.state.potatoResult.loserId;
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: loser } });
    expect(gs.state.questionStatus).toBe('idle');
  });
});
