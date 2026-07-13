const WhoSaidHandler = require('../game/questions/WhoSaidHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('WhoSaidHandler', () => {
  let handler, gs, io;
  const q = { points: 300, q: 'Самый неловкий момент' };
  beforeEach(() => {
    handler = new WhoSaidHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
  });

  function collectAll() {
    handler.handleAction(gs, 'player:submitWhoSaid', { text: 'ответ-A' }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'player:submitWhoSaid', { text: 'ответ-B' }, { io, user: { id: 'p2' } });
    handler.handleAction(gs, 'player:submitWhoSaid', { text: 'ответ-C' }, { io, user: { id: 'p3' } });
  }

  test('сбор: ответы в sealed, в стейте только счётчик', () => {
    collectAll();
    expect(gs.state.whoSaidCount).toBe(3);
    expect(JSON.stringify(gs.state)).not.toContain('ответ-A'); // не в broadcast до вскрытия
  });

  test('reveal: анонимные перемешанные ответы, авторы вне broadcast', () => {
    collectAll();
    handler.handleAction(gs, 'host:revealWhoSaid', null, { io });
    expect(gs.state.questionStatus).toBe('whosaid_guessing');
    expect(gs.state.whoSaidAnswers).toHaveLength(3);
    expect(gs.state.whoSaidAnswers[0].authorId).toBeUndefined(); // анонимно
    expect(Object.keys(gs._priv.whoSaidAuthors)).toHaveLength(3); // соответствие вне стейта
  });

  test('score: верные догадки начисляют очки, свой ответ не в зачёт', () => {
    collectAll();
    handler.handleAction(gs, 'host:revealWhoSaid', null, { io });
    const authors = gs._priv.whoSaidAuthors;
    // p1 угадывает всех верно
    const p1guesses = {};
    gs.state.whoSaidAnswers.forEach(a => { p1guesses[a.idx] = authors[a.idx]; });
    handler.handleAction(gs, 'player:guessAuthor', { guesses: p1guesses }, { io, user: { id: 'p1' } });
    handler.handleAction(gs, 'host:scoreWhoSaid', null, { io });

    expect(gs.state.questionStatus).toBe('whosaid_results');
    // 3 ответа, один свой (исключён) → 2 верных × round(300/3)=100 = 200
    expect(gs.state.whoSaidResult.scores.p1).toBe(200);
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 200);
    // Итог раскрывает авторов
    expect(gs.state.whoSaidResult.answers.every(a => a.authorName)).toBe(true);
  });

  test('неверные догадки — ноль', () => {
    collectAll();
    handler.handleAction(gs, 'host:revealWhoSaid', null, { io });
    const authors = gs._priv.whoSaidAuthors;
    // p2 всем ставит p3 (заведомо часть неверно)
    const bad = {};
    gs.state.whoSaidAnswers.forEach(a => { bad[a.idx] = 'p3'; });
    handler.handleAction(gs, 'player:guessAuthor', { guesses: bad }, { io, user: { id: 'p2' } });
    handler.handleAction(gs, 'host:scoreWhoSaid', null, { io });
    // p2 угадает только настоящий ответ p3 (если он не совпал со своим) — максимум 1
    expect(gs.state.whoSaidResult.scores.p2).toBeLessThanOrEqual(100);
  });
});
