const SketchHandler = require('../game/questions/SketchHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('SketchHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    jest.useFakeTimers();
    handler = new SketchHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('onSelect initializes sketch state', () => {
    handler.onSelect(mockGS, { points: 500 });
    expect(mockGS.state.questionStatus).toBe('sketch_drawing');
    expect(mockGS.state.sketchAnswers).toEqual({});
  });

  test('handleAction player:submitSketch saves data', () => {
    handler.handleAction(mockGS, 'player:submitSketch', { dataUrl: 'base64...' }, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.sketchAnswers['p1']).toBe('base64...');
  });

  test('handleAction host:revealSketches sets timeout', () => {
    handler.handleAction(mockGS, 'host:revealSketches', {}, { io: mockIo });
    expect(mockIo.emit).toHaveBeenCalledWith('sketch:forceSubmit');
    
    jest.runAllTimers();
    expect(mockGS.state.questionStatus).toBe('sketch_judging');
  });

  test('handleAction player:voteSketch saves vote', () => {
    handler.handleAction(mockGS, 'player:voteSketch', 'p1', { io: mockIo, user: { id: 'p2' } });
    expect(mockGS.state.sketchVotes['p2']).toBe('p1');
  });

  test('handleAction host:awardSketchWinner awards points and closes', () => {
    handler.handleAction(mockGS, 'host:awardSketchWinner', 'p1', { io: mockIo });
    expect(mockGS.adjustScore).toHaveBeenCalledWith('p1', 500);
    expect(mockGS.closeQuestion).toHaveBeenCalled();
  });
});
