// Реестр встроенных паков — тех, что доступны любому ведущему без записи в БД.
//
// Обычные паки живут в таблице packs и принадлежат владельцу; встроенные лежат в коде,
// поэтому у них нет id в БД, нет TTL и нет владельца. Комната отличает их по префиксу
// «builtin:» в packId.
//
// ВАЖНО: packId встроенного пака НЕ должен доезжать до GameState — на нём завязана запись
// «прошёл пак» (pack_plays), а внешнего ключа для builtin:* в packs нет. См. routes в index.js.
const initialGameData = require('./initialData');
const testPackData = require('./testPackData');

const BUILTIN_PREFIX = 'builtin:';

const BUILTIN_PACKS = {
  test: { name: 'Тестовый (все типы вопросов)', rounds: testPackData }
};

const isBuiltinPackId = (id) => typeof id === 'string' && id.startsWith(BUILTIN_PREFIX);

// → { rounds } как у пака из БД (GameState.extractRounds примет и прогонит через миграцию),
// либо null, если такого встроенного пака нет.
function getBuiltinPack(id) {
  if (!isBuiltinPackId(id)) return null;
  const entry = BUILTIN_PACKS[id.slice(BUILTIN_PREFIX.length)];
  return entry ? { rounds: entry.rounds } : null;
}

// Для витрины в кабинете ведущего: [{ id, name }]
const listBuiltinPacks = () =>
  Object.entries(BUILTIN_PACKS).map(([key, v]) => ({ id: BUILTIN_PREFIX + key, name: v.name }));

module.exports = { BUILTIN_PREFIX, isBuiltinPackId, getBuiltinPack, listBuiltinPacks, initialGameData };
