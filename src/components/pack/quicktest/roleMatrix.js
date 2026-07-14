// Чертёж «Быстрого теста»: для каждого типа вопроса — список ролей, список фаз (со статусом
// questionStatus) и seed(), который досыпает в мок-стор поля, нужные компоненту в этой фазе.
// Секрет (слово/реф/ответ) кладём в patch._secret; видимость по ролям решает applyIdentity.

const AVATARS = ['🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🐧']
const NAMES = ['Аня', 'Боря', 'Вика', 'Гена', 'Дима', 'Катя', 'Лёва', 'Маша']

export function fakePlayers(n = 3) {
  const count = Math.max(2, Math.min(8, n))
  return Array.from({ length: count }, (_, i) => ({
    id: 'P' + (i + 1),
    name: NAMES[i] || ('Игрок ' + (i + 1)),
    avatar: AVATARS[i % AVATARS.length],
    platformId: 'pf_P' + (i + 1),
    score: 500,
    connected: true,
    socketId: 'sock-P' + (i + 1),
    loadedAssets: true
  }))
}
export const HOST = { id: 'H', username: 'Ведущий', name: 'Ведущий', avatar: '🎬', socketId: 'sock-H', connected: true, platformId: 'pf_H' }

// Маленькая картинка-заглушка для скетчей
const SKETCH_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="45" r="24" fill="none" stroke="#333" stroke-width="3"/><path d="M35 70 Q50 82 65 70" fill="none" stroke="#333" stroke-width="3"/></svg>')

function reactionGrid() {
  const COLORS = [['green', '#49a05a'], ['red', '#e0524a'], ['blue', '#3da9fc'], ['yellow', '#e8c24a']]
  const cells = ['А', '7', '■', 'B', '3', '★', 'К', '9', '●']
  const kinds = ['letter', 'digit', 'shape', 'letter', 'digit', 'shape', 'letter', 'digit', 'shape']
  return cells.map((char, i) => {
    const [color, hex] = COLORS[i % COLORS.length]
    return { char, color, hex, kind: kinds[i] }
  })
}

// Общий скелет фаз для «баззерных» типов
const BUZZER_PHASES = [
  { status: 'reading', label: 'чтение' },
  { status: 'buzzer_active', label: 'баззер' },
  { status: 'buzzer_results', label: 'результаты' },
  { status: 'answering', label: 'ответ' }
]
function buzzerSeed(patch, phase, ps) {
  if (phase.status === 'buzzer_results' || phase.status === 'answering') {
    patch.buzzerResults = [
      { playerId: ps[1].id, time: 412 },
      { playerId: ps[0].id, time: 530 },
      { playerId: ps[2] ? ps[2].id : ps[0].id, time: 690 }
    ]
  }
  if (phase.status === 'answering') patch.answeringPlayerId = ps[1].id
}

// TYPES[type] = { roles:[...], phases:[{status,label,tag?}], seed(patch,{phase,question,players}) }
export const TYPES = {
  text: { roles: ['host', 'answering', 'player', 'spectator'], phases: BUZZER_PHASES, seed: (p, { phase, players }) => buzzerSeed(p, phase, players) },
  media: { roles: ['host', 'answering', 'player', 'spectator'], phases: [{ status: 'reading', label: 'медиа' }, ...BUZZER_PHASES.slice(1)], seed: (p, { phase, players }) => { p.mediaState = { status: phase.status === 'reading' ? 'playing' : 'stopped', currentTime: 0 }; buzzerSeed(p, phase, players) } },
  text_input: {
    roles: ['host', 'answering', 'player', 'spectator'],
    phases: [{ status: 'text_inputting', label: 'ввод' }, { status: 'text_judging', label: 'проверка' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'text_judging') p.textAnswers = { [players[0].id]: 'Ответ Ани', [players[1].id]: 'Ответ Бори' }
      else p.textAnswers = { [players[0].id]: 'Ответ Ани' }
    }
  },
  glitch: { roles: ['host', 'answering', 'player', 'spectator'], phases: BUZZER_PHASES, seed: (p, { phase, players }) => { p.glitchSeed = 42; buzzerSeed(p, phase, players) } },
  poker: {
    roles: ['host', 'pokerActive', 'player', 'spectator'],
    phases: [{ status: 'poker_bidding', label: 'ставки' }, { status: 'text_inputting', label: 'ответ банка' }],
    seed: (p, { phase, players }) => {
      const ids = players.map(x => x.id)
      if (phase.status === 'poker_bidding') { p.pokerActivePlayers = ids; p.pokerBets = { [ids[0]]: 100 }; p.pokerCurrentBet = 100; p.pokerTurnIdx = 1; p.pokerPlayersActed = [ids[0]] }
      else { p.pokerActivePlayers = [ids[0]]; p.activeBet = 300 }
    }
  },
  among_us: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'text_inputting', label: 'ввод' }, { status: 'text_judging', label: 'проверка' }, { status: 'among_us_voting', label: 'голосование' }, { status: 'among_us_voting', label: 'итог', tag: 'result' }],
    seed: (p, { phase, question, players }) => {
      p.imposterId = players[1].id
      if (phase.status === 'text_judging') p.textAnswers = { [players[0].id]: 'Ответ Ани', [players[1].id]: 'Ответ Бори' }
      if (phase.tag === 'result') { p.amongUsResult = 'crew_win'; p.showAnswer = true; p.amongUsVotes = { [players[0].id]: players[1].id, [players[2] ? players[2].id : players[0].id]: players[1].id } }
      else if (phase.status === 'among_us_voting') { p.amongUsTimerState = { status: 'running', endsAt: Date.now() + 120000, timeLeft: 120 }; p.amongUsVotes = { [players[0].id]: players[1].id } }
    }
  },
  sketch: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'sketch_drawing', label: 'рисуют' }, { status: 'sketch_judging', label: 'оценка' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'sketch_judging') { p.sketchAnswers = { [players[0].id]: SKETCH_IMG, [players[1].id]: SKETCH_IMG }; p.sketchVotes = { [players[2] ? players[2].id : players[1].id]: players[0].id } }
    }
  },
  auction: {
    roles: ['host', 'answering', 'player', 'spectator'],
    phases: [{ status: 'auction_bidding', label: 'торги' }, { status: 'answering', label: 'ответ' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'auction_bidding') p.auctionBets = { [players[0].id]: 200, [players[1].id]: 400 }
      else { p.answeringPlayerId = players[1].id; p.activeBet = 400 }
    }
  },
  cat: {
    roles: ['host', 'answering', 'player', 'spectator'],
    phases: [{ status: 'cat_target_selection', label: 'выбор жертвы' }, { status: 'cat_roulette', label: 'рулетка' }, { status: 'answering', label: 'ответ' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'cat_roulette') p.catTargetId = players[1].id
      if (phase.status === 'answering') { p.catTargetId = players[1].id; p.answeringPlayerId = players[1].id }
    }
  },
  charades: {
    roles: ['host', 'performer', 'player', 'spectator'],
    phases: [{ status: 'performer_select', label: 'выбор' }, { status: 'performing', label: 'показ' }, { status: 'idle', label: 'итог', tag: 'result' }],
    seed: (p, { phase, question, players }) => {
      p.performerId = players[0].id
      if (phase.status === 'performing') p._secret = { kind: 'charades', text: question.a || 'ЖИРАФ', prompt: question.q || '' }
      if (phase.tag === 'result') p.performResult = { guesserId: players[1].id, performerId: players[0].id, answer: question.a || 'ЖИРАФ' }
    }
  },
  karaoke: {
    roles: ['host', 'performer', 'player', 'spectator'],
    phases: [{ status: 'performer_select', label: 'выбор' }, { status: 'performing', label: 'исполнение' }, { status: 'idle', label: 'итог', tag: 'result' }],
    seed: (p, { phase, question, players }) => {
      p.performerId = players[0].id
      if (phase.status === 'performing') p._secret = { kind: 'karaoke', text: question.a || 'Песня', prompt: question.q || '', mediaSrc: question.mediaSrc || null, mediaType: question.mediaType || null }
      if (phase.tag === 'result') p.performResult = { guesserId: players[1].id, performerId: players[0].id, answer: question.a || 'Песня' }
    }
  },
  alias: {
    roles: ['host', 'performer', 'player', 'spectator'],
    phases: [{ status: 'performer_select', label: 'выбор' }, { status: 'alias_playing', label: 'объяснение' }, { status: 'idle', label: 'итог', tag: 'result' }],
    seed: (p, { phase, question, players }) => {
      p.performerId = players[0].id
      const words = (question.words || []).filter(w => w && String(w).trim())
      const total = words.length || 5
      if (phase.status === 'alias_playing') { p.aliasState = { index: 1, total, guessedCount: 1, timerSec: question.timerSec || 60, endsAt: Date.now() + (question.timerSec || 60) * 1000, wordPoints: 50 }; p._secret = { kind: 'alias', text: words[1] || 'СЛОВО', index: 1, total } }
      if (phase.tag === 'result') p.aliasResult = { guessed: Math.min(3, total), total }
    }
  },
  snippet: {
    roles: ['host', 'answering', 'player', 'spectator'],
    phases: [{ status: 'snippet_playing', label: 'фрагмент' }, { status: 'buzzer_active', label: 'баззер' }, { status: 'answering', label: 'ответ' }],
    seed: (p, { phase, question, players }) => {
      const pts = question.points || 400
      if (phase.status === 'snippet_playing') { p.snippetLevel = 1; p.activeBet = Math.round(pts * 0.8) }
      if (phase.status === 'buzzer_active') { p.snippetLevel = 1; p.activeBet = Math.round(pts * 0.8); buzzerSeed(p, phase, players) }
      if (phase.status === 'answering') { p.activeBet = Math.round(pts * 0.8); p.answeringPlayerId = players[1].id }
    }
  },
  rps: {
    roles: ['host', 'duelistA', 'player', 'spectator'],
    phases: [{ status: 'rps_picking', label: 'выбор дуэлянтов', tag: 'pick' }, { status: 'rps_picking', label: 'делают выбор', tag: 'play' }, { status: 'rps_picking', label: 'вскрытие', tag: 'reveal' }],
    seed: (p, { phase, players }) => {
      const a = players[0].id, b = players[1].id
      if (phase.tag === 'pick') p.duelState = { aId: null, bId: null, aReady: false, bReady: false, revealed: false, aPick: null, bPick: null, winnerId: null, tie: false }
      else if (phase.tag === 'play') p.duelState = { aId: a, bId: b, aReady: true, bReady: false, revealed: false, aPick: null, bPick: null, winnerId: null, tie: false }
      else p.duelState = { aId: a, bId: b, aReady: true, bReady: true, revealed: true, aPick: 'rock', bPick: 'scissors', winnerId: a, tie: false }
    }
  },
  number: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'number_inputting', label: 'ввод' }, { status: 'number_results', label: 'итоги' }],
    seed: (p, { phase, question, players }) => {
      if (phase.status === 'number_inputting') p.numberGuesses = { [players[0].id]: true, [players[1].id]: true }
      else p.numberReveal = { kind: question.numberKind || 'number', answer: question.a || '1969', ranked: [{ id: players[1].id, name: players[1].name, raw: '1968', num: 1968, diff: 1 }, { id: players[0].id, name: players[0].name, raw: '1975', num: 1975, diff: 6 }], winnerId: players[1].id }
    }
  },
  tierlist: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'tier_rating', label: 'оценка' }, { status: 'tier_results', label: 'итоги' }],
    seed: (p, { phase, question, players }) => {
      const items = (question.items && question.items.length ? question.items : [{ label: 'Объект A' }, { label: 'Объект B' }])
      if (phase.status === 'tier_rating') p.tierSubmitted = [players[1].id]
      else {
        const medians = items.map((_, i) => 5 + (i % 3))
        p.tierMedians = medians
        p.tierResults = {
          items: items.map((it, i) => ({ label: it.label || `#${i + 1}`, mediaSrc: it.mediaSrc || null, mediaType: it.mediaType || null, median: medians[i] })),
          ratings: { [players[0].id]: Object.fromEntries(items.map((_, i) => [i, medians[i]])) },
          scores: { [players[0].id]: 100, [players[1].id]: 70 }
        }
      }
    }
  },
  potato: {
    roles: ['host', 'holder', 'player', 'spectator'],
    phases: [{ status: 'potato_playing', label: 'ход' }, { status: 'idle', label: 'взрыв', tag: 'result' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'potato_playing') { p.potatoRing = players.map(x => x.id); p.potatoTurnId = players[0].id }
      if (phase.tag === 'result') p.potatoResult = { loserId: players[1].id }
    }
  },
  whosaid: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'whosaid_collecting', label: 'сбор' }, { status: 'whosaid_guessing', label: 'угадывание' }, { status: 'whosaid_results', label: 'итоги' }],
    seed: (p, { phase, players }) => {
      if (phase.status === 'whosaid_collecting') p.whoSaidCount = 2
      else if (phase.status === 'whosaid_guessing') p.whoSaidAnswers = [{ idx: 0, text: 'Ответ раз' }, { idx: 1, text: 'Ответ два' }, { idx: 2, text: 'Ответ три' }]
      else p.whoSaidResult = { answers: [{ idx: 0, text: 'Ответ раз', authorId: players[0].id, authorName: players[0].name }, { idx: 1, text: 'Ответ два', authorId: players[1].id, authorName: players[1].name }], scores: { [players[0].id]: 100, [players[1].id]: 0 } }
    }
  },
  reaction: {
    roles: ['host', 'player', 'spectator'],
    phases: [{ status: 'reaction_active', label: 'реакция' }, { status: 'reaction_active', label: 'итог', tag: 'done' }],
    seed: (p, { phase, players }) => {
      const grid = reactionGrid()
      p.reactionRule = 'Нажми то, что не зелёное и не «цифра»'
      if (phase.tag === 'done') { grid[3].correct = true; p.reactionGrid = grid; p.reactionWinnerId = players[0].id; p.reactionDone = true }
      else { p.reactionGrid = grid; p.reactionDone = false }
    }
  }
}

// Человеческие подписи ролей
export const ROLE_LABELS = {
  host: 'Ведущий', answering: 'Отвечающий', player: 'Другой игрок', spectator: 'Наблюдатель',
  performer: 'Исполнитель', holder: 'Держатель', duelistA: 'Дуэлянт', pokerActive: 'Активный игрок', imposter: 'Шпион'
}

export function typeConfig(type) { return TYPES[type] || TYPES.text }
