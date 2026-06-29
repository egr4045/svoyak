const GlitchHandler = require('../game/questions/GlitchHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('GlitchHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    handler = new GlitchHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  test('onSelect activates buzzer and sets glitch seed', () => {
    handler.onSelect(mockGS, { points: 500 });
    expect(mockGS.state.questionStatus).toBe('buzzer_active');
    expect(mockGS.state.glitchSeed).toBeDefined();
    expect(mockGS.state.buzzerReceiving).toBe(true);
  });

  test('handleAction player:pauseGlitch transitions to answering', () => {
    mockGS.state.questionStatus = 'buzzer_active';
    handler.handleAction(mockGS, 'player:pauseGlitch', {}, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.questionStatus).toBe('answering');
    expect(mockGS.state.answeringPlayerId).toBe('p1');
    expect(mockIo.emit).toHaveBeenCalledWith('gameStateUpdated', mockGS.state);
  });
});
