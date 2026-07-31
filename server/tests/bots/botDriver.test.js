const roomManager = require('../../managers/RoomManager');
const { createTestRoom } = require('../../bots/testRoom');
const { getBuiltinPack } = require('../../game/builtinPacks');
const BotDriver = require('../../bots/BotDriver');

const quietIo = () => { const sink = { emit() {} }; return { to: () => sink, emit() {} }; };
const ROUNDS = getBuiltinPack('builtin:test').rounds;
const TESTER = { id: 1, username: 'Тестер', platformId: 'pid-1' };

function started() {
  const io = quietIo();
  const code = createTestRoom({ tester: TESTER, rounds: ROUNDS, seat: 'player', io });
  const room = roomManager.getRoom(code);
  room.addPlayer(TESTER);
  room.setPlayerConnection(TESTER.id, 'sock', true);
  room.setPlayerLoaded(TESTER.id, true, 0);
  room.startGame();
  room.broadcast(io);
  return { room, io };
}

describe('планировщик ботов', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    roomManager.rooms.forEach(r => { r.botDriver?.detach(); r.clearTimers(); });
    roomManager.rooms.clear();
    roomManager.cleanupTimers.forEach(t => clearTimeout(t));
    roomManager.cleanupTimers.clear();
  });

  test('без живых участников план пуст — игра замирает, а не крутится сама с собой', () => {
    const { room, io } = started();
    expect(room.botDriver.plan().length).toBeGreaterThan(0);

    room.setPlayerConnection(TESTER.id, 'sock', false);
    expect(room.botDriver.plan()).toEqual([]);

    // Тестер вернулся — план снова живой
    room.setPlayerConnection(TESTER.id, 'sock', true);
    room.broadcast(io);
    expect(room.botDriver.plan().length).toBeGreaterThan(0);
  });

  test('повторный broadcast не сбрасывает уже заведённую задержку', () => {
    const { room, io } = started();
    const driver = room.botDriver;
    const before = new Map(driver.timers);
    expect(before.size).toBeGreaterThan(0);

    room.broadcast(io);        // состояние то же — ключи те же
    for (const [key, timer] of before) {
      // Тот же самый объект таймера ⇒ отсчёт не начался заново
      expect(driver.timers.get(key)).toBe(timer);
    }
  });

  test('смена состояния снимает вооружённое, но протухшее действие', () => {
    const { room, io } = started();
    const driver = room.botDriver;
    const keysAtSplash = [...driver.timers.keys()];
    expect(keysAtSplash.some(k => k.includes('startRound'))).toBe(true);

    room.startRound();         // showing_round_splash → idle
    room.broadcast(io);
    expect([...driver.timers.keys()].some(k => k.includes('startRound'))).toBe(false);
  });

  test('detach снимает все таймеры и отцепляет хук', () => {
    const { room } = started();
    const driver = room.botDriver;
    expect(driver.timers.size).toBeGreaterThan(0);

    driver.detach();
    expect(driver.timers.size).toBe(0);
    expect(room.onBroadcast).toBeNull();
    expect(driver.detached).toBe(true);
  });

  test('бюджет действий срабатывает и отключает ботов вместо busy-loop', () => {
    const { room } = started();
    const driver = room.botDriver;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < BotDriver.BUDGET_MAX_ACTIONS; i++) driver.actionLog.push(Date.now());
    expect(driver.budgetOk()).toBe(false);
    expect(driver.detached).toBe(true);
    expect(driver.timers.size).toBe(0);
  });

  test('после detach хук больше не планирует', () => {
    const { room, io } = started();
    const driver = room.botDriver;
    driver.detach();
    driver.onState();
    room.broadcast(io);
    expect(driver.timers.size).toBe(0);
  });
});
