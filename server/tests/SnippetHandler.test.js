const SnippetHandler = require('../game/questions/SnippetHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('SnippetHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    handler = new SnippetHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 500, mediaSrc: '/x.mp3', mediaType: 'audio', a: 'Queen' });
  });

  test('onSelect: полная цена и нулевой уровень', () => {
    handler.onSelect(gs, { points: 500 });
    expect(gs.state.questionStatus).toBe('snippet_playing');
    expect(gs.state.snippetLevel).toBe(0);
    expect(gs.state.activeBet).toBe(500);
  });

  test('revealMore снижает activeBet по шагам', () => {
    handler.onSelect(gs, { points: 500 });
    handler.handleAction(gs, 'host:revealMore', null, { io });
    expect(gs.state.snippetLevel).toBe(1);
    expect(gs.state.activeBet).toBe(400); // 500 - 1*100
    handler.handleAction(gs, 'host:revealMore', null, { io });
    expect(gs.state.activeBet).toBe(300);
  });

  test('activeBet не падает ниже минимума', () => {
    handler.onSelect(gs, { points: 500 });
    for (let i = 0; i < 10; i++) handler.handleAction(gs, 'host:revealMore', null, { io });
    expect(gs.state.activeBet).toBeGreaterThanOrEqual(100); // min = points - 4*step
  });
});
