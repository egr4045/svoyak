const BaseQuestionHandler = require('./BaseQuestionHandler');

// Горячая картошка: игроки по кругу называют варианты из категории (голосом), а передаёт ход
// ВЕДУЩИЙ (host:passPotato) — он слышит ответ и решает, засчитан ли. У игроков кнопки нет:
// иначе можно спамить пасом и уворачиваться, да и судить голосовой ответ всё равно человеку.
//
// Скрытый случайный таймер (15–40с, не в broadcast — иначе не страшно) не рвёт сразу:
// он включает ВИДИМОЕ ШИПЕНИЕ на FIZZ_MS. Пока картошка шипит, ведущий ещё успевает передать —
// это и фора на пинг/клик, и лучший момент игры («вот-вот рванёт!»). Взрыв достаётся тому,
// кто держит картошку на конец окна.
const FIZZ_MS = 2500;

class PotatoHandler extends BaseQuestionHandler {
  constructor() { super('potato'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'potato_playing';
    const conn = gameState.state.players.filter(p => p.connected);
    const pool = conn.length ? conn : gameState.state.players;
    gameState.state.potatoRing = pool.map(p => p.id);
    gameState.state.potatoTurnId = gameState.state.potatoRing[0] || null;
    gameState.state.potatoResult = null;
    gameState.state.potatoFizzing = false;
    gameState.state.potatoFizzEndsAt = null;
    gameState.addLog('Горячая картошка! Называйте по очереди, ведущий передаёт.', 'warning');
  }

  // io доступен только после onSelect (см. roomHandlers host:selectQuestion → room.afterSelect)
  afterSelect(gameState, { io }) {
    this.armBomb(gameState, io);
  }

  armBomb(gameState, io) {
    if (gameState.timers.potatoBomb) clearTimeout(gameState.timers.potatoBomb);
    const ms = 15000 + Math.floor(Math.random() * 25000); // 15–40с, скрыто от игроков
    gameState.timers.potatoBomb = setTimeout(() => this.startFizzing(gameState, io), ms);
    // Ведущему дедлайн виден: он ведёт темп и должен знать, когда рванёт, чтобы
    // подгонять и красиво передать перед самым взрывом. Игрокам — по-прежнему нет.
    // performerId=null ⇒ адресат один: сокет ведущего (см. emitPrivateReveal).
    gameState.setPrivateReveal(null, null, { kind: 'potato_host', bombAt: Date.now() + ms }, io);
  }

  // Таймер вышел: картошка зашипела. Ещё FIZZ_MS можно передать.
  startFizzing(gameState, io) {
    if (gameState.state.questionStatus !== 'potato_playing') return;
    if (gameState.timers.potatoBomb) { clearTimeout(gameState.timers.potatoBomb); delete gameState.timers.potatoBomb; }
    gameState.state.potatoFizzing = true;
    gameState.state.potatoFizzEndsAt = Date.now() + FIZZ_MS;
    gameState.addLog('🔥 Картошка зашипела — передавайте быстрее!', 'warning');
    gameState.broadcast(io);
    gameState.timers.potatoFizz = setTimeout(() => this.explode(gameState, io), FIZZ_MS);
  }

  explode(gameState, io) {
    if (gameState.state.questionStatus !== 'potato_playing') return;
    if (gameState.timers.potatoFizz) { clearTimeout(gameState.timers.potatoFizz); delete gameState.timers.potatoFizz; }
    const q = gameState.getCurrentQuestion();
    const loserId = gameState.state.potatoTurnId;
    if (loserId) gameState.adjustScore(loserId, -(q.points || 0));
    gameState.state.potatoResult = { loserId };
    gameState.state.potatoFizzing = false;
    gameState.state.potatoFizzEndsAt = null;
    gameState.state.questionStatus = 'idle';
    const name = gameState.state.players.find(p => String(p.id) === String(loserId))?.name;
    gameState.addLog(`💥 Взорвалась у ${name || '—'}! −${q.points}.`, 'error');
    gameState.broadcast(io);
  }

  handleAction(gameState, action, data, { io }) {
    if (action === 'host:passPotato') {
      if (gameState.state.questionStatus !== 'potato_playing') return;
      const ring = gameState.state.potatoRing || [];
      if (!ring.length) return;
      const idx = ring.findIndex(id => String(id) === String(gameState.state.potatoTurnId));
      // Держателя могло не оказаться в кольце (вышел) — тогда начинаем с начала
      gameState.state.potatoTurnId = ring[(idx + 1) % ring.length];
      gameState.broadcast(io);
    }
  }
}

module.exports = PotatoHandler;
module.exports.FIZZ_MS = FIZZ_MS;
