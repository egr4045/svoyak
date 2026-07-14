// Demo-grade редьюсер: фейковый socket, чей emit(event,payload) двигает фазы мок-стора вместо
// реального сервера. Не точная копия серверной математики — «правдоподобный прогон» для теста.
// Все компоненты вызывают store.socket?.emit(...), поэтому кнопки HostPanel и баззер оживают.

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
const REACTION_CORRECT_IDX = 3 // в моке верная ячейка реакции — index 3 (см. roleMatrix)

export function makeMockSocket(store) {
  let alive = true
  const timers = []
  const later = (fn, ms) => { const t = setTimeout(() => { if (alive) fn() }, ms); timers.push(t) }

  const q = () => store.currentQuestion || {}
  const ps = () => store.players || []
  const meId = () => store.user?.id
  const hostId = () => store.host?.id
  const pts = () => (store.activeBet != null ? store.activeBet : (q().points || 100))
  const add = (id, amount) => { const p = ps().find(x => String(x.id) === String(id)); if (p) p.score += amount }
  const canSeeSecret = () => String(meId()) === String(hostId()) || String(meId()) === String(store.performerId)
  const secretFor = (payload) => (canSeeSecret() ? payload : null)

  function dispatch(ev, data) {
    const type = q().type
    switch (ev) {
      // --- Общие ---
      case 'host:startBuzzer':
        store.questionStatus = 'buzzer_countdown'; store.buzzerResults = []
        later(() => { store.questionStatus = 'buzzer_active' }, 900)
        break
      case 'player:pressBuzzer': {
        if (store.questionStatus !== 'buzzer_active') break
        if (!store.buzzerResults) store.buzzerResults = []
        if (store.buzzerResults.find(r => String(r.playerId) === String(meId()))) break
        store.buzzerResults = [...store.buzzerResults, { playerId: meId(), time: (data && data.reactionTime) || 500 }]
        if (store.buzzerResults.length === 1) {
          later(() => {
            store.buzzerResults = [...store.buzzerResults].sort((a, b) => a.time - b.time)
            store.questionStatus = 'buzzer_results'
            later(() => { store.answeringPlayerId = store.buzzerResults[0].playerId; store.questionStatus = 'answering' }, 1200)
          }, 900)
        }
        break
      }
      case 'host:correctAnswer':
        if (store.answeringPlayerId) add(store.answeringPlayerId, pts())
        store.selectingPlayerId = store.answeringPlayerId
        store.answeringPlayerId = null; store.showAnswer = true; store.questionStatus = 'idle'
        break
      case 'host:wrongAnswer':
        if (store.answeringPlayerId) add(store.answeringPlayerId, -pts())
        store.answeringPlayerId = null; store.showAnswer = true; store.questionStatus = 'idle'
        break
      case 'host:closeQuestion':
        store.showAnswer = false
        break
      case 'host:adjustScore': add(data.playerId, data.amount); break
      case 'host:setSelectingPlayer': store.selectingPlayerId = data; break
      case 'host:controlMedia': store.mediaState = { status: data.status, currentTime: data.currentTime || 0 }; break

      // --- text_input / among_us ---
      case 'player:submitTextAnswer': store.textAnswers = { ...store.textAnswers, [meId()]: data.text }; break
      case 'host:revealTextAnswers': store.questionStatus = 'text_judging'; break
      case 'host:judgeSingleTextAnswer': {
        add(data.playerId, data.isCorrect ? pts() : -pts())
        const t = { ...store.textAnswers }; delete t[data.playerId]; store.textAnswers = t
        break
      }
      case 'host:startAmongUsTimer':
        store.questionStatus = 'among_us_voting'
        store.amongUsTimerState = { status: 'running', endsAt: Date.now() + 120000, timeLeft: 120 }
        store.amongUsVotes = {}
        break
      case 'host:pauseAmongUsTimer': store.amongUsTimerState = { status: 'paused', timeLeft: data.timeLeft }; break
      case 'host:resumeAmongUsTimer': store.amongUsTimerState = { status: 'running', endsAt: Date.now() + data.timeLeft * 1000, timeLeft: data.timeLeft }; break
      case 'player:voteAmongUs': store.amongUsVotes = { ...store.amongUsVotes, [meId()]: data }; break
      case 'host:revealAmongUs': store.amongUsResult = 'crew_win'; store.showAnswer = true; break

      // --- sketch ---
      case 'player:submitSketch': store.sketchAnswers = { ...store.sketchAnswers, [meId()]: data.dataUrl }; break
      case 'host:revealSketches': store.questionStatus = 'sketch_judging'; break
      case 'player:voteSketch': store.sketchVotes = { ...store.sketchVotes, [meId()]: data }; break
      case 'host:awardSketchWinner': add(data, pts()); store.questionStatus = 'idle'; store.showAnswer = true; break

      // --- auction / cat / poker ---
      case 'player:submitAuctionBet': store.auctionBets = { ...store.auctionBets, [meId()]: data.betAmount }; break
      case 'host:revealAuctionBets': {
        const entries = Object.entries(store.auctionBets || {})
        if (entries.length) { const [id, bet] = entries.sort((a, b) => b[1] - a[1])[0]; store.activeBet = bet; store.answeringPlayerId = id; store.questionStatus = 'answering' }
        break
      }
      case 'host:rouletteCatPlayer': {
        store.questionStatus = 'cat_roulette'
        const pool = ps(); const target = pool[Math.floor(Math.random() * pool.length)]
        store.catTargetId = target && target.id
        later(() => { store.answeringPlayerId = store.catTargetId; store.questionStatus = 'answering' }, 2500)
        break
      }
      case 'player:pokerAction': break // визуально ход ведёт сервер; в моке опускаем

      // --- Скелет исполнителя (charades/karaoke/alias) ---
      case 'host:setPerformer': {
        const target = data != null ? ps().find(p => String(p.id) === String(data)) : ps()[0]
        if (!target) break
        store.performerId = target.id
        if (type === 'alias') {
          const words = (q().words || []).filter(w => w && String(w).trim())
          store.aliasState = { index: 0, total: words.length || 5, guessedCount: 0, timerSec: q().timerSec || 60, endsAt: Date.now() + (q().timerSec || 60) * 1000, wordPoints: 50 }
          store.questionStatus = 'alias_playing'
          store.privateReveal = secretFor({ kind: 'alias', text: words[0] || 'СЛОВО', index: 0, total: words.length || 5 })
        } else {
          store.questionStatus = 'performing'
          store.privateReveal = secretFor(type === 'karaoke'
            ? { kind: 'karaoke', text: q().a || 'Песня', mediaSrc: q().mediaSrc || null, mediaType: q().mediaType || null }
            : { kind: 'charades', text: q().a || 'ЖИРАФ', prompt: q().q || '' })
        }
        break
      }
      case 'host:awardGuess':
        if (data) add(data, pts())
        if (store.performerId) add(store.performerId, Math.ceil(pts() / 2))
        store.performResult = { guesserId: data, performerId: store.performerId, answer: q().a || 'ЖИРАФ' }
        store.privateReveal = null; store.questionStatus = 'idle'
        break
      case 'host:passQuestion':
        store.performResult = { pass: true, performerId: store.performerId, answer: q().a || 'ЖИРАФ' }
        store.privateReveal = null; store.questionStatus = 'idle'
        break
      case 'host:aliasGuessed':
      case 'host:aliasSkip': {
        const st = store.aliasState; if (!st) break
        if (ev === 'host:aliasGuessed' && data) { add(data, st.wordPoints); if (store.performerId) add(store.performerId, st.wordPoints); st.guessedCount++ }
        st.index++
        if (st.index >= st.total) { store.aliasResult = { guessed: st.guessedCount, total: st.total }; store.questionStatus = 'idle'; store.privateReveal = null }
        else { const words = (q().words || []).filter(w => w && String(w).trim()); store.privateReveal = secretFor({ kind: 'alias', text: words[st.index] || 'СЛОВО', index: st.index, total: st.total }); store.aliasState = { ...st } }
        break
      }

      // --- number / tierlist ---
      case 'player:submitNumber': store.numberGuesses = { ...store.numberGuesses, [meId()]: true }; break
      case 'host:revealNumber': {
        const p = ps()
        store.numberReveal = { kind: q().numberKind || 'number', answer: q().a || '1969', ranked: [{ id: p[1].id, name: p[1].name, raw: '1968', num: 1968, diff: 1 }, { id: p[0].id, name: p[0].name, raw: '1975', num: 1975, diff: 6 }], winnerId: p[1].id }
        add(p[1].id, pts()); store.questionStatus = 'number_results'
        break
      }
      case 'player:submitTier': if (!store.tierSubmitted.includes(meId())) store.tierSubmitted = [...store.tierSubmitted, meId()]; break
      case 'host:revealTier': {
        const items = (q().items && q().items.length ? q().items : [{ label: 'Объект A' }, { label: 'Объект B' }])
        const medians = items.map((_, i) => 5 + (i % 3))
        const p = ps()
        store.tierMedians = medians
        store.tierResults = { items: items.map((it, i) => ({ label: it.label || `#${i + 1}`, mediaSrc: it.mediaSrc || null, mediaType: it.mediaType || null, median: medians[i] })), ratings: {}, scores: { [p[0].id]: 100, [p[1].id]: 70 } }
        add(p[0].id, 100); add(p[1].id, 70); store.questionStatus = 'tier_results'
        break
      }

      // --- rps ---
      case 'host:setDuel': {
        const ds = store.duelState || { aId: null, bId: null, aReady: false, bReady: false, revealed: false }
        if (data == null) store.duelState = { aId: null, bId: null, aReady: false, bReady: false, revealed: false, aPick: null, bPick: null, winnerId: null, tie: false }
        else { const t = ps().find(p => String(p.id) === String(data)); if (t) { if (ds.aId == null) ds.aId = t.id; else if (ds.bId == null && String(t.id) !== String(ds.aId)) ds.bId = t.id; store.duelState = { ...ds } } }
        break
      }
      case 'player:rpsPick': {
        const ds = store.duelState; if (!ds || ds.revealed || !ds.aId || !ds.bId) break
        const choice = data && data.choice; if (!BEATS[choice]) break
        if (String(meId()) === String(ds.aId)) { ds.aReady = true; ds._a = choice }
        if (String(meId()) === String(ds.bId)) { ds.bReady = true; ds._b = choice }
        if (ds.aReady && ds.bReady) resolveDuel(ds); else store.duelState = { ...ds }
        break
      }
      case 'host:revealDuel': { const ds = store.duelState; if (ds && ds.aReady && ds.bReady) resolveDuel(ds); break }

      // --- potato ---
      case 'player:passPotato': {
        const ring = store.potatoRing || []
        if (String(store.potatoTurnId) !== String(meId()) || !ring.length) break
        const idx = ring.findIndex(id => String(id) === String(meId()))
        store.potatoTurnId = ring[(idx + 1) % ring.length]
        break
      }

      // --- whosaid ---
      case 'player:submitWhoSaid': store.whoSaidCount = (store.whoSaidCount || 0) + 1; break
      case 'host:revealWhoSaid':
        store.whoSaidAnswers = [{ idx: 0, text: 'Ответ раз' }, { idx: 1, text: 'Ответ два' }, { idx: 2, text: 'Ответ три' }]
        store.questionStatus = 'whosaid_guessing'; store.whoSaidCount = 0
        break
      case 'player:guessAuthor': store.whoSaidCount = (store.whoSaidCount || 0) + 1; break
      case 'host:scoreWhoSaid': {
        const p = ps()
        store.whoSaidResult = { answers: [{ idx: 0, text: 'Ответ раз', authorId: p[0].id, authorName: p[0].name }, { idx: 1, text: 'Ответ два', authorId: p[1].id, authorName: p[1].name }], scores: { [p[0].id]: 100, [p[1].id]: 0 } }
        store.questionStatus = 'whosaid_results'
        break
      }

      // --- reaction ---
      case 'host:revealMore': {
        const pts0 = q().points || 400
        store.snippetLevel = (store.snippetLevel || 0) + 1
        store.activeBet = Math.max(Math.round(pts0 / 5), pts0 - store.snippetLevel * Math.round(pts0 / 5))
        break
      }
      case 'player:tapTarget': {
        if (store.reactionDone) break
        const idx = data && Number(data.idx)
        if (idx === REACTION_CORRECT_IDX) { add(meId(), pts()); store.reactionWinnerId = meId(); store.reactionDone = true; if (store.reactionGrid[idx]) { store.reactionGrid[idx] = { ...store.reactionGrid[idx], correct: true }; store.reactionGrid = [...store.reactionGrid] } }
        break
      }
      case 'host:endReaction': {
        store.reactionDone = true
        if (store.reactionGrid && store.reactionGrid[REACTION_CORRECT_IDX]) { store.reactionGrid[REACTION_CORRECT_IDX] = { ...store.reactionGrid[REACTION_CORRECT_IDX], correct: true }; store.reactionGrid = [...store.reactionGrid] }
        break
      }
      default: break
    }
  }

  function resolveDuel(ds) {
    if (ds._a === ds._b) { ds.tie = true; ds.aReady = false; ds.bReady = false; ds._a = null; ds._b = null; store.duelState = { ...ds }; return }
    ds.revealed = true; ds.aPick = ds._a; ds.bPick = ds._b
    ds.winnerId = BEATS[ds._a] === ds._b ? ds.aId : ds.bId
    add(ds.winnerId, pts()); store.duelState = { ...ds }
  }

  return {
    emit: (ev, data) => { if (alive) dispatch(ev, data) },
    on: () => {}, off: () => {}, disconnect: () => {},
    dispose: () => { alive = false; timers.forEach(clearTimeout); timers.length = 0 }
  }
}
