import { describe, test, expect } from 'vitest'
import { isBlank, lintPack } from '../components/pack/lint'

// Линтер пака: «пустота» по новой модели типов (тип + модификаторы)
describe('isBlank (новая модель типов)', () => {
  test('quiz: нужен вопрос (текстом или медиа) и ответ', () => {
    expect(isBlank({ type: 'quiz', q: 'В?', a: 'О' })).toBe(false)
    expect(isBlank({ type: 'quiz', q: '', a: 'О' })).toBe(true)
    expect(isBlank({ type: 'quiz', q: 'В?', a: '' })).toBe(true)
    // Медиа заменяет текст вопроса
    expect(isBlank({ type: 'quiz', q: '', a: 'О', mediaSrc: '/x.jpg', mediaType: 'image' })).toBe(false)
  })

  test('quiz+snippet: обязателен медиафайл и ответ', () => {
    expect(isBlank({ type: 'quiz', snippet: true, a: 'О' })).toBe(true)
    expect(isBlank({ type: 'quiz', snippet: true, a: 'О', mediaSrc: '/x.mp3' })).toBe(false)
    expect(isBlank({ type: 'quiz', snippet: true, a: '', mediaSrc: '/x.mp3' })).toBe(true)
  })

  test('show: крокодил/караоке требуют слово, алиас — список слов', () => {
    expect(isBlank({ type: 'show', showMode: 'charades', a: 'Слон' })).toBe(false)
    expect(isBlank({ type: 'show', showMode: 'charades', a: '' })).toBe(true)
    expect(isBlank({ type: 'show', showMode: 'karaoke', a: 'Песня' })).toBe(false)
    expect(isBlank({ type: 'show', showMode: 'alias', words: ['кот'] })).toBe(false)
    expect(isBlank({ type: 'show', showMode: 'alias', words: ['', '  '] })).toBe(true)
  })

  test('everyone: число = вопрос+ответ, тирлист = объекты, кто-сказал = промпт', () => {
    expect(isBlank({ type: 'everyone', everyoneMode: 'number', q: 'Год?', a: '1969' })).toBe(false)
    expect(isBlank({ type: 'everyone', everyoneMode: 'number', q: 'Год?', a: '' })).toBe(true)
    expect(isBlank({ type: 'everyone', everyoneMode: 'tierlist', items: [{ label: 'A' }] })).toBe(false)
    expect(isBlank({ type: 'everyone', everyoneMode: 'tierlist', items: [] })).toBe(true)
    expect(isBlank({ type: 'everyone', everyoneMode: 'whosaid', q: 'Промпт' })).toBe(false)
    expect(isBlank({ type: 'everyone', everyoneMode: 'whosaid', q: '' })).toBe(true)
  })

  test('бесконтентные и простые типы', () => {
    expect(isBlank({ type: 'reaction' })).toBe(false)
    expect(isBlank({ type: 'rps' })).toBe(false)
    expect(isBlank({ type: 'sketch', q: 'Нарисуй кота' })).toBe(false)
    expect(isBlank({ type: 'sketch', q: '' })).toBe(true)
    expect(isBlank({ type: 'potato', q: 'Категория' })).toBe(false)
    expect(isBlank({ type: 'among_us', q: 'В?', a: 'О' })).toBe(false)
  })
})

describe('lintPack: глубокие правила по модификаторам', () => {
  const wrap = (q) => [{ name: 'Р', categories: [{ category: 'К', questions: [{ points: 100, ...q }] }] }]

  test('невалидная дата у everyone/number — ошибка', () => {
    const issues = lintPack(wrap({ type: 'everyone', everyoneMode: 'number', numberKind: 'date', q: 'Когда?', a: '2020-13-45' }))
    expect(issues.some(i => i.level === 'error' && i.message.includes('дата'))).toBe(true)
  })

  test('тир-лист с одним объектом — предупреждение', () => {
    const issues = lintPack(wrap({ type: 'everyone', everyoneMode: 'tierlist', items: [{ label: 'A' }] }))
    expect(issues.some(i => i.level === 'warning' && i.message.includes('один объект'))).toBe(true)
  })

  test('алиас с <3 словами — предупреждение', () => {
    const issues = lintPack(wrap({ type: 'show', showMode: 'alias', words: ['а', 'б'] }))
    expect(issues.some(i => i.level === 'warning' && i.message.includes('меньше 3 слов'))).toBe(true)
  })
})
