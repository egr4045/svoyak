const GameState = require('../game/GameState');

// Слим-бродкаст: обычные обновления идут без roundsData (весь пак), полный стейт —
// только адресно при join и при resetGame (см. roomHandlers).
describe('Слим-бродкаст состояния', () => {
  function makeGame() {
    const game = new GameState('SLIM', { id: 'host', username: 'Host' }, {});
    game.addPlayer({ id: 1, username: 'P1' });
    return game;
  }

  test('slimState не содержит roundsData, но несёт roundsCount', () => {
    const game = makeGame();
    const slim = game.slimState();
    expect(slim.roundsData).toBeUndefined();
    expect(slim.roundsCount).toBe(game.state.roundsData.length);
    expect(slim.players).toHaveLength(1);
    expect(slim.questionStatus).toBe('idle');
  });

  test('fullState содержит и roundsData, и roundsCount', () => {
    const game = makeGame();
    const full = game.fullState();
    expect(Array.isArray(full.roundsData)).toBe(true);
    expect(full.roundsCount).toBe(full.roundsData.length);
  });

  test('broadcast шлёт слим-стейт в комнату', () => {
    const game = makeGame();
    const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    game.broadcast(io);
    expect(io.to).toHaveBeenCalledWith('SLIM');
    const payload = io.emit.mock.calls[0][1];
    expect(io.emit.mock.calls[0][0]).toBe('gameStateUpdated');
    expect(payload.roundsData).toBeUndefined();
    expect(payload.roundsCount).toBeGreaterThan(0);
  });

  test('mediaState хранит якорь синхронизации', () => {
    const game = makeGame();
    expect(game.state.mediaState).toEqual({ status: 'stopped', anchorPosition: 0, anchorAt: 0 });
  });

  test('setPlayerLoaded сохраняет счётчик битых медиа', () => {
    const game = makeGame();
    game.setPlayerLoaded(1, true, 3);
    expect(game.state.players[0].loadedAssets).toBe(true);
    expect(game.state.players[0].failedAssets).toBe(3);
  });
});
