import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import { isBlank, lintPack } from '../components/pack/lint'

// Встроенный пак «Тестовый» — витрина всех типов, её открывают, чтобы понять формат.
// Значит она обязана быть образцовой по меркам самого редактора: ни одной ошибки линтера
// и ни одного «пустого» вопроса. Пак лежит на сервере (CJS) — тянем его напрямую,
// чтобы тест ловил рассинхрон между серверными данными и клиентскими правилами.
const require = createRequire(import.meta.url)
const rounds = require('../../server/game/testPackData.js')

describe('пак «Тестовый» глазами линтера редактора', () => {
  test('ни одного пустого вопроса', () => {
    const blanks = []
    rounds.forEach(r => r.categories.forEach(c => c.questions.forEach(q => {
      if (isBlank(q)) blanks.push(`${r.name} / ${c.category} / ${q.points} (${q.type})`)
    })))
    expect(blanks).toEqual([])
  })

  test('ни одной ошибки линтера', () => {
    const found = lintPack(rounds)
    const errors = found.filter(f => f.level === 'error')
    expect(errors.map(e => `${e.roundName}/${e.catName ?? ''}: ${e.message}`)).toEqual([])
  })

  test('предупреждений тоже нет — иначе пак учит плохому', () => {
    const warnings = lintPack(rounds).filter(f => f.level === 'warning')
    expect(warnings.map(w => `${w.roundName}/${w.catName ?? ''}: ${w.message}`)).toEqual([])
  })
})
