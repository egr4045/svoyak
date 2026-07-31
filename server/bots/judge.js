// Автосудейство письменных ответов для бота-ведущего. Человек-ведущий засчитывает
// «париж» за «Париж» и «Пари́ж.» — значит и бот должен, иначе тестовая игра врёт.
// Ё→Е и убор пунктуации: в паках оба написания встречаются вперемешку.
function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Расстояние Левенштейна с ранним выходом по лимиту (ответы короткие, полная матрица не нужна)
function withinDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > limit) return false;
    prev = cur;
  }
  return prev[b.length] <= limit;
}

// Совпадает ли ответ игрока с эталоном. Пустой эталон → судить нечем, считаем верным
// (иначе бот-ведущий штрафовал бы всех на вопросах без заполненного поля «ответ»).
function answersMatch(given, expected) {
  const a = normalize(given);
  const b = normalize(expected);
  if (!b) return true;
  if (!a) return false;
  if (a === b) return true;
  // Эталон может быть развёрнутым («Лев Толстой»), ответ — коротким («Толстой»)
  if (b.includes(a) && a.length >= Math.max(3, b.length * 0.4)) return true;
  if (a.includes(b) && b.length >= 3) return true;
  // Одна-две опечатки на длинном слове
  const limit = b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2;
  return limit > 0 && withinDistance(a, b, limit);
}

module.exports = { normalize, answersMatch };
