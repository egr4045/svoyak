# Наряд: доделать @mygame/sdk для интеграции игры «Свояк»

> **Кому:** агенту, работающему в репозитории D:\dev\mygame (gamehub).
> **Контекст:** игра «Свояк» (отдельный репозиторий D:\dev\Svoyak, Vue 3) встраивает `@mygame/sdk`
> через IIFE-сборку (`packages/sdk/dist/mygame-sdk.global.js`, глобал `window.mygame`) и использует
> слой «переносных звонков» (`useCallStore`), который сейчас спроектирован, но не доведён до конца.
> Свояк-сторона уже готова и ждёт только пересобранный SDK.
> **Критерий готовности:** зелёный `pnpm --filter @mygame/sdk typecheck` + свежий `dist/`, в котором
> из браузерной консоли доступен `window.mygame.call.joinGameRoom`.

## 1. Починить `packages/sdk/src/state/chatStore.ts` (сейчас не компилируется)

Используются `Room`, `RoomEvent`, `VideoPresets`, `ScreenSharePresets` без импорта из `livekit-client`
(~строки 114, 130–152, 373, 518), и `getCallRoom` объявлен дважды: импорт из `./callStore.js` (:15) и
реэкспорт (:19), плюс локальное объявление (:115) с локальным синглтоном `callRoom` (:114). Это
середина рефакторинга: владение медиа переехало в `callStore` (см. doc-шапку callStore.ts).

**Правильное решение — довести рефакторинг:**
- удалить из chatStore локальные `callRoom` / `createCallRoom` / `fetchCallToken` (медиа-плибинг);
- `acceptCall` и автовход звонящего → делегировать в `useCallStore.getState().joinConversation(conversationId, { type })`;
- `hangup` → `useCallStore.getState().leave()` (+ существующий сигналинг `callHangup` по сокету);
- `toggleMic/Cam/ScreenShare` → `callStore.setMic/setCam/setScreenShare`;
- в chatStore остаётся только сигналинг (ring, ringing-состояния, сокет-события) и реэкспорт
  `getCallRoom` из строки :19.

Запасной минимум (если делегирование сейчас рискованно): доимпортировать livekit-client и убрать
дубль `getCallRoom` — но тогда два параллельных синглтона `Room` будут конфликтовать. Делегирование
сильно предпочтительнее.

## 2. Закоммитить untracked-файлы

`src/state/callStore.ts` и `src/components/call/` не в гите — это каноническая реализация
переносных звонков, должна попасть в репозиторий.

## 3. Экспортировать слой звонков

В `packages/sdk/src/index.ts` добавить: `export * from './state/callStore.js';`

## 4. Добавить неймспейс `call` в синглтон клиента

`packages/sdk/src/client.ts`, класс `MygameClient` — в стиле существующих неймспейсов (`auth`,
`social`, `chat`…), делегируя в `useCallStore.getState()`:

```ts
readonly call = {
  joinGameRoom: (game, room, opts?) => ...,      // Promise<boolean>
  joinConversation: (conversationId, opts?) => ...,
  leave: () => ...,
  setMic: (on) => ..., setCam: (on) => ..., setScreenShare: (on) => ...,
  setVolume: (accountId, v) => ..., setMuted: (accountId, m) => ...,
  attachVideo: (accountId, el) => ...,           // возвращает detach-функцию
  setEmbedded: (b) => ...,
  bindToRoom: (t: { game, room }) => ...,        // Promise<boolean>
  inviteToGame: (i: { game, gameName, room, url }) => ...,
  dismissInvite: () => ...,
  resume: () => ...,                             // Promise<void>
  getState: () => ...,   // срез: { status, kind, callKey, participants, embedded, pendingInvite, error }
  subscribe: (cb) => ...,                        // = useCallStore.subscribe, возвращает unsubscribe
};
```

Это всё, до чего не-React-игра дотягивается через `window.mygame` в IIFE-сборке. Свояк вызывает
именно эти методы (см. D:\dev\Svoyak\src\stores\platform.js).

## 5. Вызвать `resume()` из `init()`

`client.ts` `init()` (:69-82): после подключения сокетов добавить
`void useCallStore.getState().resume();` — doc-коммент в callStore.ts:132-134 это уже обещает,
но вызова нет. Без этого хаб→игра handoff звонка (`?call=`) не работает.

## 6. Добавить `mygame.auth.adoptSession(session: Session): void`

Сохранить полученную извне платформенную сессию (`saveSession` из `authClient.ts:35`, ключ
localStorage `civa.session`) и дёрнуть подключение social/chat-сокетов, если ещё не подключены.

**Зачем:** Свояк гасит 120-секундный handoff-токен **на своём сервере**
(`POST /auth/platform-bridge` → платформенный `POST /auth/exchange`, одно погашение) и возвращает
браузеру полную сессию `{accountId, displayName, accessToken, refreshToken}`. SDK должен принять её
без второго exchange. (Свояк сейчас имеет фолбэк — пишет `civa.session` в localStorage напрямую до
`init()`, — но официальный метод надёжнее.)

## 7. CallView: game-звонки и embedded-режим

`src/components/call/CallView.tsx` сейчас управляется только `useChatStore.activeCall` (:19) и
chatStore-овским `getCallRoom` (:89) — после `joinGameRoom` **ничего не рендерится**, звука нет.

Переделать:
- connected-поверхность вести от `useCallStore` (`status === 'connected'`, room из callStore,
  заголовок из `label`/`callKey`);
- `RingingView` оставить на `activeCall` из chatStore (звонки-разговоры);
- при `useCallStore().embedded === true` — не рендерить никакого хрома (без PiP-окна), но держать
  смонтированным `<RoomAudioRenderer />` — контракт описан в шапке callStore.ts:13-16. Видео игра
  рендерит сама через `attachVideo`.

## 8. UI приёма `pendingInvite` (приглашение «пошли играть» внутри звонка)

Никто не рендерит `useCallStore().pendingInvite`. Добавить баннер (в CallView или сиблинг в
`MygameOverlay`): «{fromName} зовёт в {gameName} — [Перейти] [Скрыть]».

- Перейти: `const pt = await getHandoff();` затем
  `location.href = `${invite.url}/?pt=${pt}&join=${invite.room}&call=game:${invite.game}:${invite.room}``
- Скрыть: `dismissInvite()`

Так остальные участники звонка хаба следуют за позвавшим в игру без переподключения медиа
(bind-алиас уже сделан на стороне позвавшего).

## 9. (Опционально, низкий приоритет) Кнопка «Пригласить в игру» в хабе

Проп `onInviteToGame?` в `ControlBar`/`CallView` (🎮-кнопка при `kind === 'conv'`); хаб передаёт
обработчик со своим пикером игры/комнаты → `bindToRoom` + `inviteToGame`. Свояк приглашает из
своего лобби, так что основной сценарий покрыт пп. 4 и 8.

## 10. Пересборка + проверка

```
pnpm --filter @mygame/sdk typecheck
pnpm --filter @mygame/sdk build
```
Затем в браузере убедиться, что `window.mygame.call.joinGameRoom` существует в
`dist/mygame-sdk.global.js` и IIFE не падает на чтении `import.meta` в `config.ts`.
После сборки на стороне Свояка выполняется `npm run sdk:sync` (копирует
`packages/sdk/dist/mygame-sdk.global.js` → `D:\dev\Svoyak\public\vendor\`).

## 11. Проверка сервисов

- `POST /chat/call/room-token` (services/chat/src/server.ts:156), `POST /chat/call/bind` (:178) и
  LiveKit-окружение живы на деплое.
- CORS auth (:8081) / social (:8083) / chat (:8084) разрешает ориджины Свояка:
  dev `http://localhost:5173` и `http://localhost:3000`, prod `http://<host>:8089`
  (см. deploy/svoyak/docker-compose.yml и apps/hub/src/platform/games.ts:67).
- Задокументировать, одноразов ли handoff-токен в `POST /auth/exchange` — Свояк рассчитывает на
  одно серверное погашение.

## 12. Флип реестра (строго последним, после e2e)

`apps/hub/src/platform/games.ts:60-69` — svoyak `status: 'playable'`, убрать `note`. Сверить, что
`routeToRoom` (`apps/hub/src/platform/inviteRouting.ts:13`) шлёт `?pt`, `?join`, `?spectate=1` —
boot-контракт Свояка (D:\dev\Svoyak\src\platform\boot.js) парсит именно их, а `?call=` оставляет
для `resume()`.
