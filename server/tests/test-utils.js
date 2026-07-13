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
      host: { id: 'host', name: 'Host', socketId: 'host-sock', connected: true },
      // Доп-поля новых типов (упрощённый набор для тестов)
      performerId: null,
      performResult: null,
      numberGuesses: {},
      numberReveal: null,
      tierRatings: {},
      tierMedians: null,
      tierResults: null,
      tierSubmitted: [],
      potatoRing: [],
      potatoTurnId: null,
      potatoResult: null,
      reactionGrid: null,
      reactionRule: null,
      reactionWinnerId: null,
      reactionDone: false,
      whoSaidCount: 0,
      whoSaidAnswers: null,
      whoSaidGuesses: {},
      whoSaidResult: null,
      duelState: null,
      aliasState: null,
      aliasResult: null,
      snippetLevel: 0,
      showAnswer: false,
      players: [
        { id: 'p1', name: 'Alice', score: 1000, connected: true, socketId: 'sock-p1' },
        { id: 'p2', name: 'Bob', score: 1000, connected: true, socketId: 'sock-p2' },
        { id: 'p3', name: 'Charlie', score: 1000, connected: true, socketId: 'sock-p3' }
      ],
      spectators: [],
      board: [{ category: 'Category 1', questions: [] }]
    },
    roomCode: 'TEST',
    timers: {},
    sealed: {},
    privateReveal: null,
    _priv: {},
    blankActiveQuestionFields: jest.fn(function (fields) {
      const q = mockGS.getCurrentQuestion();
      if (q) fields.forEach(f => { q[f] = null; });
    }),
    addLog: jest.fn(),
    getCurrentQuestion: jest.fn().mockReturnValue({ points: 500 }),
    adjustScore: jest.fn((pId, pts) => {
      const p = mockGS.state.players.find(p => p.id === pId);
      if (p) p.score += pts;
    }),
    setSelectingPlayer: jest.fn(),
    clearTimers: jest.fn(),
    closeQuestion: jest.fn(),
    findParticipant: jest.fn((id) =>
      mockGS.state.players.find(p => String(p.id) === String(id)) ||
      mockGS.state.spectators.find(s => String(s.id) === String(id)) || null),
    setPrivateReveal: jest.fn((performerId, performerPayload, hostPayload) => {
      mockGS.privateReveal = { performerId, performerPayload, hostPayload: hostPayload || performerPayload };
    })
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
