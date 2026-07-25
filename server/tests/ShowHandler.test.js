const ShowHandler = require('../game/questions/ShowHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

// Покрытие слитых механик бывших charades/karaoke/alias: поведенческие ассерты прежних
// сьютов сохранены, режим задаётся полем showMode вопроса.
describe('ShowHandler', () => {
  let handler, gs, io;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new ShowHandler();
    gs = createMockGameState();
    io = createMockIo();
  });
  afterEach(() => jest.useRealTimers());

  describe('режим charades (крокодил)', () => {
    beforeEach(() => {
      gs.getCurrentQuestion.mockReturnValue({ points: 400, q: 'Покажи', a: 'Слон', showMode: 'charades' });
    });

    test('onSelect ставит выбор исполнителя', () => {
      handler.onSelect(gs, { points: 400, a: 'Слон', showMode: 'charades' });
      expect(gs.state.questionStatus).toBe('performer_select');
      expect(gs.state.performerId).toBeNull();
    });

    test('host:setPerformer(id) переводит в показ и шлёт приватный секрет исполнителю+ведущему', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p2', { io });
      expect(gs.state.questionStatus).toBe('performing');
      expect(gs.state.performerId).toBe('p2');
      expect(gs.setPrivateReveal).toHaveBeenCalled();
      // Секрет не оказался в broadcast-стейте
      expect(JSON.stringify(gs.state)).not.toContain('Слон');
      expect(gs.privateReveal.performerPayload.text).toBe('Слон');
    });

    test('host:setPerformer(null) выбирает случайного из мест', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', null, { io });
      expect(gs.state.questionStatus).toBe('performing');
      expect(['p1', 'p2', 'p3']).toContain(gs.state.performerId);
    });

    test('host:awardGuess начисляет угадавшему полные очки, исполнителю половину', () => {
      gs.state.questionStatus = 'performing';
      gs.state.performerId = 'p2';
      gs.privateReveal = { performerId: 'p2', performerPayload: { text: 'Слон' }, hostPayload: { text: 'Слон' } };
      handler.handleAction(gs, 'host:awardGuess', 'p1', { io });
      expect(gs.adjustScore).toHaveBeenCalledWith('p1', 400);
      expect(gs.adjustScore).toHaveBeenCalledWith('p2', 200);
      expect(gs.state.questionStatus).toBe('idle');
      expect(gs.state.performResult.guesserId).toBe('p1');
      expect(gs.state.performResult.answer).toBe('Слон'); // слово раскрыто в итоге
    });

    test('host:awardGuess по наблюдателю/несуществующему — игнор', () => {
      gs.state.questionStatus = 'performing';
      gs.state.performerId = 'p2';
      handler.handleAction(gs, 'host:awardGuess', 'ghost', { io });
      expect(gs.adjustScore).not.toHaveBeenCalled();
      expect(gs.state.questionStatus).toBe('performing');
    });

    test('host:passQuestion закрывает без начисления', () => {
      gs.state.questionStatus = 'performing';
      gs.state.performerId = 'p2';
      handler.handleAction(gs, 'host:passQuestion', null, { io });
      expect(gs.adjustScore).not.toHaveBeenCalled();
      expect(gs.state.performResult.pass).toBe(true);
      expect(gs.state.questionStatus).toBe('idle');
    });

    test('действия вне нужного статуса игнорируются', () => {
      gs.state.questionStatus = 'idle';
      handler.handleAction(gs, 'host:awardGuess', 'p1', { io });
      expect(gs.adjustScore).not.toHaveBeenCalled();
    });
  });

  describe('режим karaoke', () => {
    beforeEach(() => {
      gs.getCurrentQuestion.mockReturnValue({
        points: 400, q: '', a: 'Кино — Звезда', showMode: 'karaoke',
        mediaSrc: '/packs-media/x/ref.mp3', mediaType: 'audio'
      });
    });

    test('приватный показ несёт реф-аудио, из broadcast спрятаны и название, и медиа', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      expect(gs.privateReveal.performerPayload.kind).toBe('karaoke');
      expect(gs.privateReveal.performerPayload.mediaSrc).toBe('/packs-media/x/ref.mp3');
      // secretFields затёрли a + mediaSrc + mediaType в активном вопросе
      const q = gs.getCurrentQuestion();
      expect(q.a).toBeNull();
      expect(q.mediaSrc).toBeNull();
      expect(q.mediaType).toBeNull();
    });
  });

  describe('режим alias', () => {
    beforeEach(() => {
      gs.getCurrentQuestion.mockReturnValue({ points: 300, words: ['кот', 'дом', 'мяч'], timerSec: 60, showMode: 'alias' });
    });

    test('onSelect ставит выбор объясняющего', () => {
      handler.onSelect(gs, { showMode: 'alias' });
      expect(gs.state.questionStatus).toBe('performer_select');
    });

    test('setPerformer стартует раунд, приватит первое слово, армит таймер', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      expect(gs.state.questionStatus).toBe('alias_playing');
      expect(gs.state.aliasState.total).toBe(3);
      expect(gs.state.aliasState.wordPoints).toBe(100); // round(300/3)
      expect(gs.privateReveal.performerPayload.text).toBe('кот');
      // Слово не утекло в broadcast
      expect(JSON.stringify(gs.state)).not.toContain('кот');
      expect(gs.timers.aliasTimer).toBeDefined();
    });

    test('aliasGuessed начисляет обоим и переходит к следующему слову', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io }); // p1 объясняет
      handler.handleAction(gs, 'host:aliasGuessed', 'p2', { io }); // p2 угадал 1-е
      expect(gs.adjustScore).toHaveBeenCalledWith('p2', 100);
      expect(gs.adjustScore).toHaveBeenCalledWith('p1', 100);
      expect(gs.state.aliasState.guessedCount).toBe(1);
      expect(gs.state.aliasState.index).toBe(1);
      expect(gs.privateReveal.performerPayload.text).toBe('дом');
    });

    test('aliasSkip двигает слово без начисления', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      gs.adjustScore.mockClear();
      handler.handleAction(gs, 'host:aliasSkip', null, { io });
      expect(gs.adjustScore).not.toHaveBeenCalled();
      expect(gs.state.aliasState.index).toBe(1);
    });

    test('после последнего слова — финиш с итогом', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      handler.handleAction(gs, 'host:aliasGuessed', 'p2', { io }); // 1
      handler.handleAction(gs, 'host:aliasSkip', null, { io });    // 2
      handler.handleAction(gs, 'host:aliasSkip', null, { io });    // 3 → finish
      expect(gs.state.questionStatus).toBe('idle');
      expect(gs.state.aliasResult).toEqual({ guessed: 1, total: 3 });
      expect(gs.timers.aliasTimer).toBeUndefined();
    });

    test('таймер сам завершает раунд', () => {
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      jest.advanceTimersByTime(60_000);
      expect(gs.state.questionStatus).toBe('idle');
      expect(gs.state.aliasResult.total).toBe(3);
    });

    test('без слов setPerformer не стартует', () => {
      gs.getCurrentQuestion.mockReturnValue({ points: 300, words: [], showMode: 'alias' });
      gs.state.questionStatus = 'performer_select';
      handler.handleAction(gs, 'host:setPerformer', 'p1', { io });
      expect(gs.state.questionStatus).toBe('performer_select');
    });
  });
});
