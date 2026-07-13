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

### Типы вопросов
`text` (баззер) · `media` (фото/аудио/видео) · `text_input` (письменный ответ) · `glitch` ·
`cat` (Кот в мешке, рулетка) · `among_us` (скрытый шпион + голосование) · `poker` · `auction`
(аукцион вслепую) · `sketch` (рисование + голосование). Логика каждого типа — в
`server/game/questions/*Handler.js` (реестр в `GameState.js`), UI перехода по этапам — в `HostPanel`.

### Кабинет ведущего и конструктор паков (`/host`)
- **Создать игру** — выбор пака (встроенный или свой) + число мест.
- **Мои паки** — конструктор `PackEditor.vue`: дерево раунды → категории → вопросы, все 8 типов,
  загрузка медиа. Паки хранятся на сервере **30 дней**; чтобы не потерять — **экспорт/импорт ZIP**
  (`pack.json` + медиа). Кастомный пак прокидывается в комнату через `packId`.

Схема пака:
```
{ name, data: { rounds: [ { name, categories: [ { category,
  questions: [ { points, type, q, a, mediaType?, mediaSrc?, answerMediaType?, answerMediaSrc? } ] } ] } ] } }
```

## Структура

```
src/
  platform/       мост к платформе: boot.js (SSO/роутинг), sdk.js (window.mygame), contextMenu.js
  stores/         game.js (игровое состояние + сокет), platform.js (мост zustand→Pinia), packs.js
  views/          HomeView (лендинг), HostCabinet (/host), LobbyView, GameView
  components/      GameBoard, ActiveQuestion, HostPanel, PlayerPanel, PlayerVideo, VoiceBar,
                  questions/*.vue, pack/PackEditor.vue
  assets/styles.css   дизайн-токены хаба (@theme) + классы .panel-glass/.hub-btn*
server/
  index.js        Express + Socket.io, статик SPA/медиа, гейт platformId
  auth.js         JWT, /auth/platform-bridge (SSO-мост)
  routes/packs.js CRUD паков, загрузка медиа на диск, экспорт/импорт ZIP, TTL 30 дней
  game/           GameState.js (state-машина) + questions/*Handler.js
  handlers/roomHandlers.js   сокет-события (host:* / player:* / room:*)
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

E2E-скрипты (в `scratchpad/`, гоняют реальный сервер со стаб-auth): `e2e-mechanics.mjs` — все типы
вопросов доходят до разрешения; `e2e-packs.mjs` — create → медиа → комната → экспорт/импорт.

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
