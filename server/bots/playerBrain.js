const { jitter, pick, between } = require('./rng');
const { WRONG_ANSWERS, IMPOSTER_HEDGES, WHOSAID_PHRASES, SKETCHES } = require('./canned');

// Боты-игроки. Правило по информации: бот пользуется тем же, что видит человек на его месте —
// разосланным стейтом и СВОИМ приватным показом. Приватный показ по сети до фейк-сокета не
// доходит (io.to('bot:p1') — несуществующая комната), поэтому читаем его эквивалент из
// room.privateReveal / room._priv напрямую. Это не читерство.
//
// Три осознанных исключения, где честность даёт бессмысленный шум вместо проверки механики:
//   • reaction  — иначе раунд превращается в случайный тык и тестер ничего не увидит;
//   • number    — иначе таблица «кто ближе» это мусор, а не правдоподобный разброс;
//   • among_us  — иначе шпиона никогда не находят и половина механики не отыгрывается.
// Не читерят: «кто сказал» (там угадывание и есть механика), тир-лист, камень-ножницы.

const MS_DAY = 86400000;

function myTurnToPick(st, bot) {
  return st.selectingPlayerId != null && String(st.selectingPlayerId) === String(bot.id);
}

function freeCells(st) {
  const out = [];
  (st.board || []).forEach((cat, catIdx) => {
    (cat.questions || []).forEach((q, qIdx) => { if (!q.answered) out.push({ catIdx, qIdx }); });
  });
  return out;
}

function otherPlayers(st, bot) {
  return st.players.filter(p => String(p.id) !== String(bot.id));
}

// Правдоподобная догадка вокруг цели: чем ниже skill, тем шире промах
function numberGuess(rnd, kind, target, skill) {
  const spread = 1 - skill;
  if (target == null) return kind === 'date' ? '2000-01-01' : String(between(rnd, 1, 100));
  if (kind === 'date') {
    const off = Math.round((rnd() * 2 - 1) * spread * 900) * MS_DAY;
    return new Date(target + off).toISOString().slice(0, 10);
  }
  const factor = 1 + (rnd() * 2 - 1) * spread * 0.35;
  const v = Math.round(target * factor);
  return String(kind === 'year' ? v : v);
}

function plan(ctx, bot) {
  const { st, q, cell, act, fire, rnd, room, driver, once } = ctx;
  if (!st.gameStarted) return [];

  const id = bot.id;
  const sid = String(id);
  const d = (base) => Math.round(jitter(rnd, base) * bot.speed);
  const me = (name, base, run, extra) => act(id, name, d(base), run, extra);
  const send = (ev, payload) => () => fire(id, ev, payload);
  const out = [];

  // --- Доска: бот с правом выбора подсвечивает ячейку, ведущий подтверждает ---------
  if (!cell) {
    if (myTurnToPick(st, bot) && !st.highlightedQuestion && freeCells(st).length) {
      // Ячейку выбираем ВНУТРИ run: иначе каждый пересчёт плана давал бы новый ключ
      // и таймер бесконечно перезаводился бы с новой целью
      out.push(me('highlight', 3200, () => {
        const target = pick(rnd, freeCells(st));
        if (target) fire(id, 'player:highlightQuestion', target);
      }));
    }
    return out;
  }

  const s = st.questionStatus;
  const isImposter = String(room._priv?.imposterId ?? '') === sid;
  // Знает ли бот ответ на ЭТУ ячейку — решаем один раз, чтобы перезвон таймеров не
  // менял решение на полпути
  const knows = once(`knows:${sid}`, () => rnd() < bot.skill);

  switch (s) {
    case 'buzzer_active': {
      if (!st.buzzerReceiving) break;
      if ((st.failedPlayers || []).some(x => String(x) === sid)) break;
      if ((st.buzzerResults || []).some(r => String(r.playerId) === sid)) break;
      const skip = once(`skip:${sid}`, () => !knows && rnd() < 0.5);
      if (skip) break;                              // не знает и не рискует — молчит
      const rt = once(`rt:${sid}`, () => {
        if (q?.glitch) return Math.round(2500 + rnd() * 3500); // расшифровать глитч дольше
        return Math.round(knows ? 380 + rnd() * 700 : 1400 + rnd() * 1300);
      });
      // Задержка = реальному времени реакции: серверный анти-чит клампит по тому же окну
      out.push(act(id, 'buzz', Math.round(rt * bot.speed), () => {
        driver.beliefs[sid] = knows ? 0.9 : 0.25;   // по этому ведущий-бот и судит
        fire(id, 'player:pressBuzzer', { reactionTime: rt });
      }));
      break;
    }

    case 'text_inputting': {
      if (st.textAnswers[id] != null) break;
      if (q?.type === 'among_us') {
        // Шпион вопроса не видит и вынужден блефовать по теме категории
        const text = isImposter
          ? pick(rnd, IMPOSTER_HEDGES)
          : (knows && q?.a ? String(q.a) : pick(rnd, WRONG_ANSWERS));
        out.push(me('answerSpy', 5000, send('player:submitTextAnswer', { text })));
        break;
      }
      const tie = st.auctionTiePlayers || [];
      if (tie.length && !tie.some(x => String(x) === sid)) break; // тай-брейк не для всех
      const text = knows && q?.a ? String(q.a) : pick(rnd, WRONG_ANSWERS);
      out.push(me('answerText', 4200, send('player:submitTextAnswer', { text })));
      break;
    }

    case 'auction_bidding': {
      if (st.auctionBets[id] != null) break;
      const points = Number(q?.points) || 100;
      const seat = st.players.find(p => String(p.id) === sid);
      const balance = seat?.score || 0;
      const maxAllowed = balance <= 0 ? points : balance;
      const wish = Math.round(points * (knows ? 0.6 + rnd() * 0.6 : 0.2 + rnd() * 0.4));
      const bet = Math.min(maxAllowed, Math.max(1, wish));
      out.push(me('bid', 5000, send('player:submitAuctionBet', { betAmount: bet })));
      break;
    }

    case 'sketch_drawing': {
      if (st.sketchAnswers[id] != null) break;
      const art = once(`art:${sid}`, () => pick(rnd, SKETCHES));
      out.push(me('draw', 9000, send('player:submitSketch', { dataUrl: art })));
      break;
    }

    case 'sketch_judging': {
      if (st.sketchVotes[id] != null) break;
      const drawn = Object.keys(st.sketchAnswers || {}).filter(x => x !== sid);
      if (!drawn.length) break;
      out.push(me('voteSketch', 4500, () => fire(id, 'player:voteSketch', pick(rnd, drawn))));
      break;
    }

    case 'among_us_voting': {
      if (st.amongUsVotes[id] != null) break;
      const others = otherPlayers(st, bot);
      if (!others.length) break;
      const realSpy = room._priv?.imposterId;
      out.push(me('voteSpy', 12000, () => {
        // Шпион голосует «не в себя», остальные попадают в него с вероятностью skill
        const hit = !isImposter && realSpy != null && String(realSpy) !== sid && rnd() < bot.skill;
        const target = hit ? realSpy : pick(rnd, others)?.id;
        if (target != null) fire(id, 'player:voteAmongUs', target);
      }));
      break;
    }

    case 'rps_picking': {
      const ds = st.duelState;
      if (!ds || ds.revealed || ds.aId == null || ds.bId == null) break;
      if (String(ds.aId) !== sid && String(ds.bId) !== sid) break;
      if (room.sealed[sid]) break;               // уже выбрал (ничья снова обнулит — переиграем)
      out.push(me('rps', 2500, () => {
        fire(id, 'player:rpsPick', { choice: pick(rnd, ['rock', 'paper', 'scissors']) });
      }));
      break;
    }

    case 'number_inputting': {
      if (st.numberGuesses[sid]) break;
      const value = numberGuess(rnd, q?.numberKind, room._priv?.numberTarget, bot.skill);
      out.push(me('number', 7000, send('player:submitNumber', { value })));
      break;
    }

    case 'tier_rating': {
      if ((st.tierSubmitted || []).includes(sid)) break;
      const items = Array.isArray(q?.items) ? q.items : [];
      if (!items.length) break;
      const ratings = {};
      // Сумма двух равномерных → колокол вокруг 5.5: медианы получаются осмысленными
      items.forEach((_, i) => {
        ratings[i] = Math.min(10, Math.max(1, Math.round(5.5 + (rnd() + rnd() - 1) * 3)));
      });
      out.push(me('tier', 8000, send('player:submitTier', { ratings })));
      break;
    }

    case 'whosaid_collecting': {
      if (room.sealed[sid]) break;
      const text = once(`phrase:${sid}`, () => pick(rnd, WHOSAID_PHRASES));
      out.push(me('whosaid', 6500, send('player:submitWhoSaid', { text })));
      break;
    }

    case 'whosaid_guessing': {
      if (room.sealed[sid]) break;
      const answers = st.whoSaidAnswers || [];
      if (!answers.length) break;
      out.push(me('guessAuthor', 8000, () => {
        const guesses = {};
        for (const a of answers) {
          const cand = pick(rnd, st.players);
          if (cand) guesses[a.idx] = cand.id;
        }
        fire(id, 'player:guessAuthor', { guesses });
      }));
      break;
    }

    case 'reaction_active': {
      if (!st.reactionGrid || st.reactionDone) break;
      if (room.sealed[sid]) break;               // уже промахнулся — заблокирован
      const answer = room._priv?.reactionAnswer;
      out.push(me('tap', 1300, () => {
        const total = (st.reactionGrid || []).length || 9;
        let idx;
        if (rnd() < bot.skill && answer != null) idx = answer;
        else {
          const wrong = Array.from({ length: total }, (_, i) => i).filter(i => i !== answer);
          idx = pick(rnd, wrong.length ? wrong : [0]);
        }
        fire(id, 'player:tapTarget', { idx });
      }));
      break;
    }
  }

  return out;
}

module.exports = { plan, numberGuess, freeCells };
