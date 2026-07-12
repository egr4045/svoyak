const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'svoyak.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
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
  }
});

module.exports = db;
