# Своя Игра (Svoyak)

Многопользовательская онлайн «Своя игра» (Jeopardy-style квиз) — игра на платформе
**MyGame Hub**. Ведущий выбирает вопросы, игроки жмут баззер и отвечают, голос и камеры
приезжают из группового звонка хаба. Вход в игру — **только через хаб**.

- **Клиент:** Vue 3 (Composition API) + Pinia + Vue Router + `socket.io-client`, сборка Vite,
  стили Tailwind CSS 4.
- **Сервер:** Express 5 + Socket.io 4, SQLite (`sqlite3`), собственный JWT. Раздаёт собранный SPA,
  API и сокеты на одном порту.
- **Платформа:** SDK `@mygame/sdk` (из монорепозитория gamehub) подключается как self-contained
  IIFE-сборка через `window.mygame` — SSO, друзья/presence, чат, голос/видео на LiveKit, оверлей.

## Как это устроено

### Вход только через хаб
Игра запускается с карточки в MyGame Hub. Хаб открывает Свояк с одноразовым SSO-токеном:

```
?pt=<handoff>&join=<код комнаты>[&spectate=1][&call=game:svoyak:<код>]
```

`src/platform/boot.js` (до установки роутера) гасит `pt` на своём сервере
(`POST /auth/platform-bridge` → платформенный `POST /auth/exchange`), апсертит локального
пользователя по `platform_id`, поднимает SDK и маршрутизирует:
- есть `join` → лобби комнаты; нет → **Кабинет ведущего** (`/host`).

Прямой заход без `?pt=` показывает лендинг «Запусти из MyGame Hub». Создание комнаты и сокет
жёстко гейтятся по наличию `platformId` (403 иначе).

### Роли
- **Ведущий (host)** — создаёт комнату, ведёт игру из докнутой панели `HostPanel`.
- **Игрок** — жмёт баззер, отвечает, ставит, голосует.
- **Наблюдатель** — при переполнении мест (лимит задаёт ведущий, 2–16, по умолчанию 8),
  при входе после старта или по `?spectate=1`. Видит игру и участвует в голосе, но не отвечает.
  Может занять освободившееся место; ведущий продвигает/разжалует через ПКМ-меню.

### Голос и камеры
Через SDK (`mygame.call`, LiveKit): одна комната `game:svoyak:<код>` на игровую комнату. Групповой
звонок хаба «переезжает» в игру без переподключения медиа (`bindToRoom`/`resume`); камеры
участников встраиваются прямо в карточки игроков (`attachVideo`), есть индикатор «кто говорит»,
локальный мьют и громкость на игрока. Друзей зовут через встроенный виджет друзей SDK.

### Типы вопросов: 8 ядра + модификаторы

| Тип | Механика | Особенности задаются |
|---|---|---|
| `quiz` | Вопрос-ответ (баззер/письменно) | `answerMode: 'buzzer'\|'written'` · `glitch: true` (глитч-текст, первый нажавший отвечает) · `snippet: true` (фрагмент, «открыть больше» снижает цену) · `stake: 'none'\|'auction'\|'cat'` (торги вслепую / рулетка-жертва) · медиа — просто `mediaType`+`mediaSrc` |
| `show` | Один исполняет — остальные угадывают | `showMode: 'charades'\|'karaoke'\|'alias'`; секрет (слово/реф-аудио/список слов) уходит приватным `privateReveal` |
| `everyone` | Все сдают одновременно (sealed) | `everyoneMode: 'number'\|'tierlist'\|'whosaid'` |
| `sketch` | Все рисуют, голосование за лучший | — |
| `among_us` | «Шпион» (механика Хамелеона): все видят вопрос, кроме шпиона — он блефует; обсуждение и голосование | id шпиона вне broadcast до вскрытия |
| `potato` | Горячая картошка со скрытым таймером | — |
| `reaction` | Двухфазная реакция: чтение правила → сетка с дедлайном; промахи публичны | контент генерирует движок |
| `rps` | Камень-ножницы: тайная дуэль двух игроков | — |

Логика — в `server/game/questions/*Handler.js` (реестр в `GameState.js`), UI перехода по
этапам — в `HostPanel` (ключуется на `questionStatus`, не на типе).

**Миграция легаси-паков.** Старые id (`text`, `media`, `text_input`, `glitch`, `snippet`,
`auction`, `cat`, `poker`→quiz+auction, `charades`, `karaoke`, `alias`, `number`, `tierlist`,
`whosaid`) автоматически и навсегда конвертируются в новую модель слоем
`server/game/packMigrate.js` на каждом входе данных: создание комнаты, GET/PUT пака,
импорт ZIP, разовый свип БД при старте сервера. Старые ZIP-экспорты играются без правок.

### Приколы ведущего и финал
Плавающий пульт 🎉 (`FunPanel`): **саундборд** (фанфары/дробь/тромбон/кряк/овации на всех),
**эффекты** (конфетти, тряска, адресный «глитч экрана» игрока) и **очковая рулетка**
(подарок/налог/кража/обмен/удвоение/обнуление — исход решает сервер и применяет очки после
остановки колеса). События `fun:*` транзиентные, с рейт-лимитами (`server/handlers/funTools.js`).
Финал игры — табло с подиумом, фейерверком и «Сыграть ещё раз» (`FinalScoreboard.vue`).

### Синхронизация медиа
`host:controlMedia {status, position}` ставит серверный якорь `{anchorPosition, anchorAt}`;
клиенты считают ожидаемую позицию через дельту часов (`sync:ping`) и сикают к ней
(`useSyncedMedia`): опоздавшие стартуют с нужного места, дрейф >1.5с корректируется.
Обычные обновления стейта летят **без пака** (слим-бродкаст, `roundsData` — только при
`room:join` и `resetGame`).

### Кабинет ведущего и конструктор паков (`/host`)
- **Создать игру** — выбор пака (встроенный или свой) + число мест.
- **Встроенные паки** живут в коде (`server/game/builtinPacks.js`), а не в БД: у них нет владельца
  и TTL, комната узнаёт их по префиксу `builtin:` в `packId`. Кроме дефолтного есть
  **«Тестовый»** (`server/game/testPackData.js`) — витрина всех 8 типов во всех вариантах, где
  тексты вопросов описывают сами себя («это поле q», «это a, его видит только исполнитель»).
  Удобно как ручной смоук после правок в типах; актуальность покрытия стережёт
  `server/tests/testPack.test.js`. Кнопка **«⧉ Скопировать в мои паки»** делает из него
  обычный редактируемый пак (`GET /api/packs/builtin/:key`).
- **🧪 Тестовый режим** — вместо предпросмотра запускается **настоящая игра с ботами**: тот же
  `GameState`, те же хендлеры и таймеры, просто вместо живых людей боты (`server/bots/`).
  3 игрока + ведущий; тестер садится на любое место (`seat: 'player'` — ведущий тоже бот).
  Боты сами выбирают вопросы, жмут баззер с человеческой задержкой, пишут ответы, торгуются,
  рисуют, голосуют и тапают. Кнопка **▶** на ячейке в редакторе режет пак до одного вопроса
  (`only: {r,c,q}`) — открылся, отыгрался, `game_over`. Прогон ничего не сохраняет:
  `packId` в комнате всегда `null`, поэтому «пройденные паки» не меняются.
  Устройство ботов и почему они ходят через фейковый сокет — в `server/bots/README.md`.
- **Мои паки** — конструктор `PackEditor.vue`: дерево раунды → категории → вопросы, все 8 типов,
  загрузка медиа. Паки хранятся на сервере **30 дней**; чтобы не потерять — **экспорт/импорт ZIP**
  (`pack.json` + медиа). Кастомный пак прокидывается в комнату через `packId`.

Схема пака (новая модель):
```
{ name, data: { rounds: [ { name, categories: [ { category, questions: [ {
  points, type,                       // quiz | show | everyone | sketch | among_us | potato | reaction | rps
  q?, a?,                             // вопрос/ответ (см. таблицу типов)
  mediaType?, mediaSrc?,              // медиа quiz / реф-аудио караоке
  answerMode?, glitch?, snippet?, stake?,   // модификаторы quiz
  showMode?, words?, timerSec?,             // show (алиас: words+timerSec)
  everyoneMode?, numberKind?, items?        // everyone
} ] } ] } ] } }
```

## Структура

```
src/
  platform/       мост к платформе: boot.js (SSO/роутинг), sdk.js (window.mygame), contextMenu.js
  stores/         game.js (игровое состояние + сокет), platform.js (мост zustand→Pinia), packs.js
  views/          HomeView (лендинг), HostCabinet (/host), LobbyView, GameView
  components/     GameBoard, ActiveQuestion, HostPanel, PlayerPanel, MediaPlayer, EffectsOverlay,
                  FinalScoreboard, host/FunPanel, questions/*.vue, pack/PackEditor.vue
  composables/    useSyncedMedia.js (синхронизированный плеер)
  lib/            sfx.js (WebAudio-звуки), confetti.js, audioUnlock.js, mediaClock.js, mediaBus.js
  assets/styles.css   дизайн-система «неон-вечеринка»: токены хаба + party-неон, keyframes,
                      шрифты Unbounded/Inter (self-hosted, кириллица)
server/
  index.js        Express + Socket.io, статик SPA/медиа, гейт platformId, бут-свип миграции паков
  auth.js         JWT, /auth/platform-bridge (SSO-мост)
  routes/packs.js CRUD паков, загрузка медиа на диск, экспорт/импорт ZIP, TTL 30 дней
  game/           GameState.js (state-машина) + packMigrate.js + questions/*Handler.js
  handlers/roomHandlers.js   сокет-события (host:* / player:* / room:*), funTools.js (приколы)
  managers/RoomManager.js    комнаты в памяти (4-значный код), уборка пустых
  db/database.js  схема SQLite (users, packs); БД в server/data/svoyak.db
  uploads/packs/  медиа кастомных паков (на диске; отдаётся под /packs-media)
```

## Разработка

```sh
npm install            # клиент
cd server && npm install

# сервер (порт 3000 по умолчанию)
cd server && npm start
# клиент с HMR (порт 5173)
npm run dev
```

Вход только через хаб, поэтому для локального теста нужен платформенный `?pt=`. Без поднятого стека
хаба используйте заглушку `scratchpad/dev-hub-stub.mjs` (стаб `/auth/exchange` + сервер на :3005),
затем откройте `http://localhost:3005/?pt=pt_<любойId>_<ИмяЛатиницей>`.

Переменные окружения:
- сервер: `PORT`, `JWT_SECRET`, `PLATFORM_AUTH_URL` (auth-сервис платформы, dev `http://localhost:8081`).
- клиент: `VITE_API_URL`, `VITE_HUB_URL`.

## Тесты

```sh
cd server && npm test     # Jest: юнит-тесты серверной логики
npm run test:unit         # Vitest (клиент)
```

Главная страховка механик — `server/tests/bots/fullGame.test.js`: боты играют ЦЕЛЫЕ партии на
виртуальных таймерах (встроенный пак и дефолтный, 20 разных сидов) и обязаны дойти до `game_over`
с отыгранной доской, ни разу не воспользовавшись аварийным закрытием вопроса. Это единственный
способ доказать, что машина из ~30 значений `questionStatus` нигде не встаёт насмерть.

## Деплой (платформа gamehub)

Свояк — on-demand игра: оркестратор хаба будит её при заходе игрока и усыпляет при простое.
Собирается в один Docker-образ (`deploy/svoyak/Dockerfile` в репозитории gamehub клонирует этот
репозиторий с GitHub и билдит SPA + сервер).

```sh
# на сервере, в /root/gamehub/deploy/svoyak
docker build --network=host --no-cache -t svoyak:latest .
docker compose up -d --force-recreate
```

`docker-compose.override.yml` задаёт `PLATFORM_AUTH_URL=http://auth:8081` (в сети `gamehub-net`) и
**тома `svoyak-data` (БД) и `svoyak-uploads` (медиа паков)**. Важно: тома монтируются на
`server/data` и `server/uploads`, **не** на `server/db` — иначе том перекрыл бы исходный
`database.js` и заморозил миграции схемы.

## Связанное
- [`GAMEHUB_WORK_ORDER.md`](GAMEHUB_WORK_ORDER.md) — наряд по доработке SDK на стороне gamehub
  (выполнен: `mygame.call`, `adoptSession`, embedded CallView, приглашения в звонке).
