const GameState = require('../game/GameState');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostUser) {
    const code = this.generateCode();
    const game = new GameState(code, hostUser);
    this.rooms.set(code, game);
    return code;
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase());
  }

  removeRoom(code) {
    this.rooms.delete(code.toUpperCase());
  }
}

module.exports = new RoomManager();
