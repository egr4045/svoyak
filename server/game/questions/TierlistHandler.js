const BaseQuestionHandler = require('./BaseQuestionHandler');

function median(nums) {
  const s = nums.filter(v => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Тир-лист: каждый объект оценивают ползунком 1–10. Оценки держим в sealed store (не анкорим),
// в стейте — только кто сдал. На reveal считаем медиану группы по каждому объекту и начисляем
// очки за близость к ней (градуировано): точное попадание в медиану по всем объектам ≈ q.points.
class TierlistHandler extends BaseQuestionHandler {
  constructor() { super('tierlist'); }

  items(gameState) {
    const q = gameState.getCurrentQuestion();
    return Array.isArray(q.items) ? q.items : [];
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'tier_rating';
    gameState.state.tierRatings = {};
    gameState.state.tierSubmitted = [];
    gameState.state.tierMedians = null;
    gameState.state.tierResults = null;
    gameState.addLog('Тир-лист: оцените объекты 1–10.', 'info');
  }

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:submitTier') {
      if (gameState.state.questionStatus !== 'tier_rating') return;
      const items = this.items(gameState);
      const raw = (data && data.ratings) || {};
      const ratings = {};
      for (let i = 0; i < items.length; i++) {
        const v = Number(raw[i]);
        ratings[i] = Number.isFinite(v) ? Math.min(10, Math.max(1, Math.round(v))) : 5;
      }
      gameState.sealed[String(user.id)] = ratings;
      const uid = String(user.id);
      if (!gameState.state.tierSubmitted.includes(uid)) gameState.state.tierSubmitted.push(uid);
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:revealTier') {
      if (gameState.state.questionStatus !== 'tier_rating') return;
      this.reveal(gameState, io);
    }
  }

  reveal(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const items = this.items(gameState);
    const entries = Object.entries(gameState.sealed); // [ [uid, {i:val}], ... ]
    const perItemMax = items.length ? q.points / items.length : 0;
    const medians = items.map((_, i) => median(entries.map(([, r]) => r[i])));

    const scores = {};
    entries.forEach(([uid]) => { scores[uid] = 0; });
    items.forEach((_, i) => {
      const med = medians[i];
      if (med == null) return;
      entries.forEach(([uid, r]) => {
        const val = r[i];
        if (val == null) return;
        scores[uid] += perItemMax * (1 - Math.abs(val - med) / 9); // 1..10 → max откл. 9
      });
    });
    Object.keys(scores).forEach((uid) => {
      scores[uid] = Math.round(scores[uid]);
      if (scores[uid] !== 0) gameState.adjustScore(uid, scores[uid]);
    });

    gameState.state.tierMedians = medians;
    gameState.state.tierResults = {
      items: items.map((it, i) => ({
        label: it.label || `#${i + 1}`, mediaSrc: it.mediaSrc || null, mediaType: it.mediaType || null, median: medians[i]
      })),
      ratings: Object.fromEntries(entries),
      scores
    };
    gameState.state.questionStatus = 'tier_results';
    gameState.addLog('Тир-лист подведён.', 'success');
    io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
  }
}

module.exports = TierlistHandler;
