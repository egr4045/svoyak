const GameState = require('../game/GameState');

const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;

// Код комнаты — не только наш id, но и ключ голосовой комнаты (`game:svoyak:<CODE>` в chat-сервисе
// платформы). Там привязка «этот код → LiveKit-рум беседы» живёт 24 часа, а наша комната умирает
// через 15 минут после опустошения — то есть переиспользованный код увёл бы игроков новой игры в
// звонок посторонних людей. Поэтому: длинный код + коды никогда не выдаются повторно за время жизни
// процесса. Пользователю код не показывается (только в /lobby/:id и ?join=), так что длина бесплатна.
const CODE_LEN = 10;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.cleanupTimers = new Map();
    // Все когда-либо выданные коды, включая уже удалённых комнат — см. комментарий к CODE_LEN
    this.usedCodes = new Set();
  }

  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < CODE_LEN; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (this.usedCodes.has(code));
    this.usedCodes.add(code);
    return code;
  }

  createRoom(hostUser, options = {}) {
    const code = this.generateCode();
    const game = new GameState(code, hostUser, options);
    this.rooms.set(code, game);
    // Комната, в которую так никто и не зашёл по сокету, тоже должна убраться
    this.scheduleCleanup(code);
    return code;
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase());
  }

  removeRoom(code) {
    this.cancelCleanup(code);
    this.rooms.delete(code.toUpperCase());
  }

  // Комната, из которой все вышли, живёт ещё 15 минут — на случай переподключений
  scheduleCleanup(code) {
    const key = code.toUpperCase();
    const room = this.rooms.get(key);
    if (!room || room.hasConnectedMembers() || this.cleanupTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(key);
      const r = this.rooms.get(key);
      if (r && !r.hasConnectedMembers()) {
        r.clearTimers();
        this.rooms.delete(key);
        console.log(`[RoomManager] Пустая комната ${key} удалена.`);
      }
    }, EMPTY_ROOM_TTL_MS);
    this.cleanupTimers.set(key, timer);
  }

  cancelCleanup(code) {
    const key = code.toUpperCase();
    const timer = this.cleanupTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(key);
    }
  }
}

module.exports = new RoomManager();
