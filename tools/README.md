# Інструменти замірів

Усі заміри «до/після» виконуються одним набором скриптів на кожному теґі (`v0`, `v1.0`, `v2.0`), тому числа в таблицях порівнянні. Скрипти лише читають код проєкту; єдиний виняток — запуск тестів.

## Файли

| Файл | Призначення |
|------|-------------|
| `measure.mjs` | запускає всі кроки заміру й складає результат у `docs/04-results/<тег>/` |
| `code-metrics.mjs` | рядки коду (за правилами `sloc` 0.3.2), цикли імпортів, розміри файлів |
| `api_catalog.py` | ендпоінти, доступ, прямі SQL-виклики за шарами backend (`--json` — лише числа) |
| `summarize.mjs` | збирає `metrics.md` і `metrics.json` із сирих виводів, порівнює з попередніми теґами |
| `eslint-complexity.config.mjs` | конфігурація ESLint для правила `complexity` із порогом 0 |
| `knip-frontend.json`, `knip-backend.json` | конфігурації knip |

## Запуск

З кореня репозиторію (Node 20+, Python 3.8+, доступ до npm):

```text
node tools/measure.mjs --tag=v1.0
```

Для кроку `tests-backend` потрібна тестова MySQL (`docker compose up -d`). Результат:

- `docs/04-results/<тег>/raw/` — сирі виводи інструментів і журнали `measure-<крок>.log` невдалих кроків;
- `docs/04-results/<тег>/metrics.md` і `metrics.json` — таблиці й числа; для теґів, відмінних від `v0`, у таблицях є колонка `v0` з `docs/02-analysis/raw/metrics-v0.json`.

Параметри:

| Параметр | Дія |
|----------|-----|
| `--tag=<ім'я>` | обов'язковий; ім'я версії у таблицях і назва каталогу результатів |
| `--only=<кроки>` | лише перелічені кроки через кому; `madge`, `knip` і `tests` обирають обидва кроки групи |
| `--skip=<кроки>` | усі кроки, крім перелічених |
| `--root=<каталог>` | вимірювати інше дерево коду (наприклад, `git worktree` на іншому теґі) цими самими скриптами |
| `--out=<каталог>` | куди класти сирі виводи (за замовчуванням `docs/04-results/<тег>/raw`) |
| `--baseline=<шляхи>` | файли `metrics.json` для порівняння через кому; `none` вимикає порівняння |
| `--dry-run` | показати команди, нічого не виконуючи |

Кроки: `environment`, `install-frontend`, `install-backend`, `code-metrics`, `api-catalog`, `jscpd`, `madge-backend`, `madge-frontend`, `knip-frontend`, `knip-backend`, `eslint-complexity`, `coverage-pkg`, `tests-frontend`, `tests-backend`, `summarize`. Залежності ставляться (`npm ci --legacy-peer-deps`) лише там, де немає `node_modules`. Крок, що не вдався, не зупиняє решту: його журнал лежить у `raw/measure-<крок>.log`, а підсумок `summarize` показує порожні клітинки.

## Що виміряно чим

| Показник | Інструмент і правила |
|----------|----------------------|
| Рядки коду | `code-metrics.mjs`: правила підрахунку `sloc` 0.3.2 (рядок із кодом, однорядковий і блоковий коментар, змішаний рядок, порожній); на `v0` збіг із виводом `sloc` до рядка (backend 6 894, frontend 34 869, тести 126). Backend — `.js` без `tests`; frontend — `.js`, `.jsx`, `.css` у `src` |
| Дублювання | `jscpd`, формати `javascript` і `jsx`, клон від 8 рядків, каталоги `backend` і `frontend/src` без `tests` |
| Циклічні залежності | `madge` 8.0.0 (`--circular`); `code-metrics.mjs` будує той самий граф статичних, динамічних і `require`-імпортів і на `v0` дає ті самі два цикли |
| API й шари | `api_catalog.py`: ендпоінти за `routes`, доступ за middleware, виклики `.query(` і `.execute(` за каталогами backend |
| Розмір файлів | `code-metrics.mjs`, `file-sizes.csv` (рядків на файл) |
| Невикористаний код | `knip` із конфігураціями цієї теки. Для backend перевірено звернення до кожного експорту, який повідомив knip: knip не розпізнає CommonJS-обробники контролерів, тож у таблицю йдуть експорти без звернень з інших файлів backend (без `tests`). Backend аналізується без тестів, як на `v0`, де їх не було |
| Складність | `eslint` 9, правило `complexity` із порогом 0, `eslint-complexity.config.mjs` (`backend/tests` виключено). Вкладені функції рахуються окремо |
| Тести й покриття | Vitest (`--reporter=json`) і `@vitest/coverage-v8`, провайдер v8; frontend — `tests/unit` і `tests/integration`, усі файли `src/**/*.{js,jsx}`; backend — `vitest.config.mjs` |

## Перевірка збігу з `v0`

Скрипти звірено на коді `v0`: `summarize.mjs` на сирих виводах `docs/02-analysis/raw` відтворює числа з [`metrics-before.md`](../docs/02-analysis/metrics-before.md) (рядки коду, дублювання 2,26 %, 2 цикли, knip, складність 213 функцій понад 10, покриття 0,73 %). `docs/02-analysis/raw/metrics-v0.json` зібрано саме так; ручна частина (кількість тестів `v0` і нульове покриття backend) лежить у `raw/overlay-v0.json`.

Щоб переконатися, що `jscpd`, `madge` і `knip` у цій редакції дають на `v0` те саме, вимірюйте `v0` без зміни основного дерева:

```text
git worktree add ..\Kendr_v0 v0
node tools/measure.mjs --tag=v0-check --root=..\Kendr_v0 --only=install,jscpd,madge,knip,summarize
```

У `docs/04-results/v0-check/metrics.md` колонка «Зміна» має показати нулі в розділах 2, 3 і 6.
