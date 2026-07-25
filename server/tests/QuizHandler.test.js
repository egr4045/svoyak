const QuizHandler = require('../game/questions/QuizHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

// Покрытие слитых механик бывших text/media/text_input/glitch/snippet/auction/cat:
// поведенческие ассерты прежних отдельных сьютов сохранены, типы заданы модификаторами.
describe('QuizHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new QuizHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('обычный вопрос (баззер)', () => {
    test('onSelect sets status to reading', () => {
      mockGS.state.activeCell = { catIdx: 0, qIdx: 0 };
      handler.onSelect(mockGS, { points: 100 });
      expect(mockGS.state.questionStatus).toBe('reading');
      expect(mockGS.addLog).toHaveBeenCalled();
    });

    test('onCorrect awards points and ends question', () => {
      mockGS.state.answeringPlayerId = 'p1';
      handler.onCorrect(mockGS, { io: mockIo });
      expect(mockGS.state.players[0].score).toBe(1500);
      expect(mockGS.state.questionStatus).toBe('idle');
      expect(mockGS.state.showAnswer).toBe(true);
    });

    test('onWrong deducts points and restarts buzzer', () => {
      mockGS.state.answeringPlayerId = 'p1';
      handler.onWrong(mockGS, { io: mockIo });
      expect(mockGS.state.players[0].score).toBe(500);
      expect(mockGS.state.questionStatus).toBe('buzzer_countdown');
    });
  });

  describe('модификатор media (mediaSrc)', () => {
    test('onSelect открывает баззер сразу', () => {
      handler.onSelect(mockGS, { points: 100, mediaType: 'audio', mediaSrc: '/x.mp3' });
      expect(mockGS.state.questionStatus).toBe('buzzer_active');
      expect(mockGS.state.buzzerReceiving).toBe(true);
    });
  });

  describe('модификатор answerMode: written', () => {
    test('onSelect sets status to text_inputting', () => {
      handler.onSelect(mockGS, { points: 100, answerMode: 'written' });
      expect(mockGS.state.questionStatus).toBe('text_inputting');
    });

    test('handleAction player:submitTextAnswer stores answer', () => {
      handler.handleAction(mockGS, 'player:submitTextAnswer', { text: 'My Answer' }, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.textAnswers['p1']).toBe('My Answer');
      expect(mockIo.emit).toHaveBeenCalledWith('gameStateUpdated', mockGS.state);
    });

    test('handleAction player:submitTextAnswer ignores action from non-existent player', () => {
      handler.handleAction(mockGS, 'player:submitTextAnswer', { text: 'Ghost' }, { io: mockIo, user: { id: 'ghost' } });
      expect(mockGS.state.textAnswers['ghost']).toBeUndefined();
    });

    test('handleAction host:judgeSingleTextAnswer correctly calculates score (correct)', () => {
      mockGS.state.textAnswers['p1'] = 'Correct Answer';
      handler.handleAction(mockGS, 'host:judgeSingleTextAnswer', { playerId: 'p1', isCorrect: true }, { io: mockIo });
      expect(mockGS.state.players[0].score).toBe(1500); // 1000 + 500 (номинал мок-вопроса)
      expect(mockGS.state.textAnswers['p1']).toBeUndefined();
    });

    test('handleAction host:judgeSingleTextAnswer correctly calculates score (wrong)', () => {
      mockGS.state.textAnswers['p1'] = 'Wrong Answer';
      handler.handleAction(mockGS, 'host:judgeSingleTextAnswer', { playerId: 'p1', isCorrect: false }, { io: mockIo });
      expect(mockGS.state.players[0].score).toBe(500); // 1000 - 500
    });

    test('handleAction host:judgeSingleTextAnswer ignores invalid playerId', () => {
      handler.handleAction(mockGS, 'host:judgeSingleTextAnswer', { playerId: 'nonexistent', isCorrect: true }, { io: mockIo });
      expect(mockGS.adjustScore).not.toHaveBeenCalled();
    });
  });

  describe('модификатор glitch', () => {
    test('onSelect activates buzzer and sets glitch seed', () => {
      handler.onSelect(mockGS, { points: 500, glitch: true });
      expect(mockGS.state.questionStatus).toBe('buzzer_active');
      expect(mockGS.state.glitchSeed).toBeDefined();
      expect(mockGS.state.buzzerReceiving).toBe(true);
    });

    test('handleAction player:pauseGlitch transitions to answering', () => {
      mockGS.getCurrentQuestion.mockReturnValue({ points: 500, glitch: true });
      mockGS.state.questionStatus = 'buzzer_active';
      handler.handleAction(mockGS, 'player:pauseGlitch', {}, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.questionStatus).toBe('answering');
      expect(mockGS.state.answeringPlayerId).toBe('p1');
      expect(mockIo.emit).toHaveBeenCalledWith('gameStateUpdated', mockGS.state);
    });

    test('глитч-баззер не срабатывает для вопроса без флага glitch', () => {
      mockGS.getCurrentQuestion.mockReturnValue({ points: 500 });
      mockGS.state.questionStatus = 'buzzer_active';
      handler.handleAction(mockGS, 'player:pressBuzzer', {}, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.questionStatus).toBe('buzzer_active'); // общий баззер ведёт roomHandlers
      expect(mockGS.state.answeringPlayerId).toBeNull();
    });
  });

  describe('модификатор snippet (фрагмент)', () => {
    beforeEach(() => {
      mockGS.getCurrentQuestion.mockReturnValue({ points: 500, snippet: true, mediaSrc: '/x.mp3', mediaType: 'audio', a: 'Queen' });
    });

    test('onSelect: полная цена и нулевой уровень', () => {
      handler.onSelect(mockGS, { points: 500, snippet: true, mediaSrc: '/x.mp3' });
      expect(mockGS.state.questionStatus).toBe('snippet_playing');
      expect(mockGS.state.snippetLevel).toBe(0);
      expect(mockGS.state.activeBet).toBe(500);
    });

    test('revealMore снижает activeBet по шагам', () => {
      handler.onSelect(mockGS, { points: 500, snippet: true, mediaSrc: '/x.mp3' });
      handler.handleAction(mockGS, 'host:revealMore', null, { io: mockIo });
      expect(mockGS.state.snippetLevel).toBe(1);
      expect(mockGS.state.activeBet).toBe(400); // 500 - 1*100
      handler.handleAction(mockGS, 'host:revealMore', null, { io: mockIo });
      expect(mockGS.state.activeBet).toBe(300);
    });

    test('activeBet не падает ниже минимума', () => {
      handler.onSelect(mockGS, { points: 500, snippet: true, mediaSrc: '/x.mp3' });
      for (let i = 0; i < 10; i++) handler.handleAction(mockGS, 'host:revealMore', null, { io: mockIo });
      expect(mockGS.state.activeBet).toBeGreaterThanOrEqual(100); // min = points - 4*step
    });

    test('snippet без mediaSrc играет как обычный вопрос', () => {
      mockGS.state.activeCell = { catIdx: 0, qIdx: 0 };
      handler.onSelect(mockGS, { points: 500, snippet: true });
      expect(mockGS.state.questionStatus).toBe('reading');
    });
  });

  describe('ставка «аукцион»', () => {
    test('onSelect initializes auction bidding correctly', () => {
      handler.onSelect(mockGS, { points: 500, stake: 'auction' });
      expect(mockGS.state.questionStatus).toBe('auction_bidding');
      expect(mockGS.state.activeBet).toBe(100); // 500 / 5
      expect(mockGS.state.auctionBets).toEqual({});
    });

    test('handleAction player:submitAuctionBet allows valid bets', () => {
      handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 200 }, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.auctionBets['p1']).toBe(200);
    });

    test('handleAction player:submitAuctionBet blocks bets over balance', () => {
      handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 2000 }, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.auctionBets['p1']).toBeUndefined();
    });

    test('handleAction player:submitAuctionBet allows bets up to question points if balance is 0 or negative', () => {
      mockGS.state.players[0].score = 0;
      // Номинал мок-вопроса — 500
      handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 500 }, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.auctionBets['p1']).toBe(500);

      mockGS.state.players[0].score = -100;
      handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 501 }, { io: mockIo, user: { id: 'p1' } });
      expect(mockGS.state.auctionBets['p1']).toBe(500);
    });

    test('revealAuctionBets picks single winner with highest bet', () => {
      mockGS.state.questionStatus = 'auction_bidding';
      mockGS.state.auctionBets = { p1: 100, p2: 300, p3: 200 };
      handler.revealAuctionBets(mockGS, mockIo);
      expect(mockGS.state.answeringPlayerId).toBe('p2');
      expect(mockGS.state.activeBet).toBe(300);
      expect(mockGS.state.questionStatus).toBe('answering');
    });

    test('revealAuctionBets handles tie (multiple winners)', () => {
      mockGS.state.questionStatus = 'auction_bidding';
      mockGS.state.auctionBets = { p1: 300, p2: 300, p3: 200 };
      handler.revealAuctionBets(mockGS, mockIo);
      expect(mockGS.state.auctionTiePlayers).toEqual(['p1', 'p2']);
      expect(mockGS.state.activeBet).toBe(300);
      expect(mockGS.state.questionStatus).toBe('text_inputting');
    });

    test('revealAuctionBets skips if no bets were made', () => {
      mockGS.state.questionStatus = 'auction_bidding';
      mockGS.state.auctionBets = {};
      handler.revealAuctionBets(mockGS, mockIo);
      expect(mockGS.state.questionStatus).toBe('auction_bidding');
    });
  });

  describe('ставка «кот в мешке»', () => {
    test('onSelect initializes cat target selection', () => {
      handler.onSelect(mockGS, { points: 500, stake: 'cat' });
      expect(mockGS.state.questionStatus).toBe('cat_target_selection');
    });

    test('startRoulette chooses a player and sets timer', () => {
      handler.startRoulette(mockGS, mockIo);
      expect(mockGS.state.questionStatus).toBe('cat_roulette');
      expect(mockGS.state.catTargetId).toBeDefined();
      expect(mockGS.timers.catRoulette).toBeDefined();

      jest.runAllTimers();
      expect(mockGS.state.questionStatus).toBe('answering');
      expect(mockGS.state.answeringPlayerId).toBe(mockGS.state.catTargetId);
    });
  });

  describe('единственный отвечающий при ставке: неверный ответ закрывает вопрос', () => {
    test('onWrong при stake=auction снимает ставку и возвращает в idle', () => {
      mockGS.getCurrentQuestion.mockReturnValue({ points: 600, stake: 'auction' });
      mockGS.state.answeringPlayerId = 'p1';
      mockGS.state.activeBet = 300;
      mockGS.state.questionStatus = 'answering';
      handler.onWrong(mockGS, { io: mockIo });
      expect(mockGS.state.questionStatus).toBe('idle');
      expect(mockGS.state.showAnswer).toBe(true);
      expect(mockGS.state.answeringPlayerId).toBeNull();
      expect(mockGS.adjustScore).toHaveBeenCalledWith('p1', -300); // именно ставка, не номинал
    });

    test('onWrong при stake=cat снимает номинал и возвращает в idle', () => {
      mockGS.getCurrentQuestion.mockReturnValue({ points: 500, stake: 'cat' });
      mockGS.state.answeringPlayerId = 'p2';
      mockGS.state.activeBet = null;
      mockGS.state.questionStatus = 'answering';
      handler.onWrong(mockGS, { io: mockIo });
      expect(mockGS.state.questionStatus).toBe('idle');
      expect(mockGS.state.showAnswer).toBe(true);
      expect(mockGS.adjustScore).toHaveBeenCalledWith('p2', -500);
      expect(mockGS.state.questionStatus).not.toBe('buzzer_countdown');
    });
  });
});
