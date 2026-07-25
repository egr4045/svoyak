const BaseQuestionHandler = require('./BaseQuestionHandler');

// «Все отвечают» — семейство одновременных сабмитов через sealed store:
// everyoneMode = 'number' (угадай число, дефолт) | 'tierlist' (тир-лист) | 'whosaid' (кто это сказал).
// Общий каркас: все сдают приватно (gameState.sealed — не анкорим друг друга), в broadcast
// только факт/счётчик сдачи; ведущий вскрывает → ранжирование/начисление.

// Парсинг ответа/догадки в сравнимое число. date → epoch(ms), number/year → float.
function toNumber(kind, raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (kind === 'date') { const t = Date.parse(s); return Number.isNaN(t) ? null : t; }
  const n = parseFloat(s.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function median(nums) {
  const s = nums.filter(v => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// --- Режим «угадай число»: ближайший к ответу берёт очки -------------------
const numberMode = {
  onSelect(gameState, question) {
    gameState.state.questionStatus = 'number_inputting';
    gameState.state.numberGuesses = {};
    gameState.state.numberReveal = null;
    gameState._priv.numberTarget = toNumber(question.numberKind, question.a);
    gameState._priv.numberAnswer = question.a; // исходная строка для показа
    gameState.blankActiveQuestionFields(['a']);
    gameState.addLog('Угадай число!', 'info');
  },

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:submitNumber') {
      if (gameState.state.questionStatus !== 'number_inputting') return;
      const q = gameState.getCurrentQuestion();
      const parsed = toNumber(q.numberKind, data && data.value);
      if (parsed == null) return;
      gameState.sealed[String(user.id)] = { raw: String(data.value), num: parsed };
      gameState.state.numberGuesses[String(user.id)] = true; // только факт ответа
      gameState.broadcast(io);
    } else if (action === 'host:revealNumber') {
      if (gameState.state.questionStatus !== 'number_inputting') return;
      numberMode.reveal(gameState, io);
    }
  },

  reveal(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const target = gameState._priv.numberTarget;
    const ranked = Object.entries(gameState.sealed).map(([id, v]) => {
      const p = gameState.state.players.find(pp => String(pp.id) === String(id));
      return { id, name: p ? p.name : id, raw: v.raw, num: v.num, diff: target == null ? Infinity : Math.abs(v.num - target) };
    }).sort((a, b) => a.diff - b.diff);
    const winnerId = ranked.length && ranked[0].diff !== Infinity ? ranked[0].id : null;
    if (winnerId) gameState.adjustScore(winnerId, q.points);
    gameState.state.numberReveal = {
      kind: q.numberKind || 'number',
      answer: gameState._priv.numberAnswer != null ? String(gameState._priv.numberAnswer) : null,
      ranked, winnerId
    };
    gameState.state.questionStatus = 'number_results';
    gameState.addLog(winnerId ? `Ближе всех: ${ranked[0].name}.` : 'Никто не ответил.', 'success');
    gameState.broadcast(io);
  }
};

// --- Режим «тир-лист»: очки за близость к медиане группы --------------------
const tierlistMode = {
  items(gameState) {
    const q = gameState.getCurrentQuestion();
    return Array.isArray(q.items) ? q.items : [];
  },

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'tier_rating';
    gameState.state.tierRatings = {};
    gameState.state.tierSubmitted = [];
    gameState.state.tierMedians = null;
    gameState.state.tierResults = null;
    gameState.addLog('Тир-лист: оцените объекты 1–10.', 'info');
  },

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:submitTier') {
      if (gameState.state.questionStatus !== 'tier_rating') return;
      const items = tierlistMode.items(gameState);
      const raw = (data && data.ratings) || {};
      const ratings = {};
      for (let i = 0; i < items.length; i++) {
        const v = Number(raw[i]);
        ratings[i] = Number.isFinite(v) ? Math.min(10, Math.max(1, Math.round(v))) : 5;
      }
      gameState.sealed[String(user.id)] = ratings;
      const uid = String(user.id);
      if (!gameState.state.tierSubmitted.includes(uid)) gameState.state.tierSubmitted.push(uid);
      gameState.broadcast(io);
    } else if (action === 'host:revealTier') {
      if (gameState.state.questionStatus !== 'tier_rating') return;
      tierlistMode.reveal(gameState, io);
    }
  },

  reveal(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const items = tierlistMode.items(gameState);
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
    gameState.broadcast(io);
  }
};

// --- Режим «кто это сказал»: анонимные ответы + угадывание авторов ----------
const whosaidMode = {
  onSelect(gameState, question) {
    gameState.state.questionStatus = 'whosaid_collecting';
    gameState.state.whoSaidCount = 0;
    gameState.state.whoSaidAnswers = null;
    gameState.state.whoSaidGuesses = {};
    gameState.state.whoSaidResult = null;
    gameState.addLog('Кто это сказал: напишите свой ответ.', 'info');
  },

  handleAction(gameState, action, data, { io, user }) {
    const st = gameState.state.questionStatus;
    if (action === 'player:submitWhoSaid') {
      if (st !== 'whosaid_collecting') return;
      const text = data && typeof data.text === 'string' ? data.text.trim().slice(0, 300) : '';
      if (!text) return;
      gameState.sealed[String(user.id)] = { text };
      gameState.state.whoSaidCount = Object.keys(gameState.sealed).length;
      gameState.broadcast(io);
    } else if (action === 'host:revealWhoSaid') {
      if (st !== 'whosaid_collecting') return;
      whosaidMode.reveal(gameState, io);
    } else if (action === 'player:guessAuthor') {
      if (st !== 'whosaid_guessing') return;
      const guesses = (data && data.guesses) || {};
      gameState.sealed[String(user.id)] = { guesses }; // перезапись до подсчёта
      gameState.state.whoSaidCount = Object.keys(gameState.sealed).length;
      gameState.broadcast(io);
    } else if (action === 'host:scoreWhoSaid') {
      if (st !== 'whosaid_guessing') return;
      whosaidMode.score(gameState, io);
    }
  },

  reveal(gameState, io) {
    const entries = Object.entries(gameState.sealed).map(([uid, v]) => ({ uid, text: v.text }));
    for (let i = entries.length - 1; i > 0; i--) { // перемешиваем (Fisher–Yates)
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const authors = {};
    const answers = entries.map((e, idx) => { authors[idx] = e.uid; return { idx, text: e.text }; });
    gameState._priv.whoSaidAuthors = authors; // соответствие idx→автор держим вне broadcast
    gameState.state.whoSaidAnswers = answers; // анонимно
    gameState.sealed = {};                    // переиспользуем под догадки
    gameState.state.whoSaidCount = 0;
    gameState.state.questionStatus = 'whosaid_guessing';
    gameState.broadcast(io);
  },

  score(gameState, io) {
    const q = gameState.getCurrentQuestion();
    const authors = gameState._priv.whoSaidAuthors || {};
    const answers = gameState.state.whoSaidAnswers || [];
    const perCorrect = Math.max(1, Math.round((q.points || 0) / Math.max(1, answers.length)));
    const scores = {};
    for (const [voterId, v] of Object.entries(gameState.sealed)) {
      const guesses = v.guesses || {};
      let correct = 0;
      for (const a of answers) {
        const authorId = authors[a.idx];
        if (String(authorId) === String(voterId)) continue;      // свой ответ не считаем
        if (String(guesses[a.idx]) === String(authorId)) correct++;
      }
      scores[voterId] = correct * perCorrect;
      if (scores[voterId] > 0) gameState.adjustScore(voterId, scores[voterId]);
    }
    gameState.state.whoSaidResult = {
      answers: answers.map(a => {
        const authorId = authors[a.idx];
        const p = gameState.state.players.find(pp => String(pp.id) === String(authorId));
        return { idx: a.idx, text: a.text, authorId, authorName: p ? p.name : '—' };
      }),
      scores
    };
    gameState.state.questionStatus = 'whosaid_results';
    gameState.addLog('Кто сказал: авторы раскрыты.', 'success');
    gameState.broadcast(io);
  }
};

const MODES = { number: numberMode, tierlist: tierlistMode, whosaid: whosaidMode };

class EveryoneHandler extends BaseQuestionHandler {
  constructor() { super('everyone'); }

  modeOf(question) {
    const m = question?.everyoneMode;
    return MODES[m] ? m : 'number';
  }

  onSelect(gameState, question) {
    MODES[this.modeOf(question)].onSelect(gameState, question);
  }

  handleAction(gameState, action, data, ctx) {
    const q = gameState.getCurrentQuestion();
    MODES[this.modeOf(q)].handleAction(gameState, action, data, ctx);
  }
}

module.exports = EveryoneHandler;
