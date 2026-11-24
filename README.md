# Trading Terminal (T-Invest API)

Легковесный торговый терминал с котировками [T-Invest API](https://developer.tbank.ru/invest/) от Т-Банка:
TradingView-подобные графики, биржевой стакан и собственные индикаторы на Pine Script.

- **Desktop:** Tauri v2 (Rust) — токен хранится в системном хранилище, market data идёт по gRPC.
- **Web / PWA:** локальный Node.js (Fastify) прокси — токен в файле `data/secrets.json` (0600),
  браузер общается с ним по REST + SSE, поэтому CORS не мешает и токен не утекает в веб.

Mock-данных нет: всё, что видно на экране, приходит с реальных эндпоинтов T-Invest API.

---

## Возможности

| Блок | Что умеет |
|---|---|
| Инструменты | поиск по тикеру/названию (акции, фьючерсы, валюта, фонды Мосбиржи), автодополнение |
| График | свечи + объёмы, таймфреймы `1m 5m 15m 1h 4h 1D 1W`, стриминг, синхронное перекрестие, OHLCV |
| Рисование | горизонтальный уровень, трендовая линия, луч, прямоугольник, линейка, удаление всех |
| Индикаторы | редактор CodeMirror, JS и базовый Pine `//@version=5`, `ta.*`, `plot`, `hline`, Worker, localStorage |
| Стакан | `GetOrderBook` в реальном времени, бары объёма, лучший спред, перевес покупателей/продавцев |
| Темы | Dark (TradingView), Light, Midnight Black + настройка цветов, сохранение в профиле |
| Раскладка | Desktop: шапка / панель рисования / график / стакан / выдвижной редактор. Mobile <768px: нижняя навигация |

Опционально: ключ OpenAI или Anthropic для конвертации сложного Pine Script в JS.
Ключ хранится локально и уходит только выбранному провайдеру.

---

## Быстрый старт

Требуется **Node.js 20.19+**.

```bash
npm ci                 # зависимости
npm run build          # веб-клиент в dist/
npm run build:server   # локальный прокси в dist-server/
npm start              # http://127.0.0.1:5175
```

Для разработки с hot reload:

```bash
npm run dev            # Vite :5173 + Fastify :5175, /api проксируется
```

### Токен T-Invest

Вставляется в приложении: **Настройки → Токен T-Invest**. Подходит Read-Only токен:
приложение только читает рыночные данные, торговых операций нет.

Где лежит токен:

| Сборка | Хранилище |
|---|---|
| Desktop (Tauri) | системное хранилище (Windows Credential Manager / macOS Keychain / Secret Service) |
| Web / PWA (Node) | `data/secrets.json`, права `0600`, папка в `.gitignore` |

Токен никогда не попадает в репозиторий, в логи и в батники. `npm run check:secrets` проверяет это перед сборкой.

### Сертификат НУЦ Минцифры

`invest-public-api.tbank.ru` использует сертификат российского УЦ, которого нет в стандартном
хранилище Linux/macOS. Корневой сертификат лежит в `contracts/certs/russian-trusted-root-ca.pem`:

- `npm start` и `npm run dev` подхватывают его автоматически через `NODE_EXTRA_CA_CERTS`;
- Desktop-сборка встраивает его на этапе компиляции (`crates/tinvest`);
- либо установите сертификат в систему — тогда переменная не нужна.

---

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Vite + Fastify с hot reload |
| `npm run build` | `tsc --noEmit` + `vite build` |
| `npm run build:server` | сборка локального прокси в `dist-server/` |
| `npm start` | запуск прокси и раздача `dist/` на :5175 |
| `npm test` | Vitest (движок индикаторов) |
| `npm run typecheck` | фронтенд + сервер |
| `npm run verify` | typecheck → tests → build → build:server → check:secrets |
| `npm run desktop:dev` | Tauri dev (нужен Rust) |
| `npm run desktop:build` | Tauri release-сборка под текущую платформу |

### Desktop

```bash
rustup toolchain install stable      # один раз
npm run desktop:build                # установщик в src-tauri/target/release/bundle
```

На Linux нужны `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `build-essential`, `pkg-config`.

---

## Запуск на Windows без сборки (батники)

В папке `launchers/`:

| Файл | Что делает |
|---|---|
| `start_main.bat` | скачивает/обновляет ветку `main`, ставит зависимости, запускает |
| `start_delta.bat` | то же для ветки `delta` |
| `uninstall.bat` | останавливает, удаляет файлы программы, **данные сохраняет** |

Положите три файла в пустую папку и дважды кликните нужный. Первый запуск скачает проект и поставит
зависимости — это занимает несколько минут; ход виден в окне и в логе `start_*.log` рядом.

Данные (`data/`) не удаляются никогда — кроме случая, когда `uninstall.bat` запущен с `/purge`
и вы вручную наберёте `DELETE`. Локальные правки перед обновлением сохраняются через `git stash`.

---

## Архитектура

```
React + TypeScript + Vite + Tailwind + shadcn/ui + lightweight-charts
                │
                ├── Tauri IPC  ──► Rust: tinvest (tonic/gRPC) + keyring      [desktop]
                └── HTTP/SSE    ──► Fastify: REST + gRPC + data/secrets.json [web/PWA]
                                          │
                                          └──► T-Invest API (invest-public-api.tbank.ru)
```

- `src/features/api/` — `BackendAdapter` и две реализации (`TauriBackend`, `HttpBackend`), выбор по `isTauri()`.
- `src/features/market/` — загрузка истории/стакана + стрим с polling-фолбэком.
- `src/features/chart/` — `ChartSurface`, `DrawingLayer`, `drawingGeometry`.
- `src/features/indicators/` — транспилятор Pine → JS, рантайм `ta.*`, Runner + Worker.
- `src/features/orderbook/`, `src/features/instruments/`, `src/features/settings/` — панели.
- `src/stores/` — Zustand: `settings`, `terminal`, `indicators`, `drawings` (persist в localStorage).
- `server/` — Fastify-прокси: `/api/health`, `/api/token`, `/api/instruments/search`, `/api/candles`,
  `/api/orderbook`, `/api/stream` (SSE), `/api/ai/*`, статика `dist/`.
- `crates/tinvest/` — Rust-клиент T-Invest: REST/gRPC, стрим, TLS с сертификатом НУЦ.
- `src-tauri/` — IPC-команды и хранение секретов в keyring.
- `contracts/proto/` — контракты T-Invest API (вендоренные, для сборки без protoc).

---

## Ограничения MVP

- Только чтение рыночных данных; торговые операции не реализованы (Read-Only токен достаточен).
- Стакан и свечи — по gRPC/REST T-Invest API, без WebSocket-шлюза T-Bанка.
- Транспилятор поддерживает базовый Pine; сложные скрипты конвертируются через LLM-ключ.
- Tauri-сборка проверена на Linux; Windows-установщик собирается теми же командами.

## Лицензия

MIT
