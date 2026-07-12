const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const db = require('../db/database');
const { authenticateToken } = require('../auth');

const router = express.Router();
router.use(express.json({ limit: '25mb' })); // база64 медиа при загрузке/импорте

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const MEDIA_ROOT = path.join(__dirname, '..', 'uploads', 'packs');
fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const MEDIA_FIELDS = ['mediaSrc', 'answerMediaSrc', 'image'];
const genId = () => crypto.randomBytes(8).toString('hex');
const packDir = (id) => path.join(MEDIA_ROOT, id);

// Только платформенная сессия (вход через хаб)
router.use(authenticateToken, (req, res, next) => {
  if (!req.user.platformId) return res.status(403).json({ error: 'Hub session required' });
  next();
});

// --- helpers -------------------------------------------------------------
function forEachQuestion(data, fn) {
  (data?.rounds || []).forEach(r => (r.categories || []).forEach(c => (c.questions || []).forEach(fn)));
}
// URL медиа пака → относительное имя (media/<file>) для переносимого ZIP
function toPortable(data, packId) {
  const clone = JSON.parse(JSON.stringify(data));
  const prefix = `/packs-media/${packId}/`;
  forEachQuestion(clone, q => MEDIA_FIELDS.forEach(f => {
    if (typeof q[f] === 'string' && q[f].startsWith(prefix)) q[f] = 'media/' + q[f].slice(prefix.length);
  }));
  return clone;
}
// media/<file> → абсолютный URL медиа нового пака
function fromPortable(data, newId) {
  const clone = JSON.parse(JSON.stringify(data));
  forEachQuestion(clone, q => MEDIA_FIELDS.forEach(f => {
    if (typeof q[f] === 'string' && q[f].startsWith('media/')) q[f] = `/packs-media/${newId}/` + q[f].slice('media/'.length);
  }));
  return clone;
}
function rmPackDir(id) {
  try { fs.rmSync(packDir(id), { recursive: true, force: true }); } catch { /* нет папки — ок */ }
}
// Прунинг протухших паков (по created_at) + их медиа
function pruneExpired() {
  const cutoff = Date.now() - TTL_MS;
  db.all('SELECT id FROM packs WHERE created_at < ?', [cutoff], (err, rows) => {
    if (err || !rows?.length) return;
    rows.forEach(r => rmPackDir(r.id));
    db.run('DELETE FROM packs WHERE created_at < ?', [cutoff]);
  });
}
setInterval(pruneExpired, 6 * 60 * 60 * 1000).unref?.();
pruneExpired();

const rowToMeta = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at, expiresAt: r.created_at + TTL_MS });

// --- CRUD ----------------------------------------------------------------
// Список моих паков (без тела data)
router.get('/', (req, res) => {
  db.all('SELECT id, name, created_at FROM packs WHERE owner_id = ? ORDER BY created_at DESC', [req.user.platformId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ packs: (rows || []).map(rowToMeta) });
  });
});

// Полный пак
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    res.json({ ...rowToMeta(row), data: JSON.parse(row.data) });
  });
});

// Создать
router.post('/', (req, res) => {
  const name = (req.body?.name || '').toString().slice(0, 120) || 'Без названия';
  const data = req.body?.data || { rounds: [] };
  const id = genId();
  db.run('INSERT INTO packs (id, owner_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, req.user.platformId, name, JSON.stringify(data), Date.now()],
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      db.get('SELECT * FROM packs WHERE id = ?', [id], (e2, row) => res.status(201).json({ ...rowToMeta(row), data: JSON.parse(row.data) }));
    });
});

// Обновить (владелец)
router.put('/:id', (req, res) => {
  db.get('SELECT id FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const name = (req.body?.name || 'Без названия').toString().slice(0, 120);
    const data = req.body?.data || { rounds: [] };
    db.run('UPDATE packs SET name = ?, data = ? WHERE id = ?', [name, JSON.stringify(data), req.params.id],
      (e2) => e2 ? res.status(500).json({ error: 'DB error' }) : res.json({ ok: true }));
  });
});

// Удалить (владелец) + медиа
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes) rmPackDir(req.params.id);
    res.json({ ok: true });
  });
});

// --- Медиа: загрузка base64 -> файл на диске -----------------------------
router.post('/:id/media', (req, res) => {
  db.get('SELECT id FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const { dataUrl } = req.body || {};
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return res.status(400).json({ error: 'Bad dataUrl' });
    const mime = m[1];
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm' })[mime] || 'bin';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'Файл больше 20 МБ' });
    fs.mkdirSync(packDir(req.params.id), { recursive: true });
    const fname = `${genId()}.${ext}`;
    fs.writeFileSync(path.join(packDir(req.params.id), fname), buf);
    res.json({ url: `/packs-media/${req.params.id}/${fname}` });
  });
});

// --- Экспорт: ZIP (pack.json + media/) -----------------------------------
router.get('/:id/export', (req, res) => {
  db.get('SELECT * FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const portable = toPortable(JSON.parse(row.data), row.id);
    const zip = new AdmZip();
    zip.addFile('pack.json', Buffer.from(JSON.stringify({ name: row.name, data: portable }, null, 2), 'utf8'));
    const dir = packDir(row.id);
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => zip.addLocalFile(path.join(dir, f), 'media'));
    const safe = (row.name || 'pack').replace(/[^\wа-яё\- ]/gi, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}.zip"`);
    res.send(zip.toBuffer());
  });
});

// --- Импорт: ZIP -> новый пак --------------------------------------------
router.post('/import', (req, res) => {
  try {
    const { zipBase64 } = req.body || {};
    if (!zipBase64) return res.status(400).json({ error: 'No file' });
    const zip = new AdmZip(Buffer.from(zipBase64, 'base64'));
    const manifest = zip.getEntry('pack.json');
    if (!manifest) return res.status(400).json({ error: 'В архиве нет pack.json' });
    const parsed = JSON.parse(zip.readAsText(manifest));
    const newId = genId();
    const data = fromPortable(parsed.data || { rounds: [] }, newId);
    // Распаковываем медиа
    fs.mkdirSync(packDir(newId), { recursive: true });
    zip.getEntries().forEach(e => {
      if (!e.isDirectory && e.entryName.startsWith('media/')) {
        const base = path.basename(e.entryName);
        fs.writeFileSync(path.join(packDir(newId), base), e.getData());
      }
    });
    const name = (parsed.name || 'Импортированный пак').toString().slice(0, 120);
    db.run('INSERT INTO packs (id, owner_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId, req.user.platformId, name, JSON.stringify(data), Date.now()],
      (err) => {
        if (err) { rmPackDir(newId); return res.status(500).json({ error: 'DB error' }); }
        res.status(201).json({ id: newId, name });
      });
  } catch (e) {
    res.status(400).json({ error: 'Битый ZIP' });
  }
});

// Загрузка пака для инъекции в комнату (используется в /api/rooms). Возвращает {rounds} или null.
function loadPackForRoom(packId, ownerPlatformId) {
  return new Promise((resolve) => {
    db.get('SELECT data FROM packs WHERE id = ? AND owner_id = ?', [packId, ownerPlatformId], (err, row) => {
      if (err || !row) return resolve(null);
      try { resolve(JSON.parse(row.data)); } catch { resolve(null); }
    });
  });
}

module.exports = { packsRouter: router, loadPackForRoom, MEDIA_ROOT };
