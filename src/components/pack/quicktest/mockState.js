import { fakePlayers, HOST, typeConfig } from './roleMatrix'

// Кто «я» при данной роли + видимость приватного секрета. seed уже расставил сценарные поля
// (performerId/duelState/answeringPlayerId/…); здесь маппим роль → user и решаем privateReveal.
function applyIdentity(patch, role, ps) {
  const other = ps.find(p => p.id !== ps[0].id) || ps[0]
  let me = ps[0]
  switch (role) {
    case 'host': me = HOST; break
    case 'performer': me = ps.find(p => p.id === patch.performerId) || ps[0]; break
    case 'holder': me = ps.find(p => p.id === patch.potatoTurnId) || ps[0]; break
    case 'duelistA': me = ps.find(p => p.id === (patch.duelState && patch.duelState.aId)) || ps[0]; break
    case 'answering': me = ps.find(p => p.id === patch.answeringPlayerId) || ps[0]; break
    case 'pokerActive': me = ps.find(p => (patch.pokerActivePlayers || []).includes(p.id)) || ps[0]; break
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

  // Секрет виден только ведущему и исполнителю (privateReveal вне broadcast в бою)
  const canSee = role === 'host' || role === 'performer'
  patch.privateReveal = canSee ? (patch._secret || null) : null
  delete patch._secret

  // Как сервер (blankActiveQuestionFields): для не-секретных ролей затираем секрет в доске,
  // чтобы его не было даже в скрытом DOM превью
  if (!canSee) {
    const q0 = patch.board && patch.board[0] && patch.board[0].questions && patch.board[0].questions[0]
    const fields = SECRET_FIELDS[q0 && q0.type]
    if (q0 && fields) fields.forEach(f => { q0[f] = null })
  }
}

const SECRET_FIELDS = { charades: ['a'], karaoke: ['a', 'mediaSrc', 'mediaType'], alias: ['words'] }

// Собираем patch для мок-стора: каркас + активный вопрос + фаза + роль-сид.
export function makeMockState(question, { role = 'host', phaseIndex = 0, players = 3 } = {}) {
  const q = JSON.parse(JSON.stringify(question || { type: 'text' }))
  const cfg = typeConfig(q.type)
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

// Роли и фазы, актуальные для типа (для UI переключателей)
export function rolesFor(type) { return typeConfig(type).roles }
export function phasesFor(type) { return typeConfig(type).phases }
