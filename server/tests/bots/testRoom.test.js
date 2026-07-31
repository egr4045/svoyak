const roomManager = require('../../managers/RoomManager');
const { createTestRoom, slicePack } = require('../../bots/testRoom');
const { getBuiltinPack } = require('../../game/builtinPacks');

const quietIo = () => { const sink = { emit() {} }; return { to: () => sink, emit() {} }; };
const ROUNDS = getBuiltinPack('builtin:test').rounds;

function make(seat, tester = { id: 1, username: 'Тестер', platformId: 'pid-1' }) {
  const io = quietIo();
  const code = createTestRoom({ tester, rounds: ROUNDS, seat, io });
  return { room: roomManager.getRoom(code), code, io, tester };
}

describe('тестовая комната', () => {
  afterEach(() => {
    roomManager.rooms.forEach(r => { r.botDriver?.detach(); r.clearTimers(); });
    roomManager.rooms.clear();
    roomManager.cleanupTimers.forEach(t => clearTimeout(t));
    roomManager.cleanupTimers.clear();
  });

  test('тестер на месте игрока: ведущий — бот, два бота-игрока, одно место свободно', () => {
    const { room } = make('player');
    expect(room.state.host.id).toBe('bot:host');
    expect(room.state.host.isBot).toBe(true);
    expect(room.state.maxPlayers).toBe(3);
    expect(room.state.players).toHaveLength(2);
    expect(room.state.players.every(p => p.isBot)).toBe(true);
    expect(room.state.players.every(p => p.loadedAssets)).toBe(true);
    // Видео у ботов не монтируется — клиент смотрит на platformId
    expect(room.state.players.every(p => p.platformId === null)).toBe(true);
  });

  test('тестер на месте ведущего: он хост, все три игрока — боты', () => {
    const { room, tester } = make('host');
    expect(String(room.state.host.id)).toBe(String(tester.id));
    expect(room.state.host.isBot).toBeUndefined();
    expect(room.state.players).toHaveLength(3);
    expect(room.state.players.every(p => p.isBot)).toBe(true);
  });

  test('прогон не пишет «прошёл пак»: packId остаётся null', () => {
    const { room } = make('player');
    expect(room.packId).toBeNull();
  });

  test('комната из одних ботов НЕ считается живой — иначе она не умрёт никогда', () => {
    const { room, tester } = make('player');
    expect(room.hasConnectedMembers()).toBe(false);

    room.addPlayer(tester);
    room.setPlayerConnection(tester.id, 'sock', true);
    expect(room.hasConnectedMembers()).toBe(true);

    room.setPlayerConnection(tester.id, 'sock', false);
    expect(room.hasConnectedMembers()).toBe(false);
  });

  test('очистка пустой комнаты снимает таймеры ботов', () => {
    jest.useFakeTimers();
    try {
      const { room, code } = make('player');
      expect(room.botDriver.detached).toBe(false);
      jest.advanceTimersByTime(16 * 60 * 1000); // TTL пустой комнаты — 15 минут
      expect(roomManager.getRoom(code)).toBeUndefined();
      expect(room.botDriver.detached).toBe(true);
      expect(room.botDriver.timers.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('второй запуск того же аккаунта гасит предыдущую комнату', () => {
    const { code: first } = make('player');
    const { code: second } = make('player');
    expect(first).not.toBe(second);
    expect(roomManager.getRoom(first)).toBeUndefined();
    expect(roomManager.getRoom(second)).toBeDefined();
  });

  test('срез до одной ячейки даёт один раунд с одним вопросом', () => {
    const sliced = slicePack(ROUNDS, { r: 0, c: 1, q: 2 });
    expect(sliced).toHaveLength(1);
    expect(sliced[0].categories).toHaveLength(1);
    expect(sliced[0].categories[0].questions).toHaveLength(1);
    expect(sliced[0].categories[0].questions[0]).toBe(ROUNDS[0].categories[1].questions[2]);
    expect(slicePack(ROUNDS, { r: 99, c: 0, q: 0 })).toBeNull();
  });

  test('строковые id ботов не ломают начисление очков', () => {
    const { room } = make('player');
    const bot = room.state.players[0];
    room.adjustScore(String(bot.id), 300);   // ключ объекта — строка, как в textAnswers
    expect(bot.score).toBe(300);
    room.setSelectingPlayer(bot.id);
    expect(room.state.selectingPlayerId).toBe(bot.id);
  });
});
