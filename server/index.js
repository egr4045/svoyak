const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { authRouter, JWT_SECRET, authenticateToken } = require('./auth');
const roomManager = require('./managers/RoomManager');
const handleRoomEvents = require('./handlers/roomHandlers');
const { packsRouter, loadPackForRoom, MEDIA_ROOT } = require('./routes/packs');
const { isBuiltinPackId, getBuiltinPack, listBuiltinPacks } = require('./game/builtinPacks');
const db = require('./db/database');
const { migratePack } = require('./game/packMigrate');

const path = require('path');
const app = express();
app.use(cors());
// 25 МБ: глобальный парсер срабатывает раньше пер-роутерных, а импорт паков и
// загрузка медиа (base64) не влезают в дефолтные 100kb
app.use(express.json({ limit: '25mb' }));

// Статика для медиа-файлов вопросов (встроенный пак) и медиа кастомных паков.
// ВНИМАНИЕ: под /assets лежит И серверная медиа (server/assets), И фронтовый бандл Vite
// (dist/assets) — поэтому 404-терминатор на /assets ставить НЕЛЬЗЯ (срубит JS/CSS фронта).
// Терминаторы только на префиксы, которые не пересекаются с фронтом.
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/packs-media', express.static(MEDIA_ROOT));
app.use('/packs-media', (req, res) => res.status(404).end());

// Раздача статики фронтенда (после билда)
const frontendPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

app.use('/auth', authRouter);
app.use('/api/packs', packsRouter);

// (Своя загрузка аватара удалена: аватар берётся из профиля хаба и приходит
//  через сокет-событие player:setAvatar.)

// Создание комнаты (HTTP) — только для платформенной сессии (вход через хаб)
app.post('/api/rooms', authenticateToken, async (req, res) => {
  if (!req.user.platformId) return res.status(403).json({ error: 'Hub session required' });
  // Кастомный пак ведущего (если выбран) — иначе встроенный дефолт
  let pack = null;
  let packId = null;
  const requestedPack = req.body?.packId;
  if (isBuiltinPackId(requestedPack)) {
    // Встроенный пак лежит в коде, а не в БД. packId сознательно оставляем null:
    // на нём висит запись «прошёл пак», а строки в packs для builtin:* не существует.
    pack = getBuiltinPack(requestedPack);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
  } else if (requestedPack) {
    pack = await loadPackForRoom(requestedPack, req.user.platformId);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    packId = requestedPack;
  }
  const code = roomManager.createRoom(req.user, { maxPlayers: req.body?.maxPlayers, pack, packId });
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

// Неизвестные /api-маршруты — честный 404 (а не index.html из SPA-catch-all)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Обработка всех остальных маршрутов под фронтенд (SPA)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      // Если билда ещё нет, просто отдаём 404 для API или ошибку
      res.status(404).send('Frontend build not found. Run npm run build first.');
    }
  });
});

// Разовый свип БД на старте: домигрировать паки со старыми типами (text/cat/karaoke/…)
// в новый формат. Рантайм-миграция на входах остаётся (старые ZIP живут у людей вечно),
// свип лишь убирает длинный хвост легаси-данных в хранилище.
function migrateStoredPacks() {
  db.all('SELECT id, data FROM packs', [], (err, rows) => {
    if (err || !rows?.length) return;
    let migrated = 0;
    rows.forEach(r => {
      try {
        const before = JSON.parse(r.data);
        const after = migratePack(before);
        const afterStr = JSON.stringify(after);
        if (afterStr !== JSON.stringify(before)) {
          db.run('UPDATE packs SET data = ? WHERE id = ?', [afterStr, r.id]);
          migrated++;
        }
      } catch { /* битый JSON не трогаем */ }
    });
    if (migrated) console.log(`[migrate] Packs upgraded to new type model: ${migrated}`);
  });
}
migrateStoredPacks();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
