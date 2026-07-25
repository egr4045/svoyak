const EveryoneHandler = require('../game/questions/EveryoneHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

// Покрытие слитых механик бывших number/tierlist/whosaid: поведенческие ассерты прежних
// сьютов сохранены, режим задаётся полем everyoneMode вопроса.
describe('EveryoneHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    handler = new EveryoneHandler();
    gs = createMockGameState();
    io = createMockIo();
  });

  describe('режим number (угадай число)', () => {
    test('onSelect: ввод, ответ спрятан, цель распарсена', () => {
      const q = { points: 300, a: '1969', numberKind: 'year', everyoneMode: 'number' };
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
      expect(gs.state.questionStatus).toBe('number_inputting');
      expect(gs._priv.numberTarget).toBe(1969);
      expect(q.a).toBeNull(); // затёрт в broadcast
    });

    test('submitNumber: догадка в sealed, в стейте только факт', () => {
      const q = { points: 300, a: '1969', numberKind: 'year', everyoneMode: 'number' };
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
      handler.handleAction(gs, 'player:submitNumber', { value: '1970' }, { io, user: { id: 'p1' } });
      expect(gs.sealed.p1.num).toBe(1970);
      expect(gs.state.numberGuesses.p1).toBe(true);
      // Само значение догадки не в broadcast-стейте
      expect(JSON.stringify(gs.state.numberGuesses)).not.toContain('1970');
    });

    test('revealNumber: ближайший берёт очки, ранжирование по |diff|', () => {
      const q = { points: 300, a: '1969', numberKind: 'year', everyoneMode: 'number' };
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
      handler.handleAction(gs, 'player:submitNumber', { value: '1975' }, { io, user: { id: 'p1' } }); // diff 6
      handler.handleAction(gs, 'player:submitNumber', { value: '1968' }, { io, user: { id: 'p2' } }); // diff 1 → ближе
      handler.handleAction(gs, 'player:submitNumber', { value: '2000' }, { io, user: { id: 'p3' } }); // diff 31
      handler.handleAction(gs, 'host:revealNumber', null, { io });
      expect(gs.state.questionStatus).toBe('number_results');
      expect(gs.state.numberReveal.winnerId).toBe('p2');
      expect(gs.state.numberReveal.ranked[0].id).toBe('p2');
      expect(gs.state.numberReveal.answer).toBe('1969');
      expect(gs.adjustScore).toHaveBeenCalledWith('p2', 300);
    });

    test('дата парсится в epoch и сравнивается', () => {
      const q = { points: 200, a: '2020-01-01', numberKind: 'date', everyoneMode: 'number' };
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
      handler.handleAction(gs, 'player:submitNumber', { value: '2020-01-05' }, { io, user: { id: 'p1' } });
      handler.handleAction(gs, 'player:submitNumber', { value: '2019-06-01' }, { io, user: { id: 'p2' } });
      handler.handleAction(gs, 'host:revealNumber', null, { io });
      expect(gs.state.numberReveal.winnerId).toBe('p1'); // 4 дня ближе, чем полгода
    });

    test('нечисловая догадка игнорируется', () => {
      const q = { points: 100, a: '10', numberKind: 'number', everyoneMode: 'number' };
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
      handler.handleAction(gs, 'player:submitNumber', { value: 'абв' }, { io, user: { id: 'p1' } });
      expect(gs.state.numberGuesses.p1).toBeUndefined();
    });
  });

  describe('режим tierlist (тир-лист)', () => {
    const q = { points: 100, items: [{ label: 'A' }, { label: 'B' }], everyoneMode: 'tierlist' };
    beforeEach(() => {
      gs.getCurrentQuestion.mockReturnValue(q);
      handler.onSelect(gs, q);
    });

    test('onSelect ставит оценку', () => {
      expect(gs.state.questionStatus).toBe('tier_rating');
      expect(gs.state.tierSubmitted).toEqual([]);
    });

    test('submitTier: оценки в sealed, клампятся 1..10, факт в tierSubmitted', () => {
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 15, 1: 0 } }, { io, user: { id: 'p1' } });
      expect(gs.sealed.p1).toEqual({ 0: 10, 1: 1 });
      expect(gs.state.tierSubmitted).toContain('p1');
      // Значения оценок не в broadcast (только список сдавших)
      expect(JSON.stringify(gs.state.tierSubmitted)).not.toContain('10');
    });

    test('revealTier: медиана по объекту и очки за близость', () => {
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 8 } }, { io, user: { id: 'p1' } });
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 6 } }, { io, user: { id: 'p2' } });
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 5, 1: 10 } }, { io, user: { id: 'p3' } });
      handler.handleAction(gs, 'host:revealTier', null, { io });

      expect(gs.state.questionStatus).toBe('tier_results');
      expect(gs.state.tierMedians).toEqual([5, 8]);
      // p1 точно на медиане по обоим → полные 100
      expect(gs.state.tierResults.scores.p1).toBe(100);
      expect(gs.adjustScore).toHaveBeenCalledWith('p1', 100);
      // p2/p3 отклонились по объекту B → меньше
      expect(gs.state.tierResults.scores.p2).toBeLessThan(100);
      expect(gs.state.tierResults.scores.p3).toBeLessThan(100);
    });

    test('чётное число оценок → медиана как среднее двух центральных', () => {
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 2, 1: 1 } }, { io, user: { id: 'p1' } });
      handler.handleAction(gs, 'player:submitTier', { ratings: { 0: 4, 1: 1 } }, { io, user: { id: 'p2' } });
      handler.handleAction(gs, 'host:revealTier', null, { io });
      expect(gs.state.tierMedians[0]).toBe(3); // (2+4)/2
    });
  });

  describe('режим whosaid (кто это сказал)', () => {
    const q = { points: 300, q: 'Самый неловкий момент', everyoneMode: 'whosaid' };
    beforeEach(() => {
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
      // p2 всем ставит p3 (заведомо часть неверно)
      const bad = {};
      gs.state.whoSaidAnswers.forEach(a => { bad[a.idx] = 'p3'; });
      handler.handleAction(gs, 'player:guessAuthor', { guesses: bad }, { io, user: { id: 'p2' } });
      handler.handleAction(gs, 'host:scoreWhoSaid', null, { io });
      // p2 угадает только настоящий ответ p3 (если он не совпал со своим) — максимум 1
      expect(gs.state.whoSaidResult.scores.p2).toBeLessThanOrEqual(100);
    });
  });

  test('без everyoneMode дефолт — number', () => {
    const q = { points: 100, a: '5' };
    gs.getCurrentQuestion.mockReturnValue(q);
    handler.onSelect(gs, q);
    expect(gs.state.questionStatus).toBe('number_inputting');
  });
});
