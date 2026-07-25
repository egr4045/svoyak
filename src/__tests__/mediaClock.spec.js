import { describe, test, expect } from 'vitest'
import { expectedPosition } from '../lib/mediaClock'

// Чистая математика синхронизации позиции медиа (якорь сервера + дельта часов)
describe('expectedPosition', () => {
  test('stopped: возвращает позицию якоря', () => {
    expect(expectedPosition({ status: 'stopped', anchorPosition: 42, anchorAt: 123 })).toBe(42)
  })

  test('playing: якорь + прошедшее серверное время', () => {
    const now = 100000
    const ms = { status: 'playing', anchorPosition: 10, anchorAt: now - 5000 }
    expect(expectedPosition(ms, 0, now)).toBeCloseTo(15, 5)
  })

  test('учитывает дельту часов клиента', () => {
    const now = 100000
    // Клиент отстаёт от сервера на 2с: серверное «сейчас» = now + 2000
    const ms = { status: 'playing', anchorPosition: 0, anchorAt: now }
    expect(expectedPosition(ms, 2000, now)).toBeCloseTo(2, 5)
  })

  test('не уходит в минус и терпит мусор', () => {
    expect(expectedPosition({ status: 'playing', anchorPosition: 0, anchorAt: Date.now() + 60000 })).toBe(0)
    expect(expectedPosition(null)).toBe(0)
    expect(expectedPosition({ status: 'playing' })).toBe(0)
  })
})
