import { describe, it, expect } from 'vitest'
import { maySpeak } from '../composables/useVoiceFloor'

// Правило «кому можно говорить». Ключевой риск регрессии — заглушить фазы, где выкрикивать
// ОБЯЗАНЫ все (крокодил/алиас/картошка): глушим только `answering`, где отвечает один назначенный.
const base = {
  isHost: false, isSpectator: false, voiceMode: 'auto',
  questionStatus: 'idle', amFloorHolder: false
}

describe('maySpeak', () => {
  it('ведущего не глушим никогда', () => {
    expect(maySpeak({ ...base, isHost: true, voiceMode: 'silent' })).toBe(true)
    expect(maySpeak({ ...base, isHost: true, questionStatus: 'answering' })).toBe(true)
  })

  it('наблюдателя не трогаем (он и так без микрофона)', () => {
    expect(maySpeak({ ...base, isSpectator: true, voiceMode: 'silent' })).toBe(true)
  })

  it('режим open — говорят все, даже в ответе', () => {
    expect(maySpeak({ ...base, voiceMode: 'open', questionStatus: 'answering' })).toBe(true)
  })

  it('режим silent — молчат все, кроме ведущего', () => {
    expect(maySpeak({ ...base, voiceMode: 'silent' })).toBe(false)
    expect(maySpeak({ ...base, voiceMode: 'silent', amFloorHolder: true })).toBe(false)
  })

  describe('режим auto', () => {
    it('в фазе ответа молчат все, кроме отвечающего', () => {
      expect(maySpeak({ ...base, questionStatus: 'answering', amFloorHolder: false })).toBe(false)
      expect(maySpeak({ ...base, questionStatus: 'answering', amFloorHolder: true })).toBe(true)
    })

    // Главная защита от регрессии: в этих фазах тишина убила бы игру
    it.each([
      ['performing', 'крокодил/караоке — выкрикивают варианты'],
      ['alias_playing', 'алиас — выкрикивают варианты'],
      ['potato_playing', 'картошка — называют вслух'],
      ['among_us_voting', 'шпион — обсуждение'],
      ['buzzer_active', 'баззер — реакция, речь не мешает'],
      ['reading', 'чтение вопроса'],
      ['idle', 'между вопросами — обычный трёп']
    ])('фаза %s не глушится (%s)', (questionStatus) => {
      expect(maySpeak({ ...base, questionStatus })).toBe(true)
    })
  })
})
