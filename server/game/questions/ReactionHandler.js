const BaseQuestionHandler = require('./BaseQuestionHandler');

// Реакция: движок сам строит сетку ячеек (цвет × тип × символ) и правило с ЕДИНСТВЕННЫМ верным
// ответом. Первый верный тап берёт очки; неверный — штраф и блок. Индекс ответа держим вне broadcast.

const COLORS = [
  { k: 'green', hex: '#49a05a', adj: 'зелёное' },
  { k: 'red', hex: '#e0524a', adj: 'красное' },
  { k: 'blue', hex: '#3da9fc', adj: 'синее' },
  { k: 'yellow', hex: '#e8c24a', adj: 'жёлтое' }
];
const KINDS = [
  { k: 'letter', noun: 'буква' },
  { k: 'digit', noun: 'цифра' },
  { k: 'shape', noun: 'фигура' }
];
const LETTERS = 'АБВГДЕКМНОПРСТABCDEFKMNPQRS'.split('');
const DIGITS = '0123456789'.split('');
const SHAPES = ['●', '▲', '■', '★', '♦', '✚', '◆'];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const colorAdj = (k) => COLORS.find(c => c.k === k).adj;
const kindNoun = (k) => KINDS.find(x => x.k === k).noun;
const hexOf = (k) => COLORS.find(c => c.k === k).hex;

function charFor(kind) {
  if (kind === 'digit') return rnd(DIGITS);
  if (kind === 'shape') return rnd(SHAPES);
  return rnd(LETTERS);
}
function makeCell() {
  const c = rnd(COLORS), k = rnd(KINDS);
  return { color: c.k, hex: c.hex, kind: k.k, char: charFor(k.k) };
}
function setAttr(cell, attr, value) {
  if (attr === 'color') { cell.color = value; cell.hex = hexOf(value); }
  else { cell.kind = value; cell.char = charFor(value); }
}
function otherValue(attr, value) {
  const pool = attr === 'color' ? COLORS.map(c => c.k) : KINDS.map(k => k.k);
  return rnd(pool.filter(v => v !== value));
}
function satisfies(cell, cons) {
  return cons.every(c => c.op === 'is' ? cell[c.attr] === c.value : cell[c.attr] !== c.value);
}
function forceSatisfy(cell, cons) {
  for (const c of cons) {
    if (c.op === 'is') setAttr(cell, c.attr, c.value);
    else if (cell[c.attr] === c.value) setAttr(cell, c.attr, otherValue(c.attr, c.value));
  }
}
function forceViolate(cell, cons) {
  const c = rnd(cons); // ломаем одно ограничение → ячейка перестаёт удовлетворять конъюнкции
  if (c.op === 'is') setAttr(cell, c.attr, otherValue(c.attr, c.value));
  else setAttr(cell, c.attr, c.value);
}

// Возвращает { cells, answer, text } с гарантированно единственным верным индексом
function generateGrid(n = 9) {
  const cells = Array.from({ length: n }, makeCell);
  const colorK = rnd(COLORS).k, kindK = rnd(KINDS).k;
  const tmpl = rnd(['negNeg', 'posPos', 'singleKind', 'singleColor']);
  let cons, text;
  if (tmpl === 'negNeg') {
    cons = [{ attr: 'color', op: 'not', value: colorK }, { attr: 'kind', op: 'not', value: kindK }];
    text = `Нажми то, что не ${colorAdj(colorK)} и не «${kindNoun(kindK)}»`;
  } else if (tmpl === 'posPos') {
    cons = [{ attr: 'color', op: 'is', value: colorK }, { attr: 'kind', op: 'is', value: kindK }];
    text = `Нажми то, что ${colorAdj(colorK)} и «${kindNoun(kindK)}»`;
  } else if (tmpl === 'singleKind') {
    cons = [{ attr: 'kind', op: 'is', value: kindK }];
    text = `Нажми единственную «${kindNoun(kindK)}»`;
  } else {
    cons = [{ attr: 'color', op: 'is', value: colorK }];
    text = `Нажми единственное ${colorAdj(colorK)}`;
  }
  const answer = Math.floor(Math.random() * n);
  forceSatisfy(cells[answer], cons);
  for (let i = 0; i < n; i++) {
    if (i !== answer && satisfies(cells[i], cons)) forceViolate(cells[i], cons);
  }
  if (!satisfies(cells[answer], cons)) forceSatisfy(cells[answer], cons); // страховка
  return { cells, answer, text, cons };
}

class ReactionHandler extends BaseQuestionHandler {
  constructor() { super('reaction'); }

  onSelect(gameState, question) {
    const { cells, answer, text } = generateGrid();
    gameState.state.questionStatus = 'reaction_active';
    gameState.state.reactionGrid = cells;
    gameState.state.reactionRule = text;
    gameState.state.reactionWinnerId = null;
    gameState.state.reactionDone = false;
    gameState._priv.reactionAnswer = answer;
    gameState.addLog('Реакция! Кто быстрее и точнее?', 'warning');
  }

  handleAction(gameState, action, data, { io, user }) {
    if (action === 'player:tapTarget') {
      if (gameState.state.questionStatus !== 'reaction_active' || gameState.state.reactionDone) return;
      if (gameState.sealed[String(user.id)]) return; // уже ошибся — заблокирован
      const q = gameState.getCurrentQuestion();
      const idx = data && Number(data.idx);
      if (idx === gameState._priv.reactionAnswer) {
        gameState.adjustScore(user.id, q.points || 0);
        gameState.state.reactionWinnerId = user.id;
        gameState.state.reactionDone = true;
        if (gameState.state.reactionGrid[idx]) gameState.state.reactionGrid[idx].correct = true;
        gameState.addLog('Есть верный тап!', 'success');
      } else {
        gameState.sealed[String(user.id)] = true; // блок до конца
        gameState.adjustScore(user.id, -Math.max(1, Math.round((q.points || 0) / 2)));
      }
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    } else if (action === 'host:endReaction') {
      if (gameState.state.questionStatus !== 'reaction_active') return;
      gameState.state.reactionDone = true;
      const a = gameState._priv.reactionAnswer;
      if (gameState.state.reactionGrid[a]) gameState.state.reactionGrid[a].correct = true;
      io.to(gameState.roomCode).emit('gameStateUpdated', gameState.state);
    }
  }
}

module.exports = ReactionHandler;
module.exports.generateGrid = generateGrid; // экспорт для юнит-теста уникальности
module.exports.satisfies = satisfies;
