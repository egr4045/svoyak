const StandardHandler = require('../game/questions/StandardHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('StandardHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new StandardHandler('text');
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('onSelect sets status to reading for text type', () => {
    mockGS.state.activeCell = { catIdx: 0, qIdx: 0 };
    handler.onSelect(mockGS, { points: 100 });
    expect(mockGS.state.questionStatus).toBe('reading');
    expect(mockGS.addLog).toHaveBeenCalled();
  });

  test('onSelect sets status to text_inputting for text_input type', () => {
    handler = new StandardHandler('text_input');
    handler.onSelect(mockGS, { points: 100 });
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
    expect(mockGS.state.players[0].score).toBe(1500); // 1000 + 500 (from default mock GS q)
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
