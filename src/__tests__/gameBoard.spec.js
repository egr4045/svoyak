import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GameBoard from '../components/GameBoard.vue'
import { useGameStore } from '../stores/game'

// Регрессия на реальный баг из пака пользователя: доска рендерилась рассинхронизированно с
// данными, если у категорий РАЗНОЕ число вопросов (5 / 6 / 5). Виноват был v-memo — он кэширует
// узлы позиционно, и состояние одной строки применялось к другой: отвеченные ячейки оставались
// кликабельными, а нетронутые гасли. Снаружи выглядело как «вопросы не открываются».
vi.mock('../lib/confetti', () => ({ rain: () => {}, burst: () => {}, fireworks: () => {} }))
vi.mock('../lib/sfx', () => ({ playSfx: () => {}, preloadSfx: () => {} }))

const board = () => [
  { category: 'Загадки человечества', questions: [100, 200, 300, 400, 500].map(p => ({ points: p, type: 'quiz', answered: true })) },
  { category: 'Шесть вопросов', questions: [100, 200, 300, 400, 500, 600].map(p => ({ points: p, type: 'quiz', answered: false })) },
  { category: 'Пять вопросов', questions: [100, 200, 300, 400, 500].map(p => ({ points: p, type: 'quiz', answered: false })) }
]

function mountBoard() {
  const store = useGameStore()
  store.$patch({
    board: board(), roundsData: [], roundsCount: 1, currentRoundIndex: 0,
    questionStatus: 'idle', gameStarted: true,
    host: { id: 1, username: 'H' }, user: { id: 1, username: 'H' },
    players: [], spectators: [], highlightedQuestion: null
  })
  const wrapper = mount(GameBoard, { global: { stubs: { FinalScoreboard: true } } })
  return { store, wrapper }
}

// Десктопная сетка идёт первой; берём её строки-гриды
const desktopRows = (wrapper) => wrapper.findAll('.hidden > div')

describe('GameBoard: доска с категориями разной длины', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('состояние ячеек совпадает со стором построчно', () => {
    const { store, wrapper } = mountBoard()
    const rows = desktopRows(wrapper)
    expect(rows).toHaveLength(3)
    rows.forEach((row, ci) => {
      const cells = row.findAll('button')
      const expected = store.board[ci].questions
      expect(cells).toHaveLength(expected.length)
      cells.forEach((cell, qi) => {
        expect(cell.attributes('disabled') !== undefined).toBe(!!expected[qi].answered)
      })
    })
  })

  it('клик отдаёт координаты именно той ячейки, по которой кликнули', async () => {
    const { store, wrapper } = mountBoard()
    const spy = vi.spyOn(store, 'selectQuestion').mockImplementation(() => {})
    // Последний вопрос шестивопросной строки — та самая позиция, где кэш смещался
    await desktopRows(wrapper)[1].findAll('button')[5].trigger('click')
    expect(spy).toHaveBeenCalledWith(1, 5)
    await desktopRows(wrapper)[2].findAll('button')[4].trigger('click')
    expect(spy).toHaveBeenLastCalledWith(2, 4)
  })

  it('отвеченные ячейки не отправляют запрос', async () => {
    const { store, wrapper } = mountBoard()
    const spy = vi.spyOn(store, 'selectQuestion').mockImplementation(() => {})
    await desktopRows(wrapper)[0].findAll('button')[0].trigger('click')
    expect(spy).not.toHaveBeenCalled()
  })
})
