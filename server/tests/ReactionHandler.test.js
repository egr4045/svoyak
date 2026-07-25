const ReactionHandler = require('../game/questions/ReactionHandler');
const { generateGrid, satisfies, REVEAL_DELAY_MS, ROUND_MS } = ReactionHandler;
const { createMockGameState, createMockIo } = require('./test-utils');

describe('ReactionHandler.generateGrid', () => {
  test('на 1000 генераций правило имеет РОВНО один верный ответ, и это answer', () => {
    for (let i = 0; i < 1000; i++) {
      const g = generateGrid();
      const matches = g.cells.filter(c => satisfies(c, g.cons));
      expect(matches.length).toBe(1);
      expect(satisfies(g.cells[g.answer], g.cons)).toBe(true);
    }
  });
});

describe('ReactionHandler (двухфазный: правило → сетка → дедлайн)', () => {
  let handler, gs, io;
  beforeEach(() => {
    jest.useFakeTimers();
    handler = new ReactionHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 200 });
    handler.onSelect(gs, { points: 200 });
    handler.afterSelect(gs, { io });
  });
  afterEach(() => jest.useRealTimers());

  function reveal() { jest.advanceTimersByTime(REVEAL_DELAY_MS + 10); }

  test('onSelect: правило есть, сетка СКРЫТА, ответ вне broadcast', () => {
    expect(gs.state.questionStatus).toBe('reaction_active');
    expect(gs.state.reactionGrid).toBeNull();
    expect(typeof gs.state.reactionRule).toBe('string');
    expect(typeof gs._priv.reactionAnswer).toBe('number');
  });

  test('тап до появления сетки игнорируется', () => {
    handler.handleAction(gs, 'player:tapTarget', { idx: 0 }, { io, user: { id: 'p1' } });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('после задержки сетка публикуется с дедлайном', () => {
    reveal();
    expect(gs.state.reactionGrid.length).toBe(9);
    expect(gs.state.reactionEndsAt).toBeGreaterThan(Date.now());
  });

  test('верный тап: очки, победитель, подсветка', () => {
    reveal();
    const a = gs._priv.reactionAnswer;
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p1' } });
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 200);
    expect(gs.state.reactionWinnerId).toBe('p1');
    expect(gs.state.reactionDone).toBe(true);
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });

  test('неверный тап: штраф, блок, публичная метка промаха', () => {
    reveal();
    const a = gs._priv.reactionAnswer;
    const wrong = (a + 1) % 9;
    handler.handleAction(gs, 'player:tapTarget', { idx: wrong }, { io, user: { id: 'p2' } });
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', -100); // round(200/2)
    expect(gs.state.reactionWinnerId).toBeNull();
    expect(gs.sealed.p2).toBe(true);                 // заблокирован
    expect(gs.state.reactionMisses.p2).toBe(wrong);  // промах публичен
    // Повторный тап того же игрока (даже верный) — игнор
    gs.adjustScore.mockClear();
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p2' } });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('промахнулись все → авто-финиш с подсветкой ответа', () => {
    reveal();
    const a = gs._priv.reactionAnswer;
    const wrong = (a + 1) % 9;
    for (const id of ['p1', 'p2', 'p3']) {
      handler.handleAction(gs, 'player:tapTarget', { idx: wrong }, { io, user: { id } });
    }
    expect(gs.state.reactionDone).toBe(true);
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });

  test('дедлайн: авто-финиш по таймеру, никто не выиграл', () => {
    reveal();
    jest.advanceTimersByTime(ROUND_MS + 10);
    expect(gs.state.reactionDone).toBe(true);
    expect(gs.state.reactionWinnerId).toBeNull();
    const a = gs._priv.reactionAnswer;
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });

  test('после done тап игнорируется', () => {
    reveal();
    const a = gs._priv.reactionAnswer;
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p1' } });
    gs.adjustScore.mockClear();
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p3' } });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('endReaction раскрывает верную ячейку (даже до появления сетки)', () => {
    handler.handleAction(gs, 'host:endReaction', null, { io });
    expect(gs.state.reactionDone).toBe(true);
    const a = gs._priv.reactionAnswer;
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });
});
