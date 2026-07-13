const ReactionHandler = require('../game/questions/ReactionHandler');
const { generateGrid, satisfies } = ReactionHandler;
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

describe('ReactionHandler', () => {
  let handler, gs, io;
  beforeEach(() => {
    handler = new ReactionHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 200 });
    handler.onSelect(gs, { points: 200 });
  });

  test('onSelect: сетка, правило, ответ вне broadcast', () => {
    expect(gs.state.questionStatus).toBe('reaction_active');
    expect(gs.state.reactionGrid.length).toBe(9);
    expect(typeof gs.state.reactionRule).toBe('string');
    expect(typeof gs._priv.reactionAnswer).toBe('number');
    // Индекс ответа не в broadcast-стейте
    expect(gs.state.reactionAnswerIdx).toBeUndefined();
  });

  test('верный тап: очки, победитель, подсветка', () => {
    const a = gs._priv.reactionAnswer;
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p1' } });
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 200);
    expect(gs.state.reactionWinnerId).toBe('p1');
    expect(gs.state.reactionDone).toBe(true);
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });

  test('неверный тап: штраф и блок', () => {
    const a = gs._priv.reactionAnswer;
    const wrong = (a + 1) % 9;
    handler.handleAction(gs, 'player:tapTarget', { idx: wrong }, { io, user: { id: 'p2' } });
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', -100); // round(200/2)
    expect(gs.state.reactionWinnerId).toBeNull();
    expect(gs.sealed.p2).toBe(true); // заблокирован
    // Повторный тап того же игрока (даже верный) — игнор
    gs.adjustScore.mockClear();
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p2' } });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('после done тап игнорируется', () => {
    const a = gs._priv.reactionAnswer;
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p1' } });
    gs.adjustScore.mockClear();
    handler.handleAction(gs, 'player:tapTarget', { idx: a }, { io, user: { id: 'p3' } });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });

  test('endReaction раскрывает верную ячейку', () => {
    const a = gs._priv.reactionAnswer;
    handler.handleAction(gs, 'host:endReaction', null, { io });
    expect(gs.state.reactionDone).toBe(true);
    expect(gs.state.reactionGrid[a].correct).toBe(true);
  });
});
