const GameState = require('../game/GameState');
const QuizHandler = require('../game/questions/QuizHandler');
const AmongUsHandler = require('../game/questions/AmongUsHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

// Регрессия: реальные id игроков — ЧИСЛА из БД, но ключи объектов (textAnswers/sealed/
// auctionBets/votes) — всегда СТРОКИ. Строгий === молча ронял начисления во всех
// «сдаточных» механиках. Тесты фиксируют String-нормализацию.
describe('Числовые id игроков против строковых ключей объектов', () => {
  let io;
  beforeEach(() => { io = createMockIo(); });

  function numericPlayers() {
    return [
      { id: 23, name: 'Числовой', score: 1000, connected: true, socketId: 's23' },
      { id: 42, name: 'Второй', score: 1000, connected: true, socketId: 's42' }
    ];
  }

  test('GameState.adjustScore принимает строковый id числового игрока', () => {
    const game = new GameState('IDT', { id: 'host', username: 'Host' }, {});
    game.addPlayer({ id: 23, username: 'Числовой' });
    game.adjustScore('23', 300); // ключ объекта — строка
    expect(game.state.players[0].score).toBe(300);
  });

  test('GameState.findParticipant находит числового игрока по строковому id', () => {
    const game = new GameState('IDT', { id: 'host', username: 'Host' }, {});
    game.addPlayer({ id: 23, username: 'Числовой' });
    expect(game.findParticipant('23')).toBeTruthy();
  });

  test('GameState.setSelectingPlayer канонизирует строковый id в настоящий', () => {
    const game = new GameState('IDT', { id: 'host', username: 'Host' }, {});
    game.addPlayer({ id: 23, username: 'Числовой' });
    game.setSelectingPlayer('23');
    expect(game.state.selectingPlayerId).toBe(23); // число, как в объекте игрока
  });

  test('QuizHandler judgeSingleTextAnswer начисляет при строковом playerId', () => {
    const h = new QuizHandler();
    const gs = createMockGameState({ state: { players: numericPlayers() } });
    gs.adjustScore = jest.fn((pId, pts) => {
      const p = gs.state.players.find(x => String(x.id) === String(pId));
      if (p) p.score += pts;
    });
    gs.state.textAnswers['23'] = 'Ответ';
    h.handleAction(gs, 'host:judgeSingleTextAnswer', { playerId: '23', isCorrect: true }, { io });
    expect(gs.state.players[0].score).toBe(1500); // 1000 + 500 (номинал мока)
    expect(gs.state.textAnswers['23']).toBeUndefined();
  });

  test('QuizHandler revealAuctionBets канонизирует id победителя из строкового ключа', () => {
    const h = new QuizHandler();
    const gs = createMockGameState({ state: { players: numericPlayers(), questionStatus: 'auction_bidding' } });
    gs.state.auctionBets = { '23': 400, '42': 200 }; // ключи-строки, как в реальности
    h.revealAuctionBets(gs, io);
    expect(gs.state.answeringPlayerId).toBe(23); // настоящий числовой id
    expect(gs.state.questionStatus).toBe('answering');
  });

  test('QuizHandler revealAuctionBets: ничья канонизирует список отвечающих', () => {
    const h = new QuizHandler();
    const gs = createMockGameState({ state: { players: numericPlayers(), questionStatus: 'auction_bidding' } });
    gs.state.auctionBets = { '23': 300, '42': 300 };
    h.revealAuctionBets(gs, io);
    expect(gs.state.auctionTiePlayers).toEqual([23, 42]);
  });

  test('AmongUs: шпион-голосовавший не штрафуется как мирный при своей победе', () => {
    const h = new AmongUsHandler();
    const gs = createMockGameState({ state: { players: numericPlayers(), imposterId: 23, questionStatus: 'among_us_voting' } });
    gs.getCurrentQuestion.mockReturnValue({ points: 100 });
    gs.adjustScore = jest.fn((pId, pts) => {
      const p = gs.state.players.find(x => String(x.id) === String(pId));
      if (p) p.score += pts;
    });
    // Голоса: ключи-строки. Никто не угадал шпиона → imposter_win.
    gs.state.amongUsVotes = { '23': 42, '42': 42 };
    gs.state.textAnswers = { '23': 'a', '42': 'b' };
    h.revealAmongUs(gs, io);
    expect(gs.state.amongUsResult).toBe('imposter_win');
    // Шпион: +200 (и НЕ -100 как «мирный голосовавший»); мирный: -100
    expect(gs.state.players[0].score).toBe(1200);
    expect(gs.state.players[1].score).toBe(900);
  });
});
