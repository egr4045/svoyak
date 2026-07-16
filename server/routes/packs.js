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
// Применяет map ко всем медиа-полям вопроса, ВКЛЮЧАЯ вложенные объекты тир-листа (q.items[].mediaSrc).
// map(url) → новая строка или null (не менять).
function mapQuestionMedia(q, map) {
  MEDIA_FIELDS.forEach(f => {
    if (typeof q[f] === 'string') { const v = map(q[f]); if (v != null) q[f] = v; }
  });
  if (Array.isArray(q.items)) q.items.forEach(it => {
    if (it && typeof it.mediaSrc === 'string') { const v = map(it.mediaSrc); if (v != null) it.mediaSrc = v; }
  });
}
// URL медиа пака → относительное имя (media/<file>) для переносимого ZIP
function toPortable(data, packId) {
  const clone = JSON.parse(JSON.stringify(data));
  const prefix = `/packs-media/${packId}/`;
  forEachQuestion(clone, q => mapQuestionMedia(q, s => s.startsWith(prefix) ? 'media/' + s.slice(prefix.length) : null));
  return clone;
}
// media/<file> → абсолютный URL медиа нового пака
function fromPortable(data, newId) {
  const clone = JSON.parse(JSON.stringify(data));
  forEachQuestion(clone, q => mapQuestionMedia(q, s => s.startsWith('media/') ? `/packs-media/${newId}/` + s.slice('media/'.length) : null));
  return clone;
}
function rmPackDir(id) {
  try { fs.rmSync(packDir(id), { recursive: true, force: true }); } catch { /* нет папки — ок */ }
}
// Прунинг протухших паков (по последнему изменению) + их медиа
function pruneExpired() {
  const cutoff = Date.now() - TTL_MS;
  db.all('SELECT id FROM packs WHERE COALESCE(touched_at, created_at) < ?', [cutoff], (err, rows) => {
    if (err || !rows?.length) return;
    rows.forEach(r => rmPackDir(r.id));
    db.run('DELETE FROM packs WHERE COALESCE(touched_at, created_at) < ?', [cutoff]);
  });
}
setInterval(pruneExpired, 6 * 60 * 60 * 1000).unref?.();
pruneExpired();

// expiresAt считаем от последнего изменения (touched_at), фолбэк на created_at
const rowToMeta = (r) => { const base = r.touched_at || r.created_at; return { id: r.id, name: r.name, createdAt: r.created_at, expiresAt: base + TTL_MS }; };

// --- CRUD ----------------------------------------------------------------
// Список моих паков (без тела data)
router.get('/', (req, res) => {
  db.all('SELECT id, name, created_at FROM packs WHERE owner_id = ? ORDER BY created_at DESC', [req.user.platformId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ packs: (rows || []).map(rowToMeta) });
  });
});

// Чужие паки, которые я уже ПРОШЁЛ вживую (игроком/зрителем в игре, дошедшей до конца).
// ВАЖНО: маршрут должен стоять ДО '/:id', иначе Express примет 'played' за id пака.
router.get('/played', (req, res) => {
  db.all(
    `SELECT p.id, p.name, p.created_at, pl.played_at
     FROM pack_plays pl JOIN packs p ON p.id = pl.pack_id
     WHERE pl.platform_id = ? AND p.owner_id != ?
     ORDER BY pl.played_at DESC`,
    [req.user.platformId, req.user.platformId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ packs: (rows || []).map(r => ({ id: r.id, name: r.name, playedAt: r.played_at })) });
    }
  );
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
  const now = Date.now();
  db.run('INSERT INTO packs (id, owner_id, name, data, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.user.platformId, name, JSON.stringify(data), now, now],
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
    db.run('UPDATE packs SET name = ?, data = ?, touched_at = ? WHERE id = ?', [name, JSON.stringify(data), Date.now(), req.params.id],
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

// --- Медиа-полка: список файлов пака (used/orphan решает клиент по mediaSrc в data) ------
router.get('/:id/media', (req, res) => {
  db.get('SELECT id FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const dir = packDir(req.params.id);
    let files = [];
    if (fs.existsSync(dir)) {
      files = fs.readdirSync(dir).map(name => {
        const st = fs.statSync(path.join(dir, name));
        return { name, url: `/packs-media/${req.params.id}/${name}`, sizeBytes: st.size, mtimeMs: st.mtimeMs };
      });
    }
    res.json({ files });
  });
});

// Удалить один файл медиа (GC осиротевших) — path.basename защищает от path traversal
router.delete('/:id/media/:filename', (req, res) => {
  db.get('SELECT id FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const safe = path.basename(req.params.filename);
    try { fs.unlinkSync(path.join(packDir(req.params.id), safe)); } catch { /* уже нет — ок */ }
    res.json({ ok: true });
  });
});

// --- Ремикс: глубокая копия пака (данные + физические файлы медиа) в новый независимый пак ---
router.post('/:id/duplicate', (req, res) => {
  db.get('SELECT * FROM packs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.platformId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pack not found' });
    const newId = genId();
    const now = Date.now();
    const name = `${row.name} (копия)`.slice(0, 120);
    // toPortable/fromPortable уже умеют переписывать ВСЕ медиа-ссылки (вкл. items[] тир-листа) —
    // переиспользуем их вместо ручного обхода дерева
    const data = fromPortable(toPortable(JSON.parse(row.data), row.id), newId);
    const srcDir = packDir(row.id), dstDir = packDir(newId);
    if (fs.existsSync(srcDir)) { fs.mkdirSync(dstDir, { recursive: true }); fs.cpSync(srcDir, dstDir, { recursive: true }); }
    db.run('INSERT INTO packs (id, owner_id, name, data, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId, req.user.platformId, name, JSON.stringify(data), now, now],
      (e2) => {
        if (e2) { rmPackDir(newId); return res.status(500).json({ error: 'DB error' }); }
        res.status(201).json({ id: newId, name });
      });
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
    const now = Date.now();
    db.run('INSERT INTO packs (id, owner_id, name, data, created_at, touched_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId, req.user.platformId, name, JSON.stringify(data), now, now],
      (err) => {
        if (err) { rmPackDir(newId); return res.status(500).json({ error: 'DB error' }); }
        res.status(201).json({ id: newId, name });
      });
  } catch (e) {
    res.status(400).json({ error: 'Битый ZIP' });
  }
});

// Загрузка пака для инъекции в комнату (используется в /api/rooms). Возвращает {rounds} или null.
// Разрешено владельцу ИЛИ тому, кто уже прошёл этот пак вживую (pack_plays) — «прошедший» может
// хостить пак сам, но НЕ получает прав редактировать/удалять/экспортировать/ремиксить оригинал
// (те эндпоинты выше остаются строго owner_id = ?).
function loadPackForRoom(packId, requesterPlatformId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT data FROM packs WHERE id = ? AND (owner_id = ? OR id IN (
         SELECT pack_id FROM pack_plays WHERE platform_id = ?
       ))`,
      [packId, requesterPlatformId, requesterPlatformId],
      (err, row) => {
        if (err || !row) return resolve(null);
        try { resolve(JSON.parse(row.data)); } catch { resolve(null); }
      }
    );
  });
}

module.exports = { packsRouter: router, loadPackForRoom, MEDIA_ROOT, toPortable, fromPortable };
