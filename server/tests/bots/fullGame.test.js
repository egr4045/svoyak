const roomManager = require('../../managers/RoomManager');
const { createTestRoom } = require('../../bots/testRoom');
const { getBuiltinPack } = require('../../game/builtinPacks');
const initialGameData = require('../../game/initialData');
const { makeRng } = require('../../bots/rng');
const BotDriver = require('../../bots/BotDriver');

// Главная страховка тестового режима: машина из 30 статусов не должна вставать насмерть.
// Гоняем ЦЕЛЫЕ игры ботов на виртуальных таймерах и требуем game_over с отыгранной доской.
// Math.random засеиваем: и код комнаты, и все серверные броски (шпион, сетка реакции,
// таймер картошки, тасовка «кто сказал») становятся воспроизводимыми.

const VIRTUAL_LIMIT_MS = 120 * 60 * 1000;
const STEP_MS = 250;

// Лёгкий io: за игру уходят тысячи broadcast, накапливать их в jest.fn незачем
function quietIo() {
  const sink = { emit() {} };
  return { to: () => sink, emit() {} };
}

// Прогоняет игру целиком. Тестер сидит на месте игрока, но ПАССИВЕН — худший случай:
// боты обязаны довести партию до конца сами.
function playFullGame(rounds, seed, seat = 'player') {
  jest.spyOn(Math, 'random').mockImplementation(makeRng(seed));
  const io = quietIo();
  const tester = { id: 1, username: 'Тестер', platformId: `pid-${seed}` };
  const code = createTestRoom({ tester, rounds, seat, io });
  const room = roomManager.getRoom(code);
  room.addPlayer(tester);
  room.setPlayerConnection(tester.id, 'sock-tester', true);
  room.setPlayerLoaded(tester.id, true, 0);
  room.startGame();
  room.broadcast(io);

  let virtual = 0;
  while (room.state.questionStatus !== 'game_over' && virtual < VIRTUAL_LIMIT_MS) {
    jest.advanceTimersByTime(STEP_MS);
    virtual += STEP_MS;
  }
  return { room, virtual, code };
}

const allCells = (room) => room.state.roundsData.flatMap(r => r.categories.flatMap(c => c.questions));
const everyCellAnswered = (room) => allCells(room).every(q => q.answered === true);

describe('полная игра ботов', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    roomManager.rooms.forEach(r => r.botDriver?.detach());
    roomManager.rooms.clear();
    roomManager.cleanupTimers.forEach(t => clearTimeout(t));
    roomManager.cleanupTimers.clear();
    // Коды не переиспользуются в проде, но в тестах общий Set сбивал бы сид следующего прогона
    roomManager.usedCodes.clear();
  });

  test('встроенный тестовый пак доигрывается до конца', () => {
    const { room, virtual } = playFullGame(getBuiltinPack('builtin:test').rounds, 12345);

    expect(room.state.questionStatus).toBe('game_over');
    expect(everyCellAnswered(room)).toBe(true);
    expect(allCells(room)).toHaveLength(26);
    // 26 ячеек за разумное игровое время — если вылезло за час, где-то ждём впустую
    expect(virtual).toBeLessThan(60 * 60 * 1000);
    // Боты реально играли, а не пролистали доску
    expect(room.state.players.filter(p => p.score !== 0).length).toBeGreaterThanOrEqual(2);
  });

  test('дефолтный пак (85 ячеек) тоже доигрывается', () => {
    const { room } = playFullGame(initialGameData, 777);
    expect(room.state.questionStatus).toBe('game_over');
    expect(everyCellAnswered(room)).toBe(true);
  });

  test('игра идёт на настоящих механиках, а не на аварийном закрытии', () => {
    const { room } = playFullGame(getBuiltinPack('builtin:test').rounds, 12345);
    const stats = room.botDriver.stats;

    // Каждая механика встроенного пака должна была реально отыграться
    for (const step of [
      'buzzer', 'judge', 'revealText', 'judgeText', 'revealBets', 'roulette', 'revealMore',
      'setPerformer', 'resolveShow', 'aliasStep', 'revealNumber', 'revealTier',
      'revealWhoSaid', 'scoreWhoSaid', 'revealSpy', 'revealSketches', 'award', 'pass', 'setDuel'
    ]) {
      expect({ step, n: stats[step] || 0 }).toEqual({ step, n: expect.any(Number) });
      expect(stats[step] || 0).toBeGreaterThan(0);
    }
    // Боты — тоже: жали баззер, писали, ставили, рисовали, голосовали, тапали, выбирали вопрос
    for (const step of ['buzz', 'answerText', 'answerSpy', 'bid', 'draw', 'voteSketch',
      'voteSpy', 'rps', 'number', 'tier', 'whosaid', 'guessAuthor', 'tap', 'highlight']) {
      expect(stats[step] || 0).toBeGreaterThan(0);
    }
  });

  // Один зелёный прогон ничего не доказывает: тупик прячется в редкой ветке (кто нажал
  // баззер, ничья в аукционе, промахи реакции, дуэлянт-молчун). Гоняем 20 разных партий.
  test('20 партий подряд: ни одного зависания и ни одного аварийного закрытия', () => {
    const stuckHits = [];
    const unfinished = [];
    const origRun = BotDriver.prototype.run;
    BotDriver.prototype.run = function (key) {
      if (key.includes('|stuck|')) {
        stuckHits.push(`${this.room.state.questionStatus}/${this.room.getCurrentQuestion()?.type}`);
      }
      return origRun.call(this, key);
    };
    try {
      for (let seed = 1; seed <= 20; seed++) {
        const rounds = seed % 5 === 0 ? initialGameData : getBuiltinPack('builtin:test').rounds;
        const { room } = playFullGame(rounds, seed * 7919);
        if (room.state.questionStatus !== 'game_over') {
          unfinished.push(`seed ${seed}: ${room.state.questionStatus}`);
        }
        room.botDriver.detach();
        roomManager.rooms.clear();
        jest.restoreAllMocks();
      }
    } finally {
      BotDriver.prototype.run = origRun;
    }
    expect(unfinished).toEqual([]);
    // 'stuck' — предохранитель от зависания. Срабатывает ⇒ какой-то статус не разбирается
    // мозгом ведущего и вопрос закрылся насильно, ничего не отыграв.
    expect(stuckHits).toEqual([]);
  }, 60000);

  test('после game_over боты не оставляют висящих таймеров', () => {
    const { room } = playFullGame(getBuiltinPack('builtin:test').rounds, 4242);
    room.botDriver.detach();
    expect(room.botDriver.timers.size).toBe(0);
    expect(Object.keys(room.timers)).toHaveLength(0);
  });
});
