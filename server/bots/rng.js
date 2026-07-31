// Детерминированный генератор для ботов: прогон по одному и тому же коду комнаты
// воспроизводим, а тест может засеять его явно и получить стабильную игру.
// Mulberry32 — короткий, без зависимостей, распределение достаточно ровное для наших целей.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Код комнаты (10 символов A-Z0-9) → целочисленный сид
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// Случайное целое в [min, max]
const between = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1));

// Разброс вокруг базовой задержки: люди не реагируют по метроному
const jitter = (rnd, baseMs) => Math.max(120, Math.round(baseMs * (0.7 + rnd() * 0.6)));

module.exports = { makeRng, seedFrom, pick, between, jitter };
