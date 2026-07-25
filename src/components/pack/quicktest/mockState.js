import { fakePlayers, HOST, typeConfig } from './roleMatrix'

// Кто «я» при данной роли + видимость приватного секрета. seed уже расставил сценарные поля
// (performerId/duelState/answeringPlayerId/…); здесь маппим роль → user и решаем privateReveal.
function applyIdentity(patch, role, ps) {
  const other = ps.find(p => p.id !== ps[0].id) || ps[0]
  let me = ps[0]
  switch (role) {
    case 'host': me = HOST; break
    case 'performer': me = ps.find(p => p.id === patch.performerId) || ps[0]; break
    case 'imposter': me = ps.find(p => p.id === patch._imposterId) || ps[1] || ps[0]; break
    case 'holder': me = ps.find(p => p.id === patch.potatoTurnId) || ps[0]; break
    case 'duelistA': me = ps.find(p => p.id === (patch.duelState && patch.duelState.aId)) || ps[0]; break
    case 'answering': me = ps.find(p => p.id === patch.answeringPlayerId) || ps[0]; break
    case 'spectator': me = other; break
    case 'player':
    default: {
      // «Другой игрок»: не исполнитель/не держатель/не активный дуэлянт — чтобы видеть чужую роль
      const special = new Set([patch.performerId, patch.potatoTurnId, patch.answeringPlayerId, patch.duelState && patch.duelState.aId, patch.duelState && patch.duelState.bId].filter(Boolean).map(String))
      me = ps.find(p => !special.has(String(p.id))) || other
      break
    }
  }
  patch.user = { id: me.id, username: me.name, avatar: me.avatar }

  if (role === 'spectator') {
    patch.spectators = [{ ...me }]
    patch.players = ps.filter(p => p.id !== me.id).map(p => ({ ...p }))
  }

  // Секрет виден только ведущему, исполнителю и шпиону (privateReveal вне broadcast в бою)
  const canSee = role === 'host' || role === 'performer' || role === 'imposter'
  // Ведущий получает host-вариант секрета (как на сервере: imposter_host с именем шпиона)
  let secret = patch._secret || null
  if (secret && secret.kind === 'imposter' && role === 'host') {
    const imp = ps.find(p => p.id === patch._imposterId)
    secret = { kind: 'imposter_host', imposterName: imp ? imp.name : '—' }
  }
  patch.privateReveal = canSee ? secret : null
  delete patch._secret
  delete patch._imposterId

  // Как сервер (blankActiveQuestionFields): для не-секретных ролей затираем секрет в доске,
  // чтобы его не было даже в скрытом DOM превью
  if (!canSee) {
    const q0 = patch.board && patch.board[0] && patch.board[0].questions && patch.board[0].questions[0]
    const fields = q0 && secretFieldsFor(q0)
    if (q0 && fields) fields.forEach(f => { q0[f] = null })
  }
}

// Зеркалит серверный ShowHandler.secretFields(): секретоносный тип — только «шоу»
function secretFieldsFor(q) {
  if (q.type !== 'show') return null
  if (q.showMode === 'karaoke') return ['a', 'mediaSrc', 'mediaType']
  if (q.showMode === 'alias') return ['words']
  return ['a']
}

// Собираем patch для мок-стора: каркас + активный вопрос + фаза + роль-сид.
export function makeMockState(question, { role = 'host', phaseIndex = 0, players = 3 } = {}) {
  const q = JSON.parse(JSON.stringify(question || { type: 'quiz' }))
  const cfg = typeConfig(q)
  const ps = fakePlayers(players)
  const phase = cfg.phases[Math.max(0, Math.min(phaseIndex, cfg.phases.length - 1))]

  const patch = {
    host: { ...HOST, connected: true },
    players: ps.map(p => ({ ...p })),
    spectators: [],
    maxPlayers: 8,
    gameStarted: true,
    roundsData: [{ name: 'Тест', categories: [{ category: 'Тест', questions: [q] }] }],
    currentRoundIndex: 0,
    board: [{ category: 'Тест', questions: [q] }],
    activeCell: { catIdx: 0, qIdx: 0 },
    questionStatus: phase.status,
    showAnswer: false,
    answeringPlayerId: null,
    selectingPlayerId: null,
    privateReveal: null,
    mediaState: { status: 'stopped', currentTime: 0 }
  }

  cfg.seed(patch, { phase, question: q, players: ps })
  applyIdentity(patch, role, ps)
  return patch
}

// Роли и фазы, актуальные для вопроса (тип + модификаторы) — для UI переключателей
export function rolesFor(question) { return typeConfig(question).roles }
export function phasesFor(question) { return typeConfig(question).phases }
