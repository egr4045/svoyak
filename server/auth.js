const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db/database');

const router = express.Router();
router.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'svoyak_super_secret_key_123';
const PLATFORM_AUTH_URL = process.env.PLATFORM_AUTH_URL || 'http://localhost:8081';

// Регистрация
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      
      const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({ token, user: { id: this.lastID, username, avatar: null } });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Авторизация
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username, platformId: user.platform_id || null }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, platformId: user.platform_id || null } });
  });
});

// SSO-мост платформы MyGame Hub: гасим handoff-токен (?pt=) в auth-сервисе платформы,
// апсертим локального юзера по platform_id и выдаём свой JWT + платформенную сессию для SDK.
router.post('/platform-bridge', async (req, res) => {
  const handoffToken = req.body && req.body.pt;
  if (!handoffToken) return res.status(401).json({ error: 'missing token' });

  let exchange;
  try {
    const r = await fetch(`${PLATFORM_AUTH_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoffToken }),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return res.status(403).json({ error: 'invalid platform token' });
    exchange = await r.json(); // { accountId, displayName, accessToken, refreshToken }
  } catch {
    return res.status(502).json({ error: 'platform auth unreachable' });
  }

  const { accountId, displayName } = exchange;
  if (!accountId || !displayName) return res.status(403).json({ error: 'invalid platform token' });

  const finish = (u) => {
    const token = jwt.sign({ id: u.id, username: u.username, platformId: accountId }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: { id: u.id, username: u.username, avatar: u.avatar || null, platformId: accountId },
      platformSession: exchange
    });
  };

  db.get('SELECT * FROM users WHERE platform_id = ?', [accountId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (user) return finish(user);

    const insert = (username, retryLeft) => {
      // Федеративные юзеры без локального пароля
      db.run('INSERT INTO users (username, platform_id, password_hash) VALUES (?, ?, ?)',
        [username, accountId, ''],
        function (insErr) {
          if (!insErr) return finish({ id: this.lastID, username, avatar: null });
          if (insErr.message.includes('UNIQUE constraint failed')) {
            // Либо проигранная гонка двух параллельных мостов (уникальный индекс
            // по platform_id) — перечитываем; либо ник занят — суффикс от platform_id
            return db.get('SELECT * FROM users WHERE platform_id = ?', [accountId], (raceErr, existing) => {
              if (existing) return finish(existing);
              if (retryLeft > 0 && insErr.message.includes('users.username')) {
                return insert(`${displayName}#${String(accountId).slice(0, 6)}`, retryLeft - 1);
              }
              res.status(500).json({ error: 'Database error' });
            });
          }
          res.status(500).json({ error: 'Database error' });
        });
    };
    insert(displayName, 1);
  });
});

// Гостевой вход удалён: вход в игру только через платформу MyGame Hub
// (см. POST /platform-bridge выше). register/login оставлены дремлющими,
// но без platformId к игре они не допускаются (гейт в index.js).

// Middleware для HTTP
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

router.get('/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, avatar, platform_id FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, platformId: user.platform_id || null } });
  });
});

module.exports = { authRouter: router, authenticateToken, JWT_SECRET };
