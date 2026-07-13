const CharadesHandler = require('./CharadesHandler');

// Караоке = скелет «исполнитель», но приватный показ несёт реф-аудио: исполнитель
// слушает его локально (в наушник) и напевает; остальные не слышат оригинал и угадывают.
class KaraokeHandler extends CharadesHandler {
  constructor() { super('karaoke'); }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'performer_select';
    gameState.state.performerId = null;
    gameState.addLog('Караоке! Ведущий выбирает исполнителя.', 'warning');
  }

  buildReveal(gameState, question) {
    return {
      kind: 'karaoke',
      text: question.a,                      // название песни
      prompt: question.q || '',
      mediaSrc: question.mediaSrc || null,   // реф-аудио — проигрывается ТОЛЬКО у исполнителя
      mediaType: question.mediaType || null
    };
  }

  // Прячем из broadcast и название, и реф-аудио (иначе угадывающий откроет URL и услышит оригинал)
  secretFields() { return ['a', 'mediaSrc', 'mediaType']; }
}

module.exports = KaraokeHandler;
