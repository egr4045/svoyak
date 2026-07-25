import { describe, test, expect } from 'vitest'
import { typeConfig } from '../components/pack/quicktest/roleMatrix'

// Быстрый тест редактора: конфиг механики резолвится из вопроса (тип + модификаторы)
describe('typeConfig: диспатч по модификаторам новой модели', () => {
  test('quiz: модификаторы выбирают механику', () => {
    expect(typeConfig({ type: 'quiz' }).phases[0].status).toBe('reading')
    expect(typeConfig({ type: 'quiz', mediaSrc: '/x.mp3', mediaType: 'audio' }).phases[0].label).toBe('медиа')
    expect(typeConfig({ type: 'quiz', answerMode: 'written' }).phases[0].status).toBe('text_inputting')
    expect(typeConfig({ type: 'quiz', stake: 'auction' }).phases[0].status).toBe('auction_bidding')
    expect(typeConfig({ type: 'quiz', stake: 'cat' }).phases[0].status).toBe('cat_target_selection')
    expect(typeConfig({ type: 'quiz', snippet: true }).phases[0].status).toBe('snippet_playing')
    expect(typeConfig({ type: 'quiz', glitch: true }).phases[0].status).toBe('reading') // buzzer-фазы с глитч-сидом
  })

  test('show/everyone: режим выбирает фазы и роли', () => {
    expect(typeConfig({ type: 'show', showMode: 'charades' }).phases.map(p => p.status)).toContain('performing')
    expect(typeConfig({ type: 'show', showMode: 'alias' }).phases.map(p => p.status)).toContain('alias_playing')
    expect(typeConfig({ type: 'show', showMode: 'karaoke' }).roles).toContain('performer')
    expect(typeConfig({ type: 'everyone', everyoneMode: 'number' }).phases[0].status).toBe('number_inputting')
    expect(typeConfig({ type: 'everyone', everyoneMode: 'tierlist' }).phases[0].status).toBe('tier_rating')
    expect(typeConfig({ type: 'everyone', everyoneMode: 'whosaid' }).phases[0].status).toBe('whosaid_collecting')
  })

  test('шпион: роль imposter в списке ролей', () => {
    expect(typeConfig({ type: 'among_us' }).roles).toContain('imposter')
  })

  test('легаси-строки продолжают резолвиться (страховка)', () => {
    expect(typeConfig('text').phases[0].status).toBe('reading')
    expect(typeConfig('karaoke').roles).toContain('performer')
    expect(typeConfig('tierlist').phases[0].status).toBe('tier_rating')
  })

  test('неизвестный тип падает в text-конфиг, а не роняет превью', () => {
    expect(typeConfig({ type: 'wtf' }).phases[0].status).toBe('reading')
  })
})
