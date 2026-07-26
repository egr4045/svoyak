const PotatoHandler = require('../game/questions/PotatoHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

const FIZZ_MS = PotatoHandler.FIZZ_MS;
// Таймер бомбы случайный (15–40с) — пиним random, иначе advanceTimersByTime
// проглатывает заодно и окно шипения, и тесты становятся невоспроизводимыми.
const BOMB_MS = 15000;

describe('PotatoHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0); // ms = 15000 + 0
    handler = new PotatoHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 150, q: 'Марки машин' });
    handler.onSelect(gs, { points: 150 });
  });
  afterEach(() => { jest.useRealTimers(); Math.random.mockRestore(); });

  test('onSelect строит кольцо и держателя', () => {
    expect(gs.state.questionStatus).toBe('potato_playing');
    expect(gs.state.potatoRing).toEqual(['p1', 'p2', 'p3']);
    expect(gs.state.potatoTurnId).toBe('p1');
    expect(gs.state.potatoFizzing).toBe(false);
  });

  test('host:passPotato двигает ход по кругу', () => {
    handler.handleAction(gs, 'host:passPotato', null, { io });
    expect(gs.state.potatoTurnId).toBe('p2');
    handler.handleAction(gs, 'host:passPotato', null, { io });
    expect(gs.state.potatoTurnId).toBe('p3');
    handler.handleAction(gs, 'host:passPotato', null, { io });
    expect(gs.state.potatoTurnId).toBe('p1'); // по кругу
  });

  test('игрок пасовать не может — событие игрока больше не обрабатывается', () => {
    handler.handleAction(gs, 'player:passPotato', null, { io, user: { id: 'p1' } });
    expect(gs.state.potatoTurnId).toBe('p1');
  });

  test('дедлайн бомбы уходит только ведущему, в общий стейт не попадает', () => {
    handler.afterSelect(gs, { io });
    const [target, perfPayload, hostPayload] = gs.setPrivateReveal.mock.calls[0];
    expect(target).toBeNull();          // адресата-игрока нет ⇒ получит один ведущий
    expect(perfPayload).toBeNull();
    expect(hostPayload.kind).toBe('potato_host');
    expect(hostPayload.bombAt).toBe(Date.now() + BOMB_MS);
    expect(JSON.stringify(gs.state)).not.toContain('bombAt');
  });

  test('таймер не рвёт сразу, а включает шипение', () => {
    handler.afterSelect(gs, { io });
    jest.advanceTimersByTime(BOMB_MS);
    expect(gs.state.potatoFizzing).toBe(true);
    expect(gs.state.questionStatus).toBe('potato_playing'); // ещё не взорвалась
    expect(gs.state.potatoResult).toBeNull();
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('взрыв достаётся держателю на конец окна шипения', () => {
    handler.afterSelect(gs, { io });
    handler.handleAction(gs, 'host:passPotato', null, { io }); // теперь p2
    jest.advanceTimersByTime(BOMB_MS);
    expect(gs.state.potatoFizzing).toBe(true);
    jest.advanceTimersByTime(FIZZ_MS);
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.potatoResult.loserId).toBe('p2');
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', -150);
    expect(gs.state.potatoFizzing).toBe(false);
  });

  test('в окне шипения ещё можно передать — взрывается у НОВОГО держателя', () => {
    handler.afterSelect(gs, { io });
    jest.advanceTimersByTime(BOMB_MS);      // зашипела у p1
    expect(gs.state.potatoFizzing).toBe(true);
    jest.advanceTimersByTime(FIZZ_MS - 500);
    handler.handleAction(gs, 'host:passPotato', null, { io }); // успели передать p2
    expect(gs.state.potatoTurnId).toBe('p2');
    jest.advanceTimersByTime(500);
    expect(gs.state.potatoResult.loserId).toBe('p2');
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', -150);
  });

  test('после взрыва пас не действует', () => {
    handler.afterSelect(gs, { io });
    jest.advanceTimersByTime(BOMB_MS + FIZZ_MS);
    const loser = gs.state.potatoResult.loserId;
    handler.handleAction(gs, 'host:passPotato', null, { io });
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.potatoResult.loserId).toBe(loser);
  });
});
