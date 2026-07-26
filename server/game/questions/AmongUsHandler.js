const BaseQuestionHandler = require('./BaseQuestionHandler');

// «Шпион» — механика «Хамелеона»: все видят вопрос, КРОМЕ шпиона. Шпион сразу получает своё
// задание (роль + тема категории) приватно и пишет правдоподобный ответ вслепую.
//
// Флоу намеренно короткий: ПИШУТ → ОБСУЖДАЮТ → ГОЛОСУЮТ. Ведущий НЕ судит ответы «верно/неверно»:
// правильного ответа тут нет, вся соль — вычислить блеф. Как только ответили все, комната сама
// уходит в обсуждение (ведущий может форсировать раньше, если кто-то завис).
//
// id шпиона живёт вне broadcast (_priv) до вскрытия — иначе любой devtools раскрывал интригу.
const DISCUSSION_MS = 120000;

class AmongUsHandler extends BaseQuestionHandler {
  constructor() {
    super('among_us');
  }

  onSelect(gameState, question) {
    gameState.state.questionStatus = 'text_inputting';
    gameState.state.imposterId = null; // публикуется только при вскрытии
    if (gameState.state.players.length > 0) {
      const randomIdx = Math.floor(Math.random() * gameState.state.players.length);
      gameState._priv.imposterId = gameState.state.players[randomIdx].id;
    }
    gameState.state.amongUsTimerState = null;
    gameState.state.amongUsVotes = {};
    gameState.state.amongUsResult = null;
    gameState.addLog(`Шпион среди нас! Кое-кто не видит вопрос…`, 'error');
  }

  // io доступен после onSelect: шпион (и ведущий) приватно узнают роль.
  // privateReveal переживает реконнект (см. roomHandlers room:join).
  afterSelect(gameState, { io }) {
    const impId = gameState._priv.imposterId;
    if (impId == null) return;
    const impName = gameState.state.players.find(p => String(p.id) === String(impId))?.name || '—';
    // Тема категории — то немногое, что шпиону положено знать: без неё блефовать невозможно,
    // а с ней у него есть шанс попасть в тон (это и есть его «задание»).
    const cell = gameState.state.activeCell;
    const topic = cell ? gameState.state.board?.[cell.catIdx]?.category || null : null;
    gameState.setPrivateReveal(impId,
      { kind: 'imposter', topic },
      { kind: 'imposter_host', imposterName: impName, topic }, io);
  }

  handleAction(gameState, action, data, { io, socket, user }) {
    if (action === 'player:submitTextAnswer') {
      gameState.state.textAnswers[user.id] = data.text;
      // Все сдали — сразу обсуждение, без лишнего клика ведущего
      if (this.everyoneAnswered(gameState)) return this.startDiscussion(gameState, io);
      gameState.broadcast(io);
    } else if (action === 'host:revealTextAnswers' || action === 'host:startAmongUsTimer') {
      // Ведущий форсирует переход (кто-то завис). Оба события ведут в одно место:
      // отдельной фазы проверки у шпиона нет.
      this.startDiscussion(gameState, io);
    } else if (action === 'host:pauseAmongUsTimer') {
      gameState.state.amongUsTimerState = { status: 'paused', timeLeft: data.timeLeft };
      if (gameState.timers.amongUsAuto) { clearTimeout(gameState.timers.amongUsAuto); delete gameState.timers.amongUsAuto; }
      gameState.broadcast(io);
    } else if (action === 'host:resumeAmongUsTimer') {
      gameState.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + data.timeLeft * 1000, timeLeft: data.timeLeft };
      if (gameState.timers.amongUsAuto) clearTimeout(gameState.timers.amongUsAuto);
      gameState.timers.amongUsAuto = setTimeout(() => this.revealAmongUs(gameState, io), data.timeLeft * 1000);
      gameState.broadcast(io);
    } else if (action === 'player:voteAmongUs') {
      if (gameState.state.questionStatus !== 'among_us_voting') return;
      if (!gameState.state.amongUsVotes) gameState.state.amongUsVotes = {};
      gameState.state.amongUsVotes[user.id] = data;
      gameState.broadcast(io);
    } else if (action === 'host:revealAmongUs') {
      this.revealAmongUs(gameState, io);
    }
  }

  // Отключившиеся не блокируют переход; если отвалились все — ждём ведущего
  everyoneAnswered(gameState) {
    const conn = gameState.state.players.filter(p => p.connected);
    if (!conn.length) return false;
    return conn.every(p => gameState.state.textAnswers[p.id] != null);
  }

  startDiscussion(gameState, io) {
    if (gameState.state.questionStatus === 'among_us_voting') return;
    gameState.state.questionStatus = 'among_us_voting';
    gameState.state.amongUsVotes = {};
    gameState.state.amongUsTimerState = { status: 'running', endsAt: Date.now() + DISCUSSION_MS, timeLeft: DISCUSSION_MS / 1000 };
    // Авто-вскрытие по истечении времени, чтобы голосование не зависало навсегда
    if (gameState.timers.amongUsAuto) clearTimeout(gameState.timers.amongUsAuto);
    gameState.timers.amongUsAuto = setTimeout(() => this.revealAmongUs(gameState, io), DISCUSSION_MS);
    gameState.addLog('Ответы на столе — обсуждайте! Кто из них блефовал?', 'warning');
    gameState.broadcast(io);
  }

  revealAmongUs(gameState, io) {
    if (gameState.state.amongUsResult) return;

    // Фолбэк на state.imposterId — обратная совместимость (тесты/старые сейвы)
    const imposterId = gameState._priv.imposterId ?? gameState.state.imposterId;
    const votes = gameState.state.amongUsVotes || {};
    const q = gameState.getCurrentQuestion();
    if (!q) return;

    // String-сравнения: voter — ключ объекта (строка), imposterId/target — числовые id
    const same = (a, b) => String(a) === String(b);
    const validPlayersCount = Object.keys(gameState.state.textAnswers).length || gameState.state.players.length;
    let imposterVotes = 0;
    Object.values(votes).forEach(vote => { if (same(vote, imposterId)) imposterVotes++; });

    if (imposterVotes >= Math.ceil(validPlayersCount / 2)) {
       gameState.state.amongUsResult = 'crew_win';
       gameState.adjustScore(imposterId, -q.points * 2);
       for (const [voter, target] of Object.entries(votes)) {
         if (same(target, imposterId) && !same(voter, imposterId)) gameState.adjustScore(voter, q.points);
       }
       gameState.addLog(`Мирные победили! Шпион ${gameState.state.players.find(p => same(p.id, imposterId))?.name} разоблачен.`, 'success');
    } else {
       gameState.state.amongUsResult = 'imposter_win';
       gameState.adjustScore(imposterId, q.points * 2);
       for (const [voter, target] of Object.entries(votes)) {
         if (!same(voter, imposterId)) gameState.adjustScore(voter, -q.points);
       }
       gameState.addLog(`Шпион победил! Им был ${gameState.state.players.find(p => same(p.id, imposterId))?.name}.`, 'error');
    }

    gameState.state.imposterId = imposterId; // теперь можно публиковать (бейдж «ШПИОН»)
    gameState.state.showAnswer = true;
    gameState.clearTimers();
    gameState.broadcast(io);
  }
}

module.exports = AmongUsHandler;
