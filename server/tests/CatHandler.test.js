const CatHandler = require('../game/questions/CatHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('CatHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new CatHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('onSelect initializes cat target selection', () => {
    handler.onSelect(mockGS, { points: 500 });
    expect(mockGS.state.questionStatus).toBe('cat_target_selection');
  });

  test('startRoulette chooses a player and sets timer', () => {
    handler.startRoulette(mockGS, mockIo);
    expect(mockGS.state.questionStatus).toBe('cat_roulette');
    expect(mockGS.state.catTargetId).toBeDefined();
    expect(mockGS.timers.catRoulette).toBeDefined();
    
    // Advance time
    jest.runAllTimers();
    expect(mockGS.state.questionStatus).toBe('answering');
    expect(mockGS.state.answeringPlayerId).toBe(mockGS.state.catTargetId);
  });
});
