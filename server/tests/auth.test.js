const { authRouter, authenticateToken } = require('../auth');
const db = require('../db/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock database
jest.mock('../db/database', () => ({
  run: jest.fn(),
  get: jest.fn()
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_pw'),
  compare: jest.fn()
}));

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn()
}));

describe('Auth Logic', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('POST /register', () => {
    const registerHandler = authRouter.stack.find(s => s.route?.path === '/register').route.stack[0].handle;

    test('should register a new user successfully', async () => {
      req.body = { username: 'testuser', password: 'password123' };
      db.run.mockImplementation((query, params, cb) => {
        cb.call({ lastID: 1 }, null);
      });

      await registerHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mock_token',
        user: expect.objectContaining({ username: 'testuser' })
      }));
    });

    test('should return 400 if fields are missing', async () => {
      req.body = { username: 'testuser' };
      await registerHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 409 if username exists', async () => {
      req.body = { username: 'testuser', password: 'password123' };
      db.run.mockImplementation((query, params, cb) => {
        cb(new Error('UNIQUE constraint failed'));
      });

      await registerHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('POST /login', () => {
    const loginHandler = authRouter.stack.find(s => s.route?.path === '/login').route.stack[0].handle;

    test('should login successfully', async () => {
      req.body = { username: 'testuser', password: 'password123' };
      db.get.mockImplementation((query, params, cb) => {
        cb(null, { id: 1, username: 'testuser', password_hash: 'hashed_pw' });
      });
      bcrypt.compare.mockResolvedValue(true);

      await loginHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock_token' }));
    });

    test('should return 401 for invalid password', async () => {
      req.body = { username: 'testuser', password: 'wrong' };
      db.get.mockImplementation((query, params, cb) => {
        cb(null, { id: 1, username: 'testuser', password_hash: 'hashed_pw' });
      });
      bcrypt.compare.mockResolvedValue(false);

      await loginHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('POST /guest-login', () => {
    const guestHandler = authRouter.stack.find(s => s.route?.path === '/guest-login').route.stack[0].handle;

    test('should create a guest session', () => {
      req.body = { username: 'Guesty' };
      guestHandler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        user: expect.objectContaining({ username: 'Guesty', isGuest: true })
      }));
    });
  });
});
