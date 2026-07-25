// Заглушки-с-темой + галерея скелетов раундов: быстрый старт для конструктора паков.
// Чистая логика без Vue-зависимостей — переиспользуется PackEditor и TemplateWizard.

const norm = (theme) => (theme || '').toString().trim() || 'Тема'

// Валидная (не «пустая» по isBlank) заглушка вопроса под тип + модификаторы новой модели.
// mods — источник модификаторов (можно передать сам вопрос: читаются stake/snippet/glitch/
// answerMode/showMode/everyoneMode). points сюда НЕ входят — их проставляет вызывающий код.
// Заметка: фрагмент (snippet) требует реального медиафайла — заглушка не может закрыть его ⚠.
export function stubForType(type, theme, idx = 0, mods = {}) {
  const t = norm(theme)
  switch (type) {
    case 'quiz': {
      if (mods.stake === 'auction') return { type, stake: 'auction', q: `Аукцион: ${t}`, a: 'Ответ' }
      if (mods.stake === 'cat')     return { type, stake: 'cat', q: `Кот в мешке: ${t}`, a: 'Ответ' }
      if (mods.snippet)             return { type, snippet: true, a: `${t} — фрагмент ${idx + 1}` } // медиа грузится отдельно
      if (mods.answerMode === 'written') return { type, answerMode: 'written', q: `Письменно: что вы знаете про «${t}»?`, a: 'Ответ' }
      if (mods.glitch)              return { type, glitch: true, q: `Глитч-вопрос: ${t}`, a: 'Ответ' }
      if (mods.media)               return { type, q: `Что изображено (${t})?`, a: 'Ответ' }
      return { type, q: `Вопрос про «${t}» №${idx + 1}`, a: 'Ответ' }
    }
    case 'show': {
      const m = mods.showMode
      if (m === 'karaoke') return { type, showMode: 'karaoke', q: 'Напойте, не называя название', a: `${t} — песня ${idx + 1}` }
      if (m === 'alias')   return { type, showMode: 'alias', words: [1, 2, 3, 4, 5].map(n => `${t}-${n}`), timerSec: 60 }
      return { type, showMode: 'charades', q: 'Покажи, не называя вслух', a: `${t} — слово ${idx + 1}` }
    }
    case 'everyone': {
      const m = mods.everyoneMode
      if (m === 'tierlist') return { type, everyoneMode: 'tierlist', items: ['A', 'B', 'C'].map(l => ({ label: `${t} ${l}` })) }
      if (m === 'whosaid')  return { type, everyoneMode: 'whosaid', q: `Промпт про «${t}»: самый яркий момент` }
      return { type, everyoneMode: 'number', q: `Назовите число, связанное с «${t}»`, a: '10', numberKind: 'number' }
    }
    case 'among_us': return { type, q: `Шпион среди ${t}`, a: 'Ответ' }
    case 'sketch':   return { type, q: `Нарисуй: ${t}` }
    case 'rps':      return { type }
    case 'potato':   return { type, q: `Категория: ${t}` }
    case 'reaction': return { type }
    default:         return { type, q: '', a: '' }
  }
}

const scale = (n) => Array.from({ length: n }, (_, i) => (i + 1) * 100)

function typeRound(name, rows, theme) {
  return {
    name,
    categories: rows.map(({ cat, type, count = 3, mods }) => ({
      category: cat,
      questions: scale(count).map((points, i) => ({ points, ...stubForType(type, theme, i, mods) }))
    }))
  }
}

// Галерея скелетов раунда: жанр → build(theme) → готовый раунд {name, categories}.
export const ROUND_SKELETONS = [
  {
    key: 'classic', icon: '🏛', label: 'Классика 5×5',
    desc: '5 категорий по 5 вопросов — привычный формат «Своей игры»',
    build: (theme) => typeRound(`${norm(theme)} — классика`,
      ['История', 'Наука', 'Кино и ТВ', 'Спорт', 'Разное'].map(cat => ({ cat, type: 'quiz', count: 5 })), theme)
  },
  {
    key: 'party', icon: '🎉', label: 'Вечеринка',
    desc: 'Крокодил, алиас, камень-ножницы, картошка, реакция — движение и смех',
    build: (theme) => typeRound(`${norm(theme)} — вечеринка`, [
      { cat: 'Крокодил', type: 'show', mods: { showMode: 'charades' } },
      { cat: 'Алиас', type: 'show', mods: { showMode: 'alias' } },
      { cat: 'Камень-ножницы', type: 'rps' },
      { cat: 'Горячая картошка', type: 'potato' },
      { cat: 'Реакция', type: 'reaction' }
    ], theme)
  },
  {
    key: 'music', icon: '🎵', label: 'Музыкальный вечер',
    desc: 'Караоке и угадай по фрагменту — не забудьте загрузить аудио в ячейках',
    build: (theme) => typeRound(`${norm(theme)} — музыка`, [
      { cat: 'Караоке', type: 'show', count: 4, mods: { showMode: 'karaoke' } },
      { cat: 'Угадай по фрагменту', type: 'quiz', count: 4, mods: { snippet: true } },
      { cat: 'Алиас (музыкальные слова)', type: 'show', count: 2, mods: { showMode: 'alias' } }
    ], theme)
  },
  {
    key: 'minigames', icon: '🎲', label: 'Микс мини-игр',
    desc: 'По одному вопросу каждой механики — попробовать всё сразу',
    build: (theme) => ({
      name: `${norm(theme)} — микс`,
      categories: [{
        category: norm(theme),
        questions: [
          ['show', { showMode: 'charades' }], ['show', { showMode: 'karaoke' }], ['show', { showMode: 'alias' }],
          ['quiz', { snippet: true }], ['rps', {}],
          ['everyone', { everyoneMode: 'number' }], ['everyone', { everyoneMode: 'tierlist' }],
          ['potato', {}], ['everyone', { everyoneMode: 'whosaid' }], ['reaction', {}]
        ].map(([type, mods], i) => ({ points: (i + 1) * 100, ...stubForType(type, theme, i, mods) }))
      }]
    })
  },
  {
    key: 'kids', icon: '🧸', label: 'Детский',
    desc: 'Простые типы без переговоров и тайминга',
    build: (theme) => typeRound(`${norm(theme)} — детский`, [
      { cat: 'Угадай-ка', type: 'quiz', count: 4 },
      { cat: 'Картинки', type: 'quiz', count: 4, mods: { media: true } },
      { cat: 'Числа', type: 'everyone', count: 3, mods: { everyoneMode: 'number' } },
      { cat: 'Реакция', type: 'reaction', count: 3 }
    ], theme)
  }
]
