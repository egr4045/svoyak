// ПКМ-меню по карточкам игроков/наблюдателей: платформенные действия (SDK)
// + игровые действия ведущего (существующие socket-события).
// MenuItem SDK: { label?, action, disabled?, separator?, danger? } — плоский список.

import { getPlatform } from './sdk'
import { usePlatformStore } from '../stores/platform'
import { useGameStore } from '../stores/game'

// target: игрок или наблюдатель из store.players/store.spectators
// role: 'player' | 'spectator'
export function showParticipantMenu(target, event, role = 'player') {
  const platform = getPlatform()
  const game = useGameStore()
  const social = usePlatformStore()

  const isHost = game.host && game.user && String(game.host.id) === String(game.user.id)
  const isSelf = game.user && String(target.id) === String(game.user.id)
  const items = []

  // --- Платформенная секция (только для участников с аккаунтом платформы) ---
  if (platform && target.platformId && !isSelf && social.me && target.platformId !== social.me.accountId) {
    items.push({
      label: '💬 Написать сообщение',
      action: () => social.openChatWith(target.platformId, target.name)
    })
    items.push({
      label: '➕ Добавить в друзья',
      action: () => {
        social.addFriend(target.platformId)
        social.toast(`Запрос в друзья: ${target.name}`)
      }
    })

    const participant = social.participantFor(target.platformId)
    if (participant && !participant.isLocal) {
      items.push({
        label: participant.muted ? '🔊 Снять заглушку' : '🔇 Заглушить локально',
        action: () => social.setLocalMuted(target.platformId, !participant.muted)
      })
      const vol = Math.round((participant.volume ?? 1) * 100)
      items.push({
        label: `➖ Громкость (сейчас ${vol}%)`,
        disabled: vol <= 0,
        action: () => social.setVolume(target.platformId, Math.max(0, (participant.volume ?? 1) - 0.25))
      })
      items.push({
        label: '➕ Громкость',
        disabled: vol >= 100,
        action: () => social.setVolume(target.platformId, Math.min(1, (participant.volume ?? 1) + 0.25))
      })
    }
  }

  // --- Игровая секция (только ведущий) ---
  if (isHost && !isSelf) {
    if (items.length) items.push({ separator: true, action: () => {} })

    if (role === 'player') {
      items.push({
        label: '🎯 Передать право выбора',
        disabled: game.questionStatus !== 'idle',
        action: () => game.setSelectingPlayer(target.id)
      })
      items.push({
        label: '👁 Сделать наблюдателем',
        disabled: game.gameStarted && game.questionStatus !== 'idle',
        action: () => game.makeSpectator(target.id)
      })
    } else {
      items.push({
        label: '🎮 Сделать игроком',
        disabled: game.seatsFree === 0,
        action: () => game.promoteSpectator(target.id)
      })
    }

    items.push({
      label: '🚪 Кикнуть',
      danger: true,
      action: () => {
        if (confirm(`Кикнуть ${target.name}?`)) game.kickPlayer(target.id)
      }
    })
  }

  if (!items.length || !platform?.ui?.showContextMenu) return false

  event.preventDefault()
  platform.ui.showContextMenu({ x: event.clientX, y: event.clientY, items })
  return true
}
