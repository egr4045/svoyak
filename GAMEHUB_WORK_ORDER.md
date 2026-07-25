# Наряд агенту gamehub — ВЫПОЛНЕН (закрыт 26.07.2026)

> Наряд был про HTTPS-раздачу Свояка (без неё не работали микрофон/камера: `getUserMedia`
> заблокирован в незащищённом контексте `http://…:8089`). **Все четыре пункта сделаны в
> `D:\dev\mygame`** — проверено чтением репозитория, не только по коммитам:

| Пункт | Где | Статус |
|---|---|---|
| Caddy-маршрут `handle_path /svoyak/*` | `deploy/gamehub/Caddyfile:95-97` | ✅ |
| `path: 'svoyak'` в реестре игр | `apps/hub/src/platform/games.ts:84` | ✅ |
| `ENV VITE_BASE_PATH=/svoyak/` | `deploy/svoyak/Dockerfile:24` | ✅ |
| IIFE SDK под браузер (`platform:'browser'`) | `packages/sdk/tsup.config.ts:25-26` | ✅ закоммичен |

Коммиты в gamehub: `a858acc` (HTTPS /svoyak/) и `57f298d` (IIFE platform:browser).

## Следствие, о котором важно помнить

Свояк теперь **same-origin с хабом** (`https://mygame-quiz.ru/svoyak/`). Отсюда работает главное:
`localStorage` (`gamehub.session`, `gamehub.activeCall`) общий, поэтому `call.resume()` внутри
`mygame.init()` подхватывает групповой звонок хаба уже на странице игры — без этого «звонок
переезжает в игру» не собрать. В dev (Свояк на `:8089`, другой origin) это не работает, и перенос
звонка держится на `?call=` в URL запуска — см. ниже.

## Что доделано сверх наряда (26.07.2026, тем же агентом, что и Свояк)

Работа по «звонок = лобби игры» потребовала правок на стороне хаба; они **уже внесены в
`D:\dev\mygame`** (не закоммичены на момент написания):

- `apps/hub/src/platform/enterGameFlow.ts` — кнопка «Играть» доносит `?call=<callKey>`, если
  игрок в звонке. Перенос звонка перестал зависеть от общего origin (и стал тестируемым в dev).
  `HubScreen.handlePlay` больше не дублирует этот флоу, а зовёт `enterAndPlayGame`.
- `services/chat/src/server.ts` + `packages/protocol/src/chat.ts` — `POST /chat/call/unbind`
  (снимает привязку `game:<g>:<r>` → рум беседы; участник беседы только, идемпотентен) и
  необязательный `label` у `/chat/call/bind`, который возвращается из `/chat/call/room-token`.
  Без unbind алиас жил все 24 ч TTL, и игра, переиспользовавшая код комнаты, увела бы своих
  игроков в чужой звонок.
- `packages/sdk` — `call.unbindRoom({game,room})`, `bindToRoom({...,label})`, состояние
  `boundGame`, `getState()` отдаёт `conversationId`/`label`/`boundGame`; `CallView` титулует
  привязанный разговорный звонок именем игры («Лобби Свояк») вместо имени беседы.
- Тесты: `services/chat/src/server.test.ts` — bind→unbind меняет реально выдаваемый LiveKit-рум,
  чужой не может отвязать, unbind несуществующего не ошибка.

После любой пересборки SDK в Свояке нужно `npm run sdk:sync` (копирует IIFE в
`public/vendor/mygame-sdk.global.js`) — уже сделано для правок выше.

## Известное, НЕ трогали

`apps/hub/src/mobile/MobileFriendsTab.tsx:33,312` — 2 ошибки eslint
(`no-unused-expressions`), из-за которых падает `pnpm lint` в `@mygame/hub`. Они были на чистом
HEAD до этих правок; чужая территория, не наша волна.
