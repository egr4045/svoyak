const roomManager = require('../managers/RoomManager');
const { makePersonas, HOST_PERSONA } = require('./personas');
const BotDriver = require('./BotDriver');

// «Игроков всего 3 + 1 ведущий» — размер тестовой комнаты фиксирован
const TEST_SEATS = 3;

// Одна активная тестовая комната на аккаунт: запуск нового прогона гасит предыдущий,
// иначе забытые комнаты копятся до TTL и держат ботов зря.
const activeByPlatform = new Map();

// Срез пака до одной ячейки — для кнопки ▶ в редакторе пака: вопрос открылся,
// отыгрался, раунд кончился, game_over. Замкнутый цикл вместо предпросмотра.
function slicePack(rounds, only) {
  if (!only) return rounds;
  const round = rounds?.[only.r];
  const cat = round?.categories?.[only.c];
  const question = cat?.questions?.[only.q];
  if (!question) return null;
  return [{
    name: round.name || round.round || 'Проверка вопроса',
    categories: [{ category: cat.category || 'Проверка', questions: [question] }]
  }];
}

/**
 * Создаёт комнату с ботами и сразу их рассаживает (синхронно, до ответа HTTP —
 * поэтому ветка авто-разжалования в addPlayer при gameStarted укусить не может).
 *
 * @param {{ tester: object, rounds: Array, seat: 'host'|'player', only?: object, io: object }} opts
 * @returns {string} код комнаты
 */
function createTestRoom({ tester, rounds, seat, only, io }) {
  const pack = slicePack(rounds, only);
  if (!pack) return null;

  closeExisting(tester.platformId);

  const asHost = seat === 'host';
  const hostUser = asHost
    ? tester
    : { id: HOST_PERSONA.id, username: HOST_PERSONA.name, avatar: HOST_PERSONA.avatar, platformId: null };

  // packId ВСЕГДА null: тестовый прогон не должен писать «прошёл пак» в pack_plays
  const code = roomManager.createRoom(hostUser, { maxPlayers: TEST_SEATS, pack, packId: null });
  const room = roomManager.getRoom(code);

  // Тестер занимает место игрока ⇒ ведущий бот ⇒ host-события этому сокету не привяжутся
  // (isHost в roomHandlers сравнивает с state.host.id). Кнопку «Начать» открывает room.test.
  room.test = { seat, testerId: tester.id, platformId: tester.platformId || null };

  const personas = makePersonas(asHost ? TEST_SEATS : TEST_SEATS - 1, code);
  room.botDriver = new BotDriver(room, io, { seat, testerId: tester.id, personas });
  room.botDriver.attach();

  // room:join ботов снял таймер уборки (cancelCleanup), а живых в комнате нет — без
  // повторного взвода тестовая комната не умерла бы никогда. hasConnectedMembers ботов
  // не считает, поэтому таймер честно заведётся; приход тестера снимет его сам.
  roomManager.scheduleCleanup(code);

  if (tester.platformId) activeByPlatform.set(String(tester.platformId), code);
  return code;
}

function closeExisting(platformId) {
  if (!platformId) return;
  const prev = activeByPlatform.get(String(platformId));
  if (!prev) return;
  activeByPlatform.delete(String(platformId));
  const room = roomManager.getRoom(prev);
  if (!room) return;
  room.botDriver?.detach();
  room.clearTimers();
  roomManager.removeRoom(prev);
}

// Тестовая комната — та, где сидят боты. Используется для послабления в room:start.
function isTester(room, userId) {
  return !!room.test && String(room.test.testerId) === String(userId);
}

module.exports = { createTestRoom, slicePack, isTester, closeExisting, TEST_SEATS };
