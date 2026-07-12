const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { authRouter, JWT_SECRET, authenticateToken } = require('./auth');
const roomManager = require('./managers/RoomManager');
const handleRoomEvents = require('./handlers/roomHandlers');
const { packsRouter, loadPackForRoom, MEDIA_ROOT } = require('./routes/packs');

const path = require('path');
const app = express();
app.use(cors());
// 25 МБ: глобальный парсер срабатывает раньше пер-роутерных, а импорт паков и
// загрузка медиа (base64) не влезают в дефолтные 100kb
app.use(express.json({ limit: '25mb' }));

// Статика для медиа-файлов вопросов (встроенный пак) и медиа кастомных паков
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/packs-media', express.static(MEDIA_ROOT));

// Раздача статики фронтенда (после билда)
const frontendPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

app.use('/auth', authRouter);
app.use('/api/packs', packsRouter);

// Хранилище аватарок в памяти (до перезапуска сервера)
const userAvatars = new Map(); 

// Загрузка аватара (Base64)
app.post('/api/upload/avatar', authenticateToken, express.json({ limit: '2mb' }), (req, res) => {
  const { avatar } = req.body;
  if (!avatar) return res.status(400).json({ error: 'No avatar provided' });
  userAvatars.set(req.user.id, avatar);
  const host = req.get('host');
  const protocol = req.protocol;
  res.json({ success: true, url: `${protocol}://${host}/api/avatar/${req.user.id}` });
});

module.exports = { userAvatars }; 

// Раздача аватара
app.get('/api/avatar/:userId', (req, res) => {
  const avatar = userAvatars.get(req.params.userId);
  if (!avatar) return res.status(404).end();

  const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches) {
    res.set('Content-Type', 'image/png');
    return res.status(400).end();
  }
  const type = matches[1];
  const data = Buffer.from(matches[2], 'base64');
  res.set('Content-Type', type);
  res.send(data);
});

// Создание комнаты (HTTP) — только для платформенной сессии (вход через хаб)
app.post('/api/rooms', authenticateToken, async (req, res) => {
  if (!req.user.platformId) return res.status(403).json({ error: 'Hub session required' });
  // Кастомный пак ведущего (если выбран) — иначе встроенный дефолт
  let pack = null;
  if (req.body?.packId) {
    pack = await loadPackForRoom(req.body.packId, req.user.platformId);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
  }
  const code = roomManager.createRoom(req.user, { maxPlayers: req.body?.maxPlayers, pack });
  res.status(201).json({ roomCode: code });
});

app.get('/api/rooms/:code', authenticateToken, (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomCode: room.roomCode,
    host: { id: room.state.host.id, username: room.state.host.username },
    maxPlayers: room.state.maxPlayers,
    playersCount: room.state.players.length,
    spectatorsCount: room.state.spectators.length,
    gameStarted: room.state.gameStarted
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Добавляем middleware для сокетов
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Authentication error'));
    // Вход только через хаб: без платформенной личности в игру не пускаем
    if (!user.platformId) return next(new Error('Hub session required'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  console.log('User connected via websocket:', socket.user.username);
  handleRoomEvents(io, socket, socket.user);
});

// Live player count for the platform orchestrator's idle reaper (stops the game when empty).
app.get('/metrics', (req, res) => {
  res.json({ players: io.engine.clientsCount });
});

// Обработка всех остальных маршрутов под фронтенд (SPA)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      // Если билда ещё нет, просто отдаём 404 для API или ошибку
      res.status(404).send('Frontend build not found. Run npm run build first.');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
