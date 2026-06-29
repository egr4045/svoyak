/**
 * Вспомогательные функции для тестирования серверной логики Svoyak.
 */

function createMockGameState(overrides = {}) {
  const mockGS = {
    state: {
      questionStatus: 'idle',
      buzzerReceiving: false,
      buzzerResults: [],
      textAnswers: {},
      auctionBets: {},
      auctionTiePlayers: [],
      amongUsVotes: {},
      amongUsResult: null,
      amongUsTimerState: null,
      imposterId: null,
      pokerActivePlayers: [],
      pokerBets: {},
      pokerCurrentBet: 0,
      pokerTurnIdx: 0,
      pokerPlayersActed: [],
      glitchSeed: null,
      catTargetId: null,
      sketchAnswers: {},
      sketchVotes: {},
      activeBet: null,
      answeringPlayerId: null,
      failedPlayers: [],
      players: [
        { id: 'p1', name: 'Alice', score: 1000, connected: true },
        { id: 'p2', name: 'Bob', score: 1000, connected: true },
        { id: 'p3', name: 'Charlie', score: 1000, connected: true }
      ],
      board: [{ category: 'Category 1', questions: [] }]
    },
    roomCode: 'TEST',
    timers: {},
    addLog: jest.fn(),
    getCurrentQuestion: jest.fn().mockReturnValue({ points: 500 }),
    adjustScore: jest.fn((pId, pts) => {
      const p = mockGS.state.players.find(p => p.id === pId);
      if (p) p.score += pts;
    }),
    setSelectingPlayer: jest.fn(),
    clearTimers: jest.fn(),
    closeQuestion: jest.fn()
  };

  // Применяем перегрузки
  if (overrides.state) {
    Object.assign(mockGS.state, overrides.state);
    delete overrides.state;
  }
  Object.assign(mockGS, overrides);

  return mockGS;
}

function createMockIo() {
  const io = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  };
  return io;
}

module.exports = {
  createMockGameState,
  createMockIo
};
