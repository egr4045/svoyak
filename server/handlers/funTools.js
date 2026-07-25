// Приколы ведущего: саундборд, визуальные эффекты, очковая рулетка.
// Звук/эффект — транзиентные события (НЕ в стейте комнаты): опоздавший их не догоняет,
// и это ок — прикол живёт секунду. Рулетка: сервер решает исход СРАЗУ, шлёт его с
// revealInMs, а очки применяет по таймеру после реворла — колесо у всех сходится
// в одну и ту же секцию, и никто не видит «прыжок очков» до остановки.

const SOUNDS = ['fanfare', 'drumroll', 'sadtrombone', 'quack', 'applause'];
const EFFECTS = ['confetti', 'shake', 'glitch'];
const SOUND_COOLDOWN_MS = 1500;
const EFFECT_COOLDOWN_MS = 800;
const ROULETTE_REVEAL_MS = 4000;

// Исходы рулетки с весами (порядок = секции колеса на клиенте, менять синхронно
// с EffectsOverlay.vue WHEEL_ORDER)
const OUTCOMES = [
  { kind: 'gift',   weight: 3 },   // +200 случайному
  { kind: 'tax',    weight: 3 },   // −200 случайному
  { kind: 'steal',  weight: 2 },   // кража max(100, 10%) у одного в пользу другого
  { kind: 'swap',   weight: 2 },   // обмен счётами двух игроков
  { kind: 'double', weight: 1 },   // удвоение счёта
  { kind: 'zero',   weight: 0.5 }, // обнуление
];

function pickWeighted(items, rnd = Math.random) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let roll = rnd() * total;
  for (const it of items) {
    roll -= it.weight;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

function pickPlayers(players, n, rnd = Math.random) {
  const pool = [...players];
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return out;
}

// Собирает конкретный исход с целями/суммами (детерминирован от rnd — тестируемо)
function rollOutcome(players, rnd = Math.random) {
  const kind = pickWeighted(OUTCOMES, rnd).kind;
  if (kind === 'steal' || kind === 'swap') {
    if (players.length < 2) return rollOutcomeFallback(players, rnd);
    const [a, b] = pickPlayers(players, 2, rnd);
    if (kind === 'swap') {
      return { kind, aId: a.id, aName: a.name, bId: b.id, bName: b.name };
    }
    const amount = Math.max(100, Math.round(Math.abs(a.score) * 0.1));
    return { kind, fromId: a.id, fromName: a.name, toId: b.id, toName: b.name, amount };
  }
  const [t] = pickPlayers(players, 1, rnd);
  if (!t) return null;
  const base = { targetId: t.id, targetName: t.name };
  if (kind === 'gift') return { kind, ...base, amount: 200 };
  if (kind === 'tax') return { kind, ...base, amount: 200 };
  return { kind, ...base }; // double | zero
}

// Для комнат с одним игроком парные исходы деградируют в подарок/налог
function rollOutcomeFallback(players, rnd) {
  const [t] = pickPlayers(players, 1, rnd);
  if (!t) return null;
  return rnd() < 0.5
    ? { kind: 'gift', targetId: t.id, targetName: t.name, amount: 200 }
    : { kind: 'tax', targetId: t.id, targetName: t.name, amount: 200 };
}

function applyOutcome(room, outcome, io) {
  const byId = (id) => room.state.players.find(p => String(p.id) === String(id));
  switch (outcome.kind) {
    case 'gift': {
      room.adjustScore(outcome.targetId, outcome.amount);
      room.addLog(`🎡 Рулетка: подарок! ${outcome.targetName} +${outcome.amount}.`, 'success');
      break;
    }
    case 'tax': {
      room.adjustScore(outcome.targetId, -outcome.amount);
      room.addLog(`🎡 Рулетка: налог! ${outcome.targetName} −${outcome.amount}.`, 'warning');
      break;
    }
    case 'steal': {
      room.adjustScore(outcome.fromId, -outcome.amount);
      room.adjustScore(outcome.toId, outcome.amount);
      room.addLog(`🎡 Рулетка: кража! ${outcome.toName} утащил ${outcome.amount} у ${outcome.fromName}.`, 'warning');
      break;
    }
    case 'swap': {
      const a = byId(outcome.aId), b = byId(outcome.bId);
      if (a && b) {
        const t = a.score; a.score = b.score; b.score = t;
        room.addLog(`🎡 Рулетка: обмен счётами! ${outcome.aName} ⇄ ${outcome.bName}.`, 'warning');
      }
      break;
    }
    case 'double': {
      const p = byId(outcome.targetId);
      if (p) {
        p.score *= 2;
        room.addLog(`🎡 Рулетка: удвоение! У ${outcome.targetName} теперь ${p.score}.`, 'success');
      }
      break;
    }
    case 'zero': {
      const p = byId(outcome.targetId);
      if (p) {
        p.score = 0;
        room.addLog(`🎡 Рулетка: обнуление! ${outcome.targetName} начинает с чистого листа.`, 'error');
      }
      break;
    }
  }
  room.broadcast(io);
}

// Вешает host-события приколов на сокет ведущего. Кулдауны и pending-спин живут на
// объекте комнаты (не в broadcast-стейте). Таймер рулетки — вне room.timers, чтобы
// clearTimers при смене вопроса не съел применение очков.
function registerFunTools(io, socket, room) {
  room.funCooldowns = room.funCooldowns || {};

  const cooled = (key, ms) => {
    const now = Date.now();
    if (now - (room.funCooldowns[key] || 0) < ms) return false;
    room.funCooldowns[key] = now;
    return true;
  };

  socket.on('host:playSound', (payload) => {
    const sound = payload && payload.sound;
    if (!SOUNDS.includes(sound)) return;
    if (!cooled('sound', SOUND_COOLDOWN_MS)) return;
    io.to(room.roomCode).emit('fun:sound', { sound });
  });

  socket.on('host:triggerEffect', (payload) => {
    const effect = payload && payload.effect;
    if (!EFFECTS.includes(effect)) return;
    if (!cooled('effect', EFFECT_COOLDOWN_MS)) return;
    let targetId = null;
    if (effect === 'glitch') {
      const t = room.state.players.find(p => String(p.id) === String(payload.targetId) && p.connected);
      if (!t) return; // глитч без валидной цели не имеет смысла
      targetId = t.id;
    }
    io.to(room.roomCode).emit('fun:effect', { effect, targetId });
  });

  socket.on('host:spinRoulette', () => {
    if (room.rouletteSpin) return;                         // уже крутится
    if (room.state.questionStatus === 'buzzer_active') return; // не портим честность реакции
    const candidates = room.state.players.filter(p => p.connected);
    const pool = candidates.length ? candidates : room.state.players;
    const outcome = rollOutcome(pool);
    if (!outcome) return;
    room.rouletteSpin = outcome;
    io.to(room.roomCode).emit('fun:roulette', { outcome, revealInMs: ROULETTE_REVEAL_MS });
    room.funRouletteTimer = setTimeout(() => {
      room.rouletteSpin = null;
      applyOutcome(room, outcome, io);
    }, ROULETTE_REVEAL_MS);
  });
}

module.exports = { registerFunTools, rollOutcome, applyOutcome, pickWeighted, SOUNDS, EFFECTS, OUTCOMES, ROULETTE_REVEAL_MS };
