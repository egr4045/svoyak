const AuctionHandler = require('../game/questions/AuctionHandler');
const { createMockGameState, createMockIo } = require('./test-utils');

describe('AuctionHandler', () => {
  let handler;
  let mockGS;
  let mockIo;

  beforeEach(() => {
    handler = new AuctionHandler();
    mockGS = createMockGameState();
    mockIo = createMockIo();
  });

  test('onSelect initializes auction bidding correctly', () => {
    handler.onSelect(mockGS, { points: 500 });
    expect(mockGS.state.questionStatus).toBe('auction_bidding');
    expect(mockGS.state.activeBet).toBe(100); // 500 / 5
    expect(mockGS.state.auctionBets).toEqual({});
  });

  test('handleAction player:submitAuctionBet allows valid bets', () => {
    handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 200 }, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.auctionBets['p1']).toBe(200);
  });

  test('handleAction player:submitAuctionBet blocks bets over balance', () => {
    handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 2000 }, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.auctionBets['p1']).toBeUndefined();
  });

  test('handleAction player:submitAuctionBet allows bets up to question points if balance is 0 or negative', () => {
    mockGS.state.players[0].score = 0;
    // Current question points is 500
    handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 500 }, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.auctionBets['p1']).toBe(500);

    mockGS.state.players[0].score = -100;
    handler.handleAction(mockGS, 'player:submitAuctionBet', { betAmount: 501 }, { io: mockIo, user: { id: 'p1' } });
    expect(mockGS.state.auctionBets['p1']).toBe(500); // Should still be 500 from previous or undefined if reset
  });

  test('revealAuctionBets picks single winner with highest bet', () => {
    mockGS.state.questionStatus = 'auction_bidding';
    mockGS.state.auctionBets = { p1: 100, p2: 300, p3: 200 };
    handler.revealAuctionBets(mockGS, mockIo);
    expect(mockGS.state.answeringPlayerId).toBe('p2');
    expect(mockGS.state.activeBet).toBe(300);
    expect(mockGS.state.questionStatus).toBe('answering');
  });

  test('revealAuctionBets handles tie (multiple winners)', () => {
    mockGS.state.questionStatus = 'auction_bidding';
    mockGS.state.auctionBets = { p1: 300, p2: 300, p3: 200 };
    handler.revealAuctionBets(mockGS, mockIo);
    expect(mockGS.state.auctionTiePlayers).toEqual(['p1', 'p2']);
    expect(mockGS.state.activeBet).toBe(300);
    expect(mockGS.state.questionStatus).toBe('text_inputting');
  });

  test('revealAuctionBets skips if no bets were made', () => {
    mockGS.state.questionStatus = 'auction_bidding';
    mockGS.state.auctionBets = {};
    handler.revealAuctionBets(mockGS, mockIo);
    expect(mockGS.state.questionStatus).toBe('auction_bidding'); // Stays the same
  });
});
