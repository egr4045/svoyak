const { jitter, pick, between } = require('./rng');
const { answersMatch } = require('./judge');

const HOST = 'bot:host';

// Ведущий-бот: зеркало HostPanel.vue (`primary` и `isResolved`) на сервере.
// Работает только когда тестер занял место ИГРОКА — иначе ведущий живой и брать управление
// нельзя. Судить голосовой ответ бот не умеет физически, поэтому:
//   • отвечает бот  → судим по его же «вере» в ответ (записана при нажатии баззера);
//   • отвечает тестер → бросаем монетку с перевесом в его пользу, «послушав» пару секунд.
const TESTER_CORRECT_P = 0.7;

// Статусы, где ход делает СЕРВЕР по своему таймеру — ведущему там делать нечего
const SERVER_DRIVEN = new Set(['buzzer_countdown', 'buzzer_results', 'cat_roulette']);

const seated = (st) => st.players;
const connected = (st) => {
  const c = st.players.filter(p => p.connected);
  return c.length ? c : st.players;
};
const nameOf = (st, id) => st.players.find(p => String(p.id) === String(id))?.name || '—';

// Все ли из ожидаемых сдали ответ (отключившиеся не блокируют)
function allDone(list, has) {
  return list.length > 0 && list.every(p => has(p));
}

function unansweredCells(st) {
  const out = [];
  (st.board || []).forEach((cat, catIdx) => {
    (cat.questions || []).forEach((q, qIdx) => {
      if (!q.answered) out.push({ catIdx, qIdx });
    });
  });
  return out;
}

function plan(ctx) {
  const { st, q, cell, act, fire, rnd, driver, testerId } = ctx;
  if (!st.gameStarted) return [];           // «Начать» жмёт тестер, не бот

  const d = (base) => jitter(rnd, base);
  const host = (name, base, run, extra) => act(HOST, name, d(base), run, extra);
  const send = (ev, payload) => () => fire(HOST, ev, payload);
  const close = (base) => host('close', base, send('host:closeQuestion'));

  if (st.questionStatus === 'game_over') {
    if (driver.celebrated) return [];
    return [host('celebrate', 1200, () => {
      driver.celebrated = true;
      fire(HOST, 'host:triggerEffect', { effect: 'confetti' });
    })];
  }

  if (st.questionStatus === 'showing_round_splash') {
    return [host('startRound', 3800, send('host:startRound'))];
  }

  // --- Доска ---------------------------------------------------------------
  if (!cell) {
    const free = unansweredCells(st);
    if (!free.length) return [host('nextRound', 2800, send('host:nextRound'))];

    const hl = st.highlightedQuestion;
    const hlFree = hl && free.some(c => c.catIdx === hl.catIdx && c.qIdx === hl.qIdx);
    if (hlFree) {
      // Кто-то (тестер или бот с правом выбора) подсветил ячейку — подтверждаем его выбор
      return [host('pick', 1500, send('host:selectQuestion', { catIdx: hl.catIdx, qIdx: hl.qIdx }),
        `${hl.catIdx}.${hl.qIdx}`)];
    }
    // Выбирает живой тестер — даём ему подумать, но не ждём вечно
    const waiting = st.selectingPlayerId != null && String(st.selectingPlayerId) === String(testerId);
    // Ячейку тянем ВНУТРИ run: положить случайный выбор в ключ — значит гарантированно
    // промахнуться мимо самого себя при перепроверке в run() и никогда не сходить
    return [host('pick', waiting ? 20000 : 2500, () => {
      const target = pick(rnd, unansweredCells(st));
      if (target) fire(HOST, 'host:selectQuestion', { catIdx: target.catIdx, qIdx: target.qIdx });
    })];
  }

  // --- Вопрос отыгран (зеркало HostPanel.isResolved) -----------------------
  const s = st.questionStatus;
  const resolved = s === 'idle'
    || s === 'number_results' || s === 'tier_results' || s === 'whosaid_results'
    || (s === 'reaction_active' && st.reactionDone)
    || (s === 'among_us_voting' && st.amongUsResult)
    || (s === 'rps_picking' && st.duelState?.revealed);
  if (resolved) return [close(s === 'idle' ? 3200 : 5000)];

  const out = [];
  switch (s) {
    case 'reading':
      out.push(host('buzzer', 4800, send('host:startBuzzer')));
      break;

    case 'buzzer_active':
      // Никто не жмёт — вопрос надо закрыть, иначе комната встанет
      if (!(st.buzzerResults || []).length) {
        out.push(host('nobody', 12000, send('host:closeQuestion')));
      }
      break;

    case 'answering': {
      const answerer = st.answeringPlayerId;
      const isTester = String(answerer) === String(testerId);
      const belief = isTester ? TESTER_CORRECT_P : (driver.beliefs[String(answerer)] ?? 0.5);
      out.push(host('judge', isTester ? 5500 : 3500, () => {
        fire(HOST, rnd() < belief ? 'host:correctAnswer' : 'host:wrongAnswer');
      }, String(answerer)));
      break;
    }

    case 'text_inputting': {
      if (q?.type === 'among_us') {
        // Шпион: как только ответили все, хендлер сам уводит в обсуждение. Кнопка — только
        // чтобы не ждать зависшего (обычно тестера).
        out.push(host('forceDiscussion', 30000, send('host:revealTextAnswers')));
        break;
      }
      const tie = st.auctionTiePlayers || [];
      const expect = tie.length
        ? st.players.filter(p => tie.some(id => String(id) === String(p.id)))
        : connected(st);
      const ready = allDone(expect, p => st.textAnswers[p.id] != null);
      out.push(host('revealText', ready ? 1400 : 25000, send('host:revealTextAnswers')));
      break;
    }

    case 'text_judging': {
      const entries = Object.entries(st.textAnswers || {});
      if (!entries.length) { out.push(close(1600)); break; }
      const [playerId, text] = entries[0];
      out.push(host('judgeText', 1400, () => {
        fire(HOST, 'host:judgeSingleTextAnswer', { playerId, isCorrect: answersMatch(text, q?.a) });
      }, playerId));
      break;
    }

    case 'auction_bidding': {
      // Без единой ставки revealAuctionBets молча выходит — тогда действия нет,
      // и вопрос закроет общий предохранитель в конце
      const bets = Object.keys(st.auctionBets || {}).length;
      if (!bets) break;
      const ready = allDone(connected(st), p => st.auctionBets[p.id] != null);
      out.push(host('revealBets', ready ? 1500 : 20000, send('host:revealAuctionBets')));
      break;
    }

    case 'cat_target_selection':
      out.push(host('roulette', 3000, send('host:rouletteCatPlayer')));
      break;

    case 'snippet_playing': {
      // Сколько раз открывать фрагмент — решаем один раз на вопрос
      const target = ctx.once('snippetSteps', () => between(rnd, 1, 3));
      const level = st.snippetLevel || 0;
      if (level < target) {
        // Дискриминатор обязателен: без snippetLevel ключ не менялся бы и действие зациклилось
        out.push(host('revealMore', 5000, send('host:revealMore'), String(level)));
      } else {
        out.push(host('buzzer', 3000, send('host:startBuzzer'), String(level)));
      }
      break;
    }

    case 'performer_select':
      // Исполнителя тоже выбираем внутри run (см. комментарий у 'pick'): чередуем, чтобы
      // роль не доставалась одному и тому же и тестер тоже успел показать
      out.push(host('setPerformer', 3200, () => {
        const pool = connected(st);
        const fresh = pool.filter(p => String(p.id) !== String(driver.lastPerformerId));
        const target = pick(rnd, fresh.length ? fresh : pool);
        if (!target) return;
        driver.lastPerformerId = target.id;
        fire(HOST, 'host:setPerformer', target.id);
      }));
      break;

    case 'performing': {
      const others = st.players.filter(p => String(p.id) !== String(st.performerId));
      const guesser = pick(rnd, others);
      out.push(host('resolveShow', 11000, () => {
        if (guesser && rnd() < 0.7) fire(HOST, 'host:awardGuess', guesser.id);
        else fire(HOST, 'host:passQuestion');
      }));
      break;
    }

    case 'alias_playing': {
      const others = st.players.filter(p => String(p.id) !== String(st.performerId));
      const guesser = pick(rnd, others);
      const idx = st.aliasState?.index ?? 0;
      out.push(host('aliasStep', 4500, () => {
        if (guesser && rnd() < 0.65) fire(HOST, 'host:aliasGuessed', guesser.id);
        else fire(HOST, 'host:aliasSkip');
      }, String(idx)));
      break;
    }

    case 'number_inputting': {
      const ready = allDone(connected(st), p => st.numberGuesses[String(p.id)]);
      out.push(host('revealNumber', ready ? 1500 : 20000, send('host:revealNumber')));
      break;
    }

    case 'tier_rating': {
      const ready = allDone(connected(st), p => (st.tierSubmitted || []).includes(String(p.id)));
      out.push(host('revealTier', ready ? 1500 : 25000, send('host:revealTier')));
      break;
    }

    case 'whosaid_collecting': {
      const ready = (st.whoSaidCount || 0) >= connected(st).length;
      out.push(host('revealWhoSaid', ready ? 1500 : 25000, send('host:revealWhoSaid')));
      break;
    }

    case 'whosaid_guessing': {
      const ready = (st.whoSaidCount || 0) >= connected(st).length;
      out.push(host('scoreWhoSaid', ready ? 1500 : 30000, send('host:scoreWhoSaid')));
      break;
    }

    case 'among_us_voting': {
      const ready = allDone(connected(st), p => st.amongUsVotes[p.id] != null);
      out.push(host('revealSpy', ready ? 2000 : 45000, send('host:revealAmongUs')));
      break;
    }

    case 'sketch_drawing': {
      const ready = allDone(connected(st), p => st.sketchAnswers[p.id] != null);
      out.push(host('revealSketches', ready ? 1800 : 30000, send('host:revealSketches')));
      break;
    }

    case 'sketch_judging': {
      const drawn = Object.keys(st.sketchAnswers || {});
      if (!drawn.length) { out.push(close(2000)); break; }
      const tally = {};
      for (const target of Object.values(st.sketchVotes || {})) {
        tally[String(target)] = (tally[String(target)] || 0) + 1;
      }
      let best = drawn[0];
      for (const id of drawn) if ((tally[id] || 0) > (tally[best] || 0)) best = id;
      // Награждать сразу нельзя: awardSketchWinner тут же закрывает вопрос, и голосование
      // не успело бы отыграться вообще ни разу
      const voted = allDone(connected(st), p => st.sketchVotes[p.id] != null);
      out.push(host('award', voted ? 2500 : 15000, send('host:awardSketchWinner', best), best));
      break;
    }

    case 'potato_playing':
      // Дискриминатор — держатель + шипение: иначе один пас вооружился бы повторно
      out.push(host('pass', st.potatoFizzing ? 900 : 4000, send('host:passPotato'),
        `${st.potatoTurnId}.${st.potatoFizzing ? 'fizz' : 'calm'}`));
      break;

    case 'reaction_active':
      // Сервер сам финиширует раунд по дедлайну; это страховка на случай, что не финишировал
      out.push(host('endReaction', 16000, send('host:endReaction')));
      break;

    case 'rps_picking': {
      const ds = st.duelState || {};
      const slots = `${ds.aId ?? '-'}.${ds.bId ?? '-'}`;
      // Дуэлянт может и не выбрать (обычно это живой тестер, которому не до того).
      // Тогда одна пересдача на ботов — механика всё равно отыграется, а не закроется впустую.
      const retry = ctx.once('duelRetry', () => ({ used: false }));

      if (ds.aId == null || ds.bId == null) {
        out.push(host('setDuel', ds.aId == null ? 2500 : 1300, () => {
          const taken = [ds.aId, ds.bId].filter(v => v != null).map(String);
          let pool = connected(st).filter(p => !taken.includes(String(p.id)));
          if (retry.used) {
            const bots = pool.filter(p => p.isBot);
            if (bots.length) pool = bots;
          }
          const target = pick(rnd, pool);
          if (target) fire(HOST, 'host:setDuel', target.id);
        }, slots));
      } else if (ds.aReady && ds.bReady && !ds.revealed) {
        out.push(host('revealDuel', 2500, send('host:revealDuel')));
      } else if (!ds.revealed && !retry.used) {
        out.push(host('duelReset', 20000, () => {
          retry.used = true;
          fire(HOST, 'host:setDuel', null); // сброс дуэлянтов — дальше выберем ботов
        }, slots));
      } else if (!ds.revealed) {
        out.push(host('duelTimeout', 20000, send('host:closeQuestion'), slots));
      }
      break;
    }
  }

  // Общий предохранитель: ни одно правило не сработало, а ячейка открыта. Именно эта строка
  // гарантирует, что машина из 30 статусов не встанет насмерть (см. tests/bots/fullGame).
  if (!out.length && !SERVER_DRIVEN.has(s)) {
    out.push(host('stuck', 25000, send('host:closeQuestion')));
  }
  return out;
}

module.exports = { plan, HOST, SERVER_DRIVEN, unansweredCells, nameOf, seated };
