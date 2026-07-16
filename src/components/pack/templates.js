// Заглушки-с-темой + галерея скелетов раундов: быстрый старт для конструктора паков.
// Чистая логика без Vue-зависимостей — переиспользуется PackEditor и TemplateWizard.

const norm = (theme) => (theme || '').toString().trim() || 'Тема'

// Валидная (не «пустая» по isBlank в PackEditor) заглушка вопроса под тип, параметризованная темой.
// points сюда НЕ входят — их проставляет вызывающий код (сетка очков раунда/ячейки).
// Заметка: snippet требует реального медиафайла — заглушка не может закрыть его ⚠, это ожидаемо.
export function stubForType(type, theme, idx = 0) {
  const t = norm(theme)
  switch (type) {
    case 'text':       return { type, q: `Вопрос про «${t}» №${idx + 1}`, a: 'Ответ' }
    case 'media':      return { type, q: `Что изображено (${t})?`, a: 'Ответ' }
    case 'text_input': return { type, q: `Письменно: что вы знаете про «${t}»?`, a: 'Ответ' }
    case 'glitch':     return { type, q: `Глитч-вопрос: ${t}`, a: 'Ответ' }
    case 'poker':      return { type, q: `Банк вопросов: ${t}`, a: 'Ответ' }
    case 'auction':    return { type, q: `Аукцион: ${t}`, a: 'Ответ' }
    case 'cat':        return { type, q: `Кот в мешке: ${t}`, a: 'Ответ' }
    case 'among_us':   return { type, q: `Шпион среди ${t}`, a: 'Ответ' }
    case 'sketch':     return { type, q: `Нарисуй: ${t}` }
    case 'charades':   return { type, q: 'Покажи, не называя вслух', a: `${t} — слово ${idx + 1}` }
    case 'karaoke':    return { type, q: 'Напойте, не называя название', a: `${t} — песня ${idx + 1}` }
    case 'alias':      return { type, words: [1, 2, 3, 4, 5].map(n => `${t}-${n}`), timerSec: 60 }
    case 'snippet':    return { type, a: `${t} — фрагмент ${idx + 1}` } // медиа грузится отдельно
    case 'rps':        return { type }
    case 'number':     return { type, q: `Назовите число, связанное с «${t}»`, a: '10', numberKind: 'number' }
    case 'tierlist':   return { type, items: ['A', 'B', 'C'].map(l => ({ label: `${t} ${l}` })) }
    case 'potato':     return { type, q: `Категория: ${t}` }
    case 'whosaid':    return { type, q: `Промпт про «${t}»: самый яркий момент` }
    case 'reaction':   return { type }
    default:           return { type, q: '', a: '' }
  }
}

const scale = (n) => Array.from({ length: n }, (_, i) => (i + 1) * 100)

function typeRound(name, rows, theme) {
  return {
    name,
    categories: rows.map(({ cat, type, count = 3 }) => ({
      category: cat,
      questions: scale(count).map((points, i) => ({ points, ...stubForType(type, theme, i) }))
    }))
  }
}

// Галерея скелетов раунда: жанр → build(theme) → готовый раунд {name, categories}.
export const ROUND_SKELETONS = [
  {
    key: 'classic', icon: '🏛', label: 'Классика 5×5',
    desc: '5 категорий по 5 вопросов — привычный формат «Своей игры»',
    build: (theme) => typeRound(`${norm(theme)} — классика`,
      ['История', 'Наука', 'Кино и ТВ', 'Спорт', 'Разное'].map(cat => ({ cat, type: 'text', count: 5 })), theme)
  },
  {
    key: 'party', icon: '🎉', label: 'Вечеринка',
    desc: 'Крокодил, алиас, камень-ножницы, картошка, реакция — движение и смех',
    build: (theme) => typeRound(`${norm(theme)} — вечеринка`, [
      { cat: 'Крокодил', type: 'charades' },
      { cat: 'Алиас', type: 'alias' },
      { cat: 'Камень-ножницы', type: 'rps' },
      { cat: 'Горячая картошка', type: 'potato' },
      { cat: 'Реакция', type: 'reaction' }
    ], theme)
  },
  {
    key: 'music', icon: '🎵', label: 'Музыкальный вечер',
    desc: 'Караоке и угадай по фрагменту — не забудьте загрузить аудио в ячейках',
    build: (theme) => typeRound(`${norm(theme)} — музыка`, [
      { cat: 'Караоке', type: 'karaoke', count: 4 },
      { cat: 'Угадай по фрагменту', type: 'snippet', count: 4 },
      { cat: 'Алиас (музыкальные слова)', type: 'alias', count: 2 }
    ], theme)
  },
  {
    key: 'minigames', icon: '🎲', label: 'Микс мини-игр',
    desc: 'По одному вопросу каждого нового типа — попробовать всё сразу',
    build: (theme) => ({
      name: `${norm(theme)} — микс`,
      categories: [{
        category: norm(theme),
        questions: ['charades', 'karaoke', 'alias', 'snippet', 'rps', 'number', 'tierlist', 'potato', 'whosaid', 'reaction']
          .map((type, i) => ({ points: (i + 1) * 100, ...stubForType(type, theme, i) }))
      }]
    })
  },
  {
    key: 'kids', icon: '🧸', label: 'Детский',
    desc: 'Простые типы без переговоров и тайминга',
    build: (theme) => typeRound(`${norm(theme)} — детский`, [
      { cat: 'Угадай-ка', type: 'text', count: 4 },
      { cat: 'Картинки', type: 'media', count: 4 },
      { cat: 'Числа', type: 'number', count: 3 },
      { cat: 'Реакция', type: 'reaction', count: 3 }
    ], theme)
  }
]
