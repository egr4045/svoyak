const handleRoomEvents = require('../handlers/roomHandlers');
const { makeBotSocket } = require('./botSocket');
const { makeRng, seedFrom } = require('./rng');
const { HOST_PERSONA } = require('./personas');
const hostBrain = require('./hostBrain');
const playerBrain = require('./playerBrain');

// Предохранитель: логическая ошибка в мозгах должна вырождаться в ЗАМЕРШУЮ игру,
// а не в busy-loop, который положит процесс вместе со всеми остальными комнатами.
const BUDGET_WINDOW_MS = 10000;
const BUDGET_MAX_ACTIONS = 60;

// Холостой пульс: не все действия приводят к broadcast (хендлер может тихо выйти по гварду),
// и room:join живого игрока тоже шлёт стейт мимо broadcast. Пульс гарантирует, что план
// пересчитается и игра не зависнет навсегда. Сам по себе он ничего не делает.
const WATCHDOG_MS = 20000;

class BotDriver {
  /**
   * @param {GameState} room
   * @param {Server} io
   * @param {{ seat: 'host'|'player', testerId: any, personas: Array }} options
   */
  constructor(room, io, { seat, testerId, personas }) {
    this.room = room;
    this.io = io;
    this.seat = seat;
    this.testerId = testerId;
    this.personas = personas;
    // Ведущий-бот нужен только когда тестер занял место игрока
    this.driveHost = seat !== 'host';

    this.rnd = makeRng(seedFrom(room.roomCode));
    this.sockets = new Map();   // actorId → фейковый сокет
    this.botById = new Map();   // actorId → персона
    this.timers = new Map();    // key → Timeout
    this.actionLog = [];        // метки времени для бюджета
    // Счётчик сработавших действий по имени. Тест по нему проверяет, что игра шла на
    // настоящих механиках, а не вытягивалась аварийным закрытием 'stuck'.
    this.stats = Object.create(null);
    // Во что бот «верит», нажимая баззер: ведущий-бот судит по этому, а не гадает вслепую
    this.beliefs = Object.create(null);
    // Разовые решения на вопрос (сколько раз открывать фрагмент и т.п.)
    this.memo = Object.create(null);
    this.detached = false;
    this.celebrated = false;
    this._planning = false;
    this._watchdog = null;
  }

  // --- Жизненный цикл ------------------------------------------------------

  attach() {
    if (this.driveHost) this.seatBot(HOST_PERSONA, true);
    for (const p of this.personas) this.seatBot(p, false);
    this.room.onBroadcast = () => this.onState();
    this.onState();
  }

  seatBot(persona, isHost) {
    const user = { id: persona.id, username: persona.name, avatar: persona.avatar, platformId: null };
    const socket = makeBotSocket(this.io, persona.id);
    handleRoomEvents(this.io, socket, user);
    socket.fire('room:join', this.room.roomCode);
    this.sockets.set(persona.id, socket);
    if (!isHost) {
      this.botById.set(persona.id, persona);
      // Ботам нечего прелоадить — иначе кнопка «Начать» у тестера никогда не разблокируется
      socket.fire('player:loaded', { failedCount: 0 });
      const seated = this.room.state.players.find(p => p.id === persona.id);
      if (seated) seated.isBot = true;
    } else {
      this.room.state.host.isBot = true;
      this.room.state.host.avatar = persona.avatar;
    }
  }

  detach() {
    this.detached = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    if (this.room.onBroadcast) this.room.onBroadcast = null;
  }

  // --- Бюджет --------------------------------------------------------------

  budgetOk() {
    const now = Date.now();
    this.actionLog = this.actionLog.filter(t => now - t < BUDGET_WINDOW_MS);
    if (this.actionLog.length >= BUDGET_MAX_ACTIONS) {
      console.warn(`[bots] ${this.room.roomCode}: превышен бюджет действий, боты отключены`);
      this.detach();
      return false;
    }
    return true;
  }

  // --- Планирование --------------------------------------------------------

  onState() {
    if (this.detached || this._planning) return;
    this._planning = true;
    try {
      const plan = this.plan();
      for (const [key, t] of this.timers) {
        // Ключ пропал из плана ⇒ предусловие действия больше не выполняется
        if (!plan.some(p => p.key === key)) { clearTimeout(t); this.timers.delete(key); }
      }
      for (const p of plan) {
        // Уже вооружено — НЕ перезаводим: чужой сабмит не должен сбрасывать чужую задержку
        if (this.timers.has(p.key)) continue;
        const t = setTimeout(() => this.run(p.key), Math.max(0, p.delayMs));
        if (typeof t.unref === 'function') t.unref();
        this.timers.set(p.key, t);
      }
    } finally {
      this._planning = false;
    }
    this.armWatchdog();
  }

  armWatchdog() {
    if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    if (this.detached || this.room.state.questionStatus === 'game_over') return;
    const t = setTimeout(() => { this._watchdog = null; this.onState(); }, WATCHDOG_MS);
    if (typeof t.unref === 'function') t.unref();
    this._watchdog = t;
  }

  run(key) {
    this.timers.delete(key);
    if (this.detached || !this.budgetOk()) return;
    // Мир мог уехать, пока таймер тикал — пересчитываем план и действуем, только если
    // это же действие всё ещё актуально
    const still = this.plan().find(p => p.key === key);
    if (!still) return;
    this.actionLog.push(Date.now());
    const name = key.split('|')[1];
    this.stats[name] = (this.stats[name] || 0) + 1;
    try {
      still.run();
    } catch (err) {
      console.error(`[bots] ${this.room.roomCode}: ошибка действия ${key}`, err);
      this.detach();
    }
  }

  plan() {
    const st = this.room.state;
    // Живых нет — замираем. Возобновимся, когда тестер вернётся (пульс перепланирует).
    if (!this.room.hasConnectedMembers()) return [];
    const ctx = this.buildCtx();
    const out = [];
    if (this.driveHost) out.push(...hostBrain.plan(ctx));
    for (const bot of this.botById.values()) {
      const seated = st.players.find(p => String(p.id) === String(bot.id));
      if (seated) out.push(...playerBrain.plan(ctx, bot));
    }
    return out.filter(Boolean);
  }

  buildCtx() {
    const room = this.room;
    const st = room.state;
    const cell = st.activeCell;
    const sig = `${st.currentRoundIndex}:${cell ? cell.catIdx : '-'}:${cell ? cell.qIdx : '-'}:${st.questionStatus}`;
    const driver = this;
    return {
      driver, room, io: this.io, st, cell, sig,
      q: room.getCurrentQuestion(),
      rnd: this.rnd,
      testerId: this.testerId,
      isBotId: (id) => driver.botById.has(String(id)) || String(id) === HOST_PERSONA.id,
      // Действие плана. extra — дискриминатор, который обязан меняться вместе с миром,
      // иначе действие вооружится повторно и уйдёт в цикл (см. ключи с snippetLevel/potatoTurnId).
      // ВАЖНО: extra выводим ТОЛЬКО из состояния. Случайный выбор в ключе делает действие
      // самоотменяющимся: run() пересчитает план, вытянет другой рандом и не найдёт свой ключ.
      // Случайность — внутрь run().
      act(actor, name, delayMs, run, extra) {
        const key = `${actor}|${name}|${sig}${extra != null ? '|' + extra : ''}`;
        return { key, delayMs, run };
      },
      fire: (actor, ev, payload) => driver.fire(actor, ev, payload),
      // Разовое решение на вопрос: «сколько раз открывать фрагмент» и подобное
      once: (name, make) => {
        const k = `${sig.split(':').slice(0, 3).join(':')}|${name}`;
        if (!(k in driver.memo)) driver.memo[k] = make();
        return driver.memo[k];
      }
    };
  }

  fire(actorId, ev, payload) {
    const socket = this.sockets.get(String(actorId));
    if (!socket) return;
    socket.fire(ev, payload);
  }
}

module.exports = BotDriver;
module.exports.BUDGET_MAX_ACTIONS = BUDGET_MAX_ACTIONS;
module.exports.WATCHDOG_MS = WATCHDOG_MS;
