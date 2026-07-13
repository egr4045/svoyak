const CharadesHandler = require('../game/questions/CharadesHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('CharadesHandler', () => {
  let handler, gs, io;

  beforeEach(() => {
    handler = new CharadesHandler();
    gs = createMockGameState();
    io = createMockIo();
    gs.getCurrentQuestion.mockReturnValue({ points: 400, q: 'Покажи', a: 'Слон' });
  });

  test('onSelect ставит выбор исполнителя', () => {
    handler.onSelect(gs, { points: 400, a: 'Слон' });
    expect(gs.state.questionStatus).toBe('performer_select');
    expect(gs.state.performerId).toBeNull();
  });

  test('host:setPerformer(id) переводит в показ и шлёт приватный секрет исполнителю+ведущему', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', 'p2', { io });
    expect(gs.state.questionStatus).toBe('performing');
    expect(gs.state.performerId).toBe('p2');
    expect(gs.setPrivateReveal).toHaveBeenCalled();
    // Секрет не оказался в broadcast-стейте
    expect(JSON.stringify(gs.state)).not.toContain('Слон');
    expect(gs.privateReveal.performerPayload.text).toBe('Слон');
  });

  test('host:setPerformer(null) выбирает случайного из мест', () => {
    gs.state.questionStatus = 'performer_select';
    handler.handleAction(gs, 'host:setPerformer', null, { io });
    expect(gs.state.questionStatus).toBe('performing');
    expect(['p1', 'p2', 'p3']).toContain(gs.state.performerId);
  });

  test('host:awardGuess начисляет угадавшему полные очки, исполнителю половину', () => {
    gs.state.questionStatus = 'performing';
    gs.state.performerId = 'p2';
    gs.privateReveal = { performerId: 'p2', performerPayload: { text: 'Слон' }, hostPayload: { text: 'Слон' } };
    handler.handleAction(gs, 'host:awardGuess', 'p1', { io });
    expect(gs.adjustScore).toHaveBeenCalledWith('p1', 400);
    expect(gs.adjustScore).toHaveBeenCalledWith('p2', 200);
    expect(gs.state.questionStatus).toBe('idle');
    expect(gs.state.performResult.guesserId).toBe('p1');
    expect(gs.state.performResult.answer).toBe('Слон'); // слово раскрыто в итоге
  });

  test('host:awardGuess по наблюдателю/несуществующему — игнор', () => {
    gs.state.questionStatus = 'performing';
    gs.state.performerId = 'p2';
    handler.handleAction(gs, 'host:awardGuess', 'ghost', { io });
    expect(gs.adjustScore).not.toHaveBeenCalled();
    expect(gs.state.questionStatus).toBe('performing');
  });

  test('host:passQuestion закрывает без начисления', () => {
    gs.state.questionStatus = 'performing';
    gs.state.performerId = 'p2';
    handler.handleAction(gs, 'host:passQuestion', null, { io });
    expect(gs.adjustScore).not.toHaveBeenCalled();
    expect(gs.state.performResult.pass).toBe(true);
    expect(gs.state.questionStatus).toBe('idle');
  });

  test('действия вне нужного статуса игнорируются', () => {
    gs.state.questionStatus = 'idle';
    handler.handleAction(gs, 'host:awardGuess', 'p1', { io });
    expect(gs.adjustScore).not.toHaveBeenCalled();
  });
});
