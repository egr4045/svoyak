// Проверка качества пака: единый источник правды для «пуст ли вопрос» (переиспользуется
// PackEditor для бейджа ⚠/статистики/completeness) + более глубокие находки поверх него.

// Каждый тип валиден по своим полям.
export function isBlank(q) {
  const noQ = !q.q?.trim()
  const noA = !q.a?.trim()
  switch (q.type) {
    case 'reaction':
    case 'rps':       return false                 // авто/без контента
    case 'sketch':
    case 'potato':
    case 'whosaid':
    case 'media':     return noQ                   // нужен только текст (вопрос/категория/промпт)
    case 'charades':
    case 'karaoke':   return noA                   // нужно слово/название; инструкция опциональна
    case 'snippet':   return !q.mediaSrc || noA    // нужен фрагмент-медиа и ответ
    case 'alias':     return !(q.words && q.words.some(w => w?.trim())) // ≥1 слово
    case 'tierlist':  return !(q.items && q.items.some(it => it?.label?.trim() || it?.mediaSrc)) // ≥1 объект
    default:          return noQ || noA            // обычные типы: вопрос + ответ
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Не только формат ГГГГ-ММ-ДД, но и что дата календарно существует (месяц 1-12, день в пределах месяца)
function isValidDateStr(s) {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12) return false
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d >= 1 && d <= daysInMonth
}

// Возвращает массив находок {level:'error'|'warning', message, roundIdx, catIdx?, qi?, roundName, catName?}.
// error — точно сломает игру (пустой вопрос, невалидная дата). warning — играбельно, но слабо
// (мало слов в алиасе, один объект в тир-листе, дубли очков, пустая категория/раунд).
export function lintPack(rounds) {
  const issues = []
  const add = (level, message, ctx) => issues.push({ level, message, ...ctx })

  ;(rounds || []).forEach((r, ri) => {
    const roundName = r.name || `Раунд ${ri + 1}`
    if (!r.categories || !r.categories.length) {
      add('warning', `Раунд «${roundName}» без категорий`, { roundIdx: ri, roundName })
      return
    }
    r.categories.forEach((c, ci) => {
      const catName = c.category || '—'
      if (!c.questions || !c.questions.length) {
        add('warning', `Категория «${catName}» пуста`, { roundIdx: ri, catIdx: ci, roundName, catName })
        return
      }
      const pointsSeen = new Set()
      const dupPoints = new Set()
      c.questions.forEach(q => {
        if (pointsSeen.has(q.points)) dupPoints.add(q.points)
        pointsSeen.add(q.points)
      })
      c.questions.forEach((q, qi) => {
        const ctx = { roundIdx: ri, catIdx: ci, qi, roundName, catName }
        if (isBlank(q)) {
          add('error', `Не заполнен вопрос за ${q.points} в «${catName}»`, ctx)
        }
        if (q.type === 'number' && q.numberKind === 'date' && q.a && !isValidDateStr(q.a)) {
          add('error', `Неверная дата (нужно существующую ГГГГ-ММ-ДД): «${q.a}»`, ctx)
        }
        if (q.type === 'tierlist' && Array.isArray(q.items) &&
            q.items.filter(it => it?.label?.trim() || it?.mediaSrc).length === 1) {
          add('warning', `Тир-лист за ${q.points}: один объект — сравнивать нечего`, ctx)
        }
        if (q.type === 'alias' && Array.isArray(q.words) && q.words.filter(w => w?.trim()).length < 3) {
          add('warning', `Алиас за ${q.points}: меньше 3 слов — раунд закончится очень быстро`, ctx)
        }
        if (dupPoints.has(q.points)) {
          add('warning', `Дублирующиеся очки (${q.points}) в «${catName}»`, ctx)
        }
      })
    })
  })
  return issues
}

// Перенумеровать очки категории по возрастанию (100, 200, 300…), сохраняя порядок ячеек.
export function renumberCategory(cat) {
  (cat.questions || []).forEach((q, i) => { q.points = (i + 1) * 100 })
}
