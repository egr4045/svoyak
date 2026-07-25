// Досылка инвайтов тем, кто вошёл в звонок ПОСЛЕ создания игры.
//
// Инвайт в SDK — сообщение по data-каналу LiveKit: у канала нет истории, поэтому опоздавший ничего
// не получил. Ведущий следит за составом звонка и, увидев участника, которого нет ни в игре, ни в
// списке уже приглашённых, повторяет рассылку. Обратное направление (кто вошёл в игру → попадает в
// звонок) обеспечивают вотчеры joinVoice в LobbyView/GameView.
//
// Дебаунс нужен потому, что состав звонка «дрожит» пачками: при входе одного человека прилетает
// несколько событий подряд (участник, затем его треки).

import { computed, watch, onUnmounted } from 'vue'

const DEBOUNCE_MS = 1500

export function useCallInvite(gameStore, platformStore, isHostRef) {
  // Кто уже в игре — игроки и наблюдатели. Их звать не надо.
  const rosterIds = computed(() => new Set(
    [...gameStore.players, ...gameStore.spectators]
      .map(p => p.platformId)
      .filter(Boolean)
  ))

  // Отслеживаем именно СОСТАВ звонка, а не весь массив участников: иначе вотчер срабатывал бы на
  // каждое изменение micOn/speaking/volume, то есть постоянно.
  const rosterKey = computed(() =>
    platformStore.voice.participants.map(p => p.accountId).sort().join(','))

  let timer = null
  const stop = watch(rosterKey, () => {
    if (!isHostRef.value) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (!isHostRef.value || !gameStore.roomCode) return
      platformStore.inviteNewcomers(gameStore.roomCode, rosterIds.value)
    }, DEBOUNCE_MS)
  })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    stop()
  })
}
