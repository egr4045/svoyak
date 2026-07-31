const GameState = require('../../game/GameState');
const { answersMatch, normalize } = require('../../bots/judge');
const { numberGuess } = require('../../bots/playerBrain');
const { makeRng } = require('../../bots/rng');

const io = { to: () => ({ emit() {} }), emit() {} };

// Боты читают серверные секреты вопроса из room._priv (по сети приватный показ до фейк-сокета
// не доходит). Связь неявная: переименование поля в хендлере молча превратило бы ботов
// в тыкающих наугад. Этот тест делает связь явной и роняет сборку при рассинхроне.
function room(question) {
  const g = new GameState('PRIV', { id: 'h', username: 'H' }, {
    pack: [{ name: 'R', categories: [{ category: 'Кот', questions: [question] }] }]
  });
  g.addPlayer({ id: 'p1', username: 'A' });
  g.addPlayer({ id: 'p2', username: 'B' });
  g.state.players.forEach(p => { p.connected = true; });
  g.startGame();
  g.startRound();
  g.selectQuestion(0, 0);
  g.afterSelect({ io });
  return g;
}

describe('серверные секреты, на которые опираются боты', () => {
  test('among_us: _priv.imposterId', () => {
    const g = room({ points: 100, type: 'among_us', q: 'вопрос', a: 'ответ' });
    expect(g._priv.imposterId).toBeDefined();
    expect(g.state.imposterId).toBeNull(); // публично — только после вскрытия
    g.clearTimers();
  });

  test('reaction: _priv.reactionAnswer и сетка', () => {
    const g = room({ points: 100, type: 'reaction' });
    expect(typeof g._priv.reactionAnswer).toBe('number');
    expect(Array.isArray(g._priv.reactionCells)).toBe(true);
    expect(g.state.reactionGrid).toBeNull(); // сетка скрыта на фазе чтения правила
    g.clearTimers();
  });

  test('everyone/number: _priv.numberTarget', () => {
    const g = room({ points: 100, type: 'everyone', everyoneMode: 'number', numberKind: 'year', q: 'год?', a: '1961' });
    expect(g._priv.numberTarget).toBe(1961);
    expect(g.getCurrentQuestion().a).toBeNull(); // затёрто из broadcast
    g.clearTimers();
  });

  test('show/alias: _priv.aliasWords после старта', () => {
    const g = room({ points: 100, type: 'show', showMode: 'alias', q: 'объясняй', words: ['кот', 'дом'], timerSec: 60 });
    g.handleAction('host:setPerformer', 'p1', { io });
    expect(g._priv.aliasWords).toEqual(['кот', 'дом']);
    expect(g.getCurrentQuestion().words).toBeNull();
    g.clearTimers();
  });
});

describe('автосудейство письменных ответов', () => {
  test('регистр, пунктуация и ё не мешают', () => {
    expect(answersMatch('париж', 'Париж')).toBe(true);
    expect(answersMatch('Пари́ж.', 'Париж')).toBe(true); // ударение и точка — не повод не засчитать
    expect(answersMatch('ЁЖИК', 'ежик')).toBe(true);
    expect(normalize('  Лев   Толстой!  ')).toBe('лев толстой');
  });

  test('короткий ответ засчитывается против развёрнутого эталона', () => {
    expect(answersMatch('Толстой', 'Лев Толстой')).toBe(true);
    expect(answersMatch('Лев Николаевич Толстой', 'Толстой')).toBe(true);
  });

  test('опечатка прощается, чужой ответ — нет', () => {
    expect(answersMatch('Достаевский', 'Достоевский')).toBe(true);
    expect(answersMatch('Пушкин', 'Достоевский')).toBe(false);
    expect(answersMatch('', 'Париж')).toBe(false);
  });

  test('пустой эталон судить нечем — не штрафуем игрока', () => {
    expect(answersMatch('что угодно', '')).toBe(true);
    expect(answersMatch('что угодно', null)).toBe(true);
  });
});

describe('догадки ботов про число', () => {
  const rnd = makeRng(7);

  test('дата возвращается в формате YYYY-MM-DD', () => {
    const target = Date.parse('1961-04-12');
    const guess = numberGuess(rnd, 'date', target, 0.8);
    expect(guess).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('год падает рядом с целью, а не в случайное место', () => {
    for (let i = 0; i < 20; i++) {
      const g = Number(numberGuess(rnd, 'year', 1961, 0.8));
      expect(Math.abs(g - 1961)).toBeLessThan(1961 * 0.2);
    }
  });

  test('без цели бот всё равно отвечает валидным значением', () => {
    expect(numberGuess(rnd, 'number', null, 0.5)).toMatch(/^\d+$/);
    expect(numberGuess(rnd, 'date', null, 0.5)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
