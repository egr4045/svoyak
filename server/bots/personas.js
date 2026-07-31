const { makeRng, seedFrom, between } = require('./rng');

// Пул характеров. skill — как часто бот знает ответ, speed — множитель всех задержек
// (0.6 — быстрый, 1.6 — задумчивый). Разные боты должны ощущаться по-разному, иначе
// тестер видит три одинаковых автомата и ничего не проверяет.
const POOL = [
  { name: 'Лиса',      avatar: '🦊', skill: 0.78, speed: 0.75 },
  { name: 'Осьминог',  avatar: '🐙', skill: 0.55, speed: 1.05 },
  { name: 'Тостер',    avatar: '🤖', skill: 0.40, speed: 1.40 },
  { name: 'Капибара',  avatar: '🐹', skill: 0.66, speed: 1.20 },
  { name: 'Ёж',        avatar: '🦔', skill: 0.50, speed: 0.90 }
];

const HOST_PERSONA = { id: 'bot:host', name: 'Ведущий-бот', avatar: '🎤' };

// count персон, детерминированно по коду комнаты
function makePersonas(count, roomCode) {
  const rnd = makeRng(seedFrom(roomCode));
  const pool = POOL.slice();
  const out = [];
  for (let i = 0; i < count; i++) {
    const [p] = pool.splice(between(rnd, 0, pool.length - 1), 1);
    out.push({
      id: `bot:p${i + 1}`,
      name: p.name,
      avatar: p.avatar,
      // Лёгкий сдвиг характера, чтобы одна и та же персона не была клоном себя в разных комнатах
      skill: Math.min(0.9, Math.max(0.3, p.skill + (rnd() - 0.5) * 0.15)),
      speed: Math.min(1.8, Math.max(0.55, p.speed + (rnd() - 0.5) * 0.3))
    });
  }
  return out;
}

module.exports = { makePersonas, HOST_PERSONA, POOL };
