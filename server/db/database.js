const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// БД лежит в отдельной папке data/ (НЕ в db/ рядом с исходниками): в проде эта папка
// монтируется как volume, и если бы том перекрывал db/, он бы затенял сам database.js
// и заморозил бы миграции. data/ содержит только файл БД.
const dataDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
// Разовая миграция: перенести старую БД из db/svoyak.db, если она там осталась
const legacyPath = path.resolve(__dirname, 'svoyak.db');
const dbPath = path.join(dataDir, 'svoyak.db');
if (fs.existsSync(legacyPath) && !fs.existsSync(dbPath)) {
  try { fs.copyFileSync(legacyPath, dbPath); } catch { /* не критично */ }
}
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');

    // db.serialize обязателен: node-sqlite3 по умолчанию выполняет запросы параллельно,
    // и на свежей БД индекс может обогнать CREATE TABLE («no such table: users»)
    db.serialize(() => {
      // Create Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        platform_id TEXT
      )`);

      // Миграция старых БД: у sqlite ALTER TABLE не умеет UNIQUE-колонки,
      // поэтому добавляем обычную колонку + уникальный индекс отдельно.
      db.run(`ALTER TABLE users ADD COLUMN platform_id TEXT`, () => { /* duplicate column — уже есть */ });
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_platform_id ON users(platform_id)`);

      // Create Logs table
      db.run(`CREATE TABLE IF NOT EXISTS game_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message TEXT
      )`);

      // Паки вопросов ведущего. data — JSON пака; created_at — epoch ms (для TTL 30 дней).
      db.run(`CREATE TABLE IF NOT EXISTS packs (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_packs_owner ON packs(owner_id)`);
      // touched_at: TTL считаем от последнего изменения, а не от создания (активный пак не протухает)
      db.run(`ALTER TABLE packs ADD COLUMN touched_at INTEGER`, () => { /* колонка уже есть — ок */ });

      // Кто прошёл чужой пак вживую (игроком/зрителем в игре, дошедшей до конца) — даёт право
      // хостить этот пак самому, не открывая доступ к редактированию/удалению/экспорту оригинала.
      db.run(`CREATE TABLE IF NOT EXISTS pack_plays (
        pack_id TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        PRIMARY KEY (pack_id, platform_id)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pack_plays_platform ON pack_plays(platform_id)`);
    });
  }
});

module.exports = db;
