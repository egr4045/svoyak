import { describe, it, expect } from 'vitest'
import { volumeFor, DUCK_VOLUME } from '../composables/useVoiceFloor'

// Правило приглушения. Два риска регрессии:
//  1) приглушить фазы, где выкрикивают ВСЕ (крокодил/алиас/картошка) — это убьёт игру;
//  2) приглушить ведущего — его должно быть слышно всегда.
const base = {
  voiceMode: 'auto', questionStatus: 'idle',
  isFloorHolder: false, isHost: false
}

describe('volumeFor', () => {
  it('ведущего не приглушаем никогда', () => {
    expect(volumeFor({ ...base, isHost: true, voiceMode: 'host_only' })).toBe(1)
    expect(volumeFor({ ...base, isHost: true, questionStatus: 'answering' })).toBe(1)
  })

  it('режим «не приглушать» — все на полной громкости', () => {
    expect(volumeFor({ ...base, voiceMode: 'open', questionStatus: 'answering' })).toBe(1)
  })

  it('режим «только ведущего» — остальные тише всегда', () => {
    expect(volumeFor({ ...base, voiceMode: 'host_only' })).toBe(DUCK_VOLUME)
    expect(volumeFor({ ...base, voiceMode: 'host_only', isFloorHolder: true })).toBe(DUCK_VOLUME)
  })

  describe('режим «по игре»', () => {
    it('в фазе ответа отвечающий громкий, остальные приглушены', () => {
      expect(volumeFor({ ...base, questionStatus: 'answering', isFloorHolder: true })).toBe(1)
      expect(volumeFor({ ...base, questionStatus: 'answering', isFloorHolder: false })).toBe(DUCK_VOLUME)
    })

    // Главная защита: в этих фазах приглушать нельзя
    it.each([
      ['performing', 'крокодил/караоке — выкрикивают варианты'],
      ['alias_playing', 'алиас — выкрикивают варианты'],
      ['potato_playing', 'картошка — называют вслух'],
      ['among_us_voting', 'шпион — обсуждение'],
      ['buzzer_active', 'баззер — реакция, речь не мешает'],
      ['reading', 'чтение вопроса'],
      ['idle', 'между вопросами — обычный трёп']
    ])('фаза %s не приглушается (%s)', (questionStatus) => {
      expect(volumeFor({ ...base, questionStatus })).toBe(1)
    })
  })

  it('приглушение — именно тише, а не тишина', () => {
    expect(DUCK_VOLUME).toBeGreaterThan(0)
    expect(DUCK_VOLUME).toBeLessThan(1)
  })
})
