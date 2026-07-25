const AmongUsHandler = require('../game/questions/AmongUsHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

// Регрессии «Фазы 0». Фиксы аукциона/кота (неверный ответ закрывает вопрос, а не
// открывает баззер) переехали в QuizHandler.test.js — ставки теперь модификаторы quiz.
describe('Фаза 0: фикс механик', () => {
  let mockIo;
  beforeEach(() => { mockIo = createMockIo(); });

  describe('Амогус: таймер авто-вскрывается по истечении времени', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('startAmongUsTimer ставит авто-reveal, срабатывающий через 120с', () => {
      const h = new AmongUsHandler();
      const gs = createMockGameState({ state: { imposterId: 'p1', questionStatus: 'text_judging' } });
      gs.getCurrentQuestion.mockReturnValue({ points: 300 });
      h.handleAction(gs, 'host:startAmongUsTimer', null, { io: mockIo });
      expect(gs.state.questionStatus).toBe('among_us_voting');
      expect(gs.timers.amongUsAuto).toBeDefined();
      expect(gs.state.amongUsResult).toBeNull();
      jest.advanceTimersByTime(120000);
      expect(gs.state.amongUsResult).not.toBeNull(); // голосование разрешилось само
    });

    test('pause снимает авто-reveal, resume ставит заново', () => {
      const h = new AmongUsHandler();
      const gs = createMockGameState({ state: { imposterId: 'p1', questionStatus: 'text_judging' } });
      gs.getCurrentQuestion.mockReturnValue({ points: 300 });
      h.handleAction(gs, 'host:startAmongUsTimer', null, { io: mockIo });
      h.handleAction(gs, 'host:pauseAmongUsTimer', { timeLeft: 60 }, { io: mockIo });
      expect(gs.timers.amongUsAuto).toBeUndefined();
      h.handleAction(gs, 'host:resumeAmongUsTimer', { timeLeft: 60 }, { io: mockIo });
      expect(gs.timers.amongUsAuto).toBeDefined();
      jest.advanceTimersByTime(60000);
      expect(gs.state.amongUsResult).not.toBeNull();
    });
  });
});
