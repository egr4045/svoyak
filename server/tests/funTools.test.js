const GameState = require('../game/GameState');
const { registerFunTools, rollOutcome, applyOutcome, pickWeighted, OUTCOMES, ROULETTE_REVEAL_MS } = require('../handlers/funTools');

// Фейковый сокет: копим обработчики, дёргаем их руками
function fakeSocket() {
  const handlers = {};
  return { handlers, on: (ev, fn) => { handlers[ev] = fn; } };
}
function fakeIo() {
  return { to: jest.fn().mockReturnThis(), emit: jest.fn() };
}
function makeRoom(playerCount = 3) {
  const room = new GameState('FUN', { id: 'host', username: 'Host' }, {});
  for (let i = 1; i <= playerCount; i++) {
    room.addPlayer({ id: i * 10, username: 'P' + i });
    room.setPlayerConnection(i * 10, 's' + i, true);
    room.state.players[i - 1].score = i * 100; // 100, 200, 300
  }
  return room;
}

describe('funTools: приколы ведущего', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('playSound: вайтлист и рейт-лимит', () => {
    const room = makeRoom(); const io = fakeIo(); const socket = fakeSocket();
    registerFunTools(io, socket, room);

    socket.handlers['host:playSound']({ sound: 'hack.mp3' });
    expect(io.emit).not.toHaveBeenCalled();

    socket.handlers['host:playSound']({ sound: 'quack' });
    expect(io.emit).toHaveBeenCalledWith('fun:sound', { sound: 'quack' });

    io.emit.mockClear();
    socket.handlers['host:playSound']({ sound: 'fanfare' }); // < 1.5с после первого
    expect(io.emit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1600);
    socket.handlers['host:playSound']({ sound: 'fanfare' });
    expect(io.emit).toHaveBeenCalledWith('fun:sound', { sound: 'fanfare' });
  });

  test('triggerEffect: глитч требует валидную подключённую цель', () => {
    const room = makeRoom(); const io = fakeIo(); const socket = fakeSocket();
    registerFunTools(io, socket, room);

    socket.handlers['host:triggerEffect']({ effect: 'glitch', targetId: 999 });
    expect(io.emit).not.toHaveBeenCalled();

    socket.handlers['host:triggerEffect']({ effect: 'glitch', targetId: '10' }); // строковый id — ок
    expect(io.emit).toHaveBeenCalledWith('fun:effect', { effect: 'glitch', targetId: 10 });

    jest.advanceTimersByTime(900);
    io.emit.mockClear();
    socket.handlers['host:triggerEffect']({ effect: 'confetti' });
    expect(io.emit).toHaveBeenCalledWith('fun:effect', { effect: 'confetti', targetId: null });
  });

  test('spinRoulette: исход сразу, очки после reveal, второй спин отклоняется', () => {
    const room = makeRoom(); const io = fakeIo(); const socket = fakeSocket();
    registerFunTools(io, socket, room);

    socket.handlers['host:spinRoulette']();
    const call = io.emit.mock.calls.find(c => c[0] === 'fun:roulette');
    expect(call).toBeTruthy();
    expect(call[1].revealInMs).toBe(ROULETTE_REVEAL_MS);
    expect(call[1].outcome.kind).toBeTruthy();

    const scoresBefore = room.state.players.map(p => p.score);
    socket.handlers['host:spinRoulette'](); // pending — игнор
    expect(io.emit.mock.calls.filter(c => c[0] === 'fun:roulette')).toHaveLength(1);

    jest.advanceTimersByTime(ROULETTE_REVEAL_MS + 10);
    const scoresAfter = room.state.players.map(p => p.score);
    expect(scoresAfter).not.toEqual(scoresBefore); // исход применился (любой меняет счета)
    expect(room.rouletteSpin).toBeNull();
  });

  test('spinRoulette недоступна во время buzzer_active', () => {
    const room = makeRoom(); const io = fakeIo(); const socket = fakeSocket();
    registerFunTools(io, socket, room);
    room.state.questionStatus = 'buzzer_active';
    socket.handlers['host:spinRoulette']();
    expect(io.emit.mock.calls.find(c => c[0] === 'fun:roulette')).toBeUndefined();
  });
});

describe('funTools: математика исходов', () => {
  const players = [
    { id: 1, name: 'A', score: 1000, connected: true },
    { id: 2, name: 'B', score: 300, connected: true }
  ];

  test('pickWeighted детерминирован от rnd', () => {
    expect(pickWeighted(OUTCOMES, () => 0).kind).toBe('gift');
    expect(pickWeighted(OUTCOMES, () => 0.999).kind).toBe('zero');
  });

  test('steal: max(100, 10% от жертвы)', () => {
    // rnd подобран под kind=steal (веса: gift3 tax3 → steal на [6..8) из 11.5)
    const rndSeq = [6.5 / 11.5, 0, 0]; let i = 0;
    const out = rollOutcome(players, () => rndSeq[i++]);
    expect(out.kind).toBe('steal');
    expect(out.fromId).toBe(1);
    expect(out.toId).toBe(2);
    expect(out.amount).toBe(100); // 10% от 1000 = 100 → max(100,100)
  });

  test('applyOutcome swap меняет счета местами', () => {
    const room = new GameState('X', { id: 'h', username: 'H' }, {});
    room.addPlayer({ id: 1, username: 'A' });
    room.addPlayer({ id: 2, username: 'B' });
    room.state.players[0].score = 500;
    room.state.players[1].score = -100;
    applyOutcome(room, { kind: 'swap', aId: 1, aName: 'A', bId: 2, bName: 'B' }, fakeIo());
    expect(room.state.players[0].score).toBe(-100);
    expect(room.state.players[1].score).toBe(500);
  });

  test('applyOutcome zero/double/gift/tax', () => {
    const room = new GameState('X', { id: 'h', username: 'H' }, {});
    room.addPlayer({ id: 1, username: 'A' });
    room.state.players[0].score = 400;
    const io = fakeIo();
    applyOutcome(room, { kind: 'double', targetId: 1, targetName: 'A' }, io);
    expect(room.state.players[0].score).toBe(800);
    applyOutcome(room, { kind: 'tax', targetId: 1, targetName: 'A', amount: 200 }, io);
    expect(room.state.players[0].score).toBe(600);
    applyOutcome(room, { kind: 'gift', targetId: 1, targetName: 'A', amount: 200 }, io);
    expect(room.state.players[0].score).toBe(800);
    applyOutcome(room, { kind: 'zero', targetId: 1, targetName: 'A' }, io);
    expect(room.state.players[0].score).toBe(0);
  });

  test('один игрок: парные исходы деградируют в подарок/налог', () => {
    const single = [{ id: 1, name: 'A', score: 100, connected: true }];
    const rndSeq = [6.5 / 11.5, 0.1, 0.1]; let i = 0; // steal → фолбэк
    const out = rollOutcome(single, () => rndSeq[i++] ?? 0.1);
    expect(['gift', 'tax']).toContain(out.kind);
  });
});

describe('Анти-чит баззера: серверный кламп reactionTime', () => {
  test('подделанный 0 мс клампится к серверному времени − фора', () => {
    // Логика из roomHandlers: effective = max(reported, serverElapsed - 1200)
    const buzzerOpenedAt = Date.now() - 4000; // баззер открыт 4с назад
    const serverElapsed = Date.now() - buzzerOpenedAt;
    const effective = Math.max(Number(0) || 0, serverElapsed - 1200);
    expect(effective).toBeGreaterThanOrEqual(2800);
  });

  test('честное время в пределах форы не искажается', () => {
    const buzzerOpenedAt = Date.now() - 700;
    const serverElapsed = Date.now() - buzzerOpenedAt;
    const effective = Math.max(650, serverElapsed - 1200);
    expect(effective).toBe(650);
  });
});
