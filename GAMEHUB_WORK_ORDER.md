# Наряд агенту gamehub: отдать Свояк по HTTPS (чтобы заработали голос/камеры)

> **Кому:** агенту в репозитории D:\dev\mygame (gamehub).
> **Зачем:** голос/видео в Свояке не работают, потому что игра отдаётся по `http://186.246.11.239:8089`
> (незащищённый контекст) — `getUserMedia` там заблокирован браузером. Нужно отдавать Свояк по HTTPS
> через шлюз хаба на суб-пути `https://mygame-quiz.ru/svoyak/` (secure context + same-origin с
> chat.io/social.io/LiveKit). Свояк-сторона (Vite base, префиксы URL) уже готова и ждёт этих правок.
> **Результат:** запуск из хаба ведёт на `https://mygame-quiz.ru/svoyak/?pt=…`, микрофон/камера работают.

## 1. Шлюз Caddy — маршрут `/svoyak/*`
`deploy/gamehub/Caddyfile` (сервис `web`, :8088). Добавить перед SPA-fallback `handle {}` блок по образцу
`/example-game/*` (префикс СТРИПАЕТСЯ — сервер Свояка остаётся на root):
```caddy
handle_path /svoyak/* { reverse_proxy svoyak:8089 }
```
`svoyak` уже в сети `gamehub-net` (см. `deploy/svoyak/docker-compose.yml`). Провалидировать
(`docker exec gamehub-web-1 caddy validate --config /etc/caddy/Caddyfile` или аналог) и перезагрузить
web-контейнер. До пробуждения оркестратором будет 502 — это норма (как `lobby`/`cards-server`).

## 2. Реестр `apps/hub/src/platform/games.ts`
В запись `svoyak` добавить `path: 'svoyak'` (оставить `externalPort: 8089` как dev-фолбэк — как у
`cards`/`example-game`). Тогда `getGameOrigin` в проде вернёт `https://mygame-quiz.ru/svoyak`, и
«Играть»/инвайты поведут на secure-URL вместо `http://:8089`. **Пересобрать + редеплой хаба** (games.ts
компилируется в бандл).

## 3. `deploy/svoyak/Dockerfile` — build-arg base
Перед `RUN npm ci && npm run build` добавить:
```dockerfile
ENV VITE_BASE_PATH=/svoyak/
```
Свояк читает `process.env.VITE_BASE_PATH` в `vite.config.js` (`base`), а `API_URL`/socket.io/vendored SDK
берут префикс из `import.meta.env.BASE_URL`. Пересобрать образ на сервере:
`cd /root/gamehub/deploy/svoyak && docker build --network=host --no-cache -t svoyak:latest . &&
docker compose up -d --force-recreate`.

> ⚠️ **Координация:** сборку Свояка с `base=/svoyak/` катить в прод ТОЛЬКО вместе с Caddy-маршрутом (п.1),
> иначе и прямой `:8089`, и запуск из хаба сломаются на путях ассетов (`/svoyak/assets/…` без стрипа
> префикса не отдаётся). Порядок: (1) Caddy-маршрут → (2) rebuild svoyak с base → (3) games.ts + redeploy хаба.

## 4. Закоммитить IIFE-фикс SDK (из прошлого рефакторинга, всё ещё не в гите)
`packages/sdk/tsup.config.ts` — во второй сборке (IIFE, `entry: { 'mygame-sdk': 'src/global.ts' }`) должны
быть `platform: 'browser'` + `env: { NODE_ENV: 'production' }`. Без этого IIFE собирается под platform:node
и падает в браузере (`process is not defined` / `Dynamic require of "fs"`), `window.mygame` не встаёт.
Правка уже применена в рабочем дереве gamehub — **закоммитить**, чтобы будущий `pnpm --filter @mygame/sdk
build` не вернул сломанный вариант. (Свояк уже несёт корректно собранный `public/vendor/mygame-sdk.global.js`.)

## Что менять НЕ нужно
chat-сервис, LiveKit-конфиг (`wss://mygame-quiz.ru/gamehub-livekit`), оркестратор — без изменений
(CORS wildcard, bearer-auth, seat-agnostic room-token, `/metrics`-probe по `svoyak:8089` — всё работает).

## Проверка (после правок)
Запуск Свояка из хаба → адрес `https://mygame-quiz.ru/svoyak/?pt=…`. В консоли: `window.isSecureContext
=== true`, `window.mygame` — объект, `/svoyak/vendor/mygame-sdk.global.js` 200, `/svoyak/assets/*` 200.
Два аккаунта в одной комнате: микрофон включается без ошибки, слышно в обе стороны, камера появляется на
карточке игрока.
