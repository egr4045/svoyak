const AuctionHandler = require('../game/questions/AuctionHandler');
const CatHandler = require('../game/questions/CatHandler');
const AmongUsHandler = require('../game/questions/AmongUsHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('Фаза 0: фикс механик', () => {
  let mockIo;
  beforeEach(() => { mockIo = createMockIo(); });

  describe('Аукцион: неверный ответ закрывает вопрос, а не открывает баззер', () => {
    test('onWrong снимает ставку и возвращает в idle', () => {
      const h = new AuctionHandler();
      const gs = createMockGameState({ state: { answeringPlayerId: 'p1', activeBet: 300, questionStatus: 'answering' } });
      gs.getCurrentQuestion.mockReturnValue({ points: 600 });
      h.onWrong(gs, { io: mockIo });
      expect(gs.state.questionStatus).toBe('idle');
      expect(gs.state.showAnswer).toBe(true);
      expect(gs.state.answeringPlayerId).toBeNull();
      expect(gs.adjustScore).toHaveBeenCalledWith('p1', -300); // именно ставка, не номинал
      expect(gs.state.questionStatus).not.toBe('buzzer_countdown');
    });
  });

  describe('Кот: неверный ответ закрывает вопрос, а не открывает баззер', () => {
    test('onWrong снимает номинал и возвращает в idle', () => {
      const h = new CatHandler();
      const gs = createMockGameState({ state: { answeringPlayerId: 'p2', activeBet: null, questionStatus: 'answering' } });
      gs.getCurrentQuestion.mockReturnValue({ points: 500 });
      h.onWrong(gs, { io: mockIo });
      expect(gs.state.questionStatus).toBe('idle');
      expect(gs.state.showAnswer).toBe(true);
      expect(gs.adjustScore).toHaveBeenCalledWith('p2', -500);
      expect(gs.state.questionStatus).not.toBe('buzzer_countdown');
    });
  });

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
