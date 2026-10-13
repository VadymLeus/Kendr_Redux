# Метрики версії v0-check

Згенеровано `tools/summarize.mjs` із сирих даних каталогу `docs/04-results/v0-check/raw`; для порівняння використано `docs/02-analysis/raw/metrics-v0.json`. Значення в таблицях не редагуються вручну. Частки наведено до сотих, роздільник розрядів — пропуск, десяткова ознака — кома.

## 1. Розмір коду

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Backend: файлів | 74 | — | — |
| Backend: фізичних рядків | 7 434 | — | — |
| Backend: рядків коду | 6 894 | — | — |
| Backend: рядків коментарів | 91 | — | — |
| Frontend (`src`, з CSS): файлів | 198 | — | — |
| Frontend: фізичних рядків | 36 583 | — | — |
| Frontend: рядків коду | 34 869 | — | — |
| Frontend: рядків коментарів | 260 | — | — |

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Рядків коду разом (продуктовий код) | 41 763 | — | — |

## 2. Дублювання коду

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Клонів (JS + JSX) | 73 | 73 | 0 |
| Дубльованих рядків | 986 | 986 | 0 |
| Частка дублювання | 2,26 % | 2,26 % | 0 |

## 3. Залежності між модулями

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Циклічних залежностей: backend | 0 | 0 | 0 |
| Циклічних залежностей: frontend | 2 | 2 | 0 |
| Імпортів на неіснуючі файли (backend і frontend) | 7 | — | — |

Цикли frontend:

1. `modules/editor/core/BlockRenderer.jsx > modules/editor/blocks/Layout/LayoutBlock.jsx`
2. `modules/editor/core/BlockRenderer.jsx > modules/editor/blocks/Layout/LayoutBlock.jsx > modules/editor/ui/EditableBlockWrapper.jsx`

## 6. Невикористаний код і залежності (knip)

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Frontend: невикористаних файлів | 4 | 4 | 0 |
| Frontend: невикористаних `devDependencies` | 5 | 5 | 0 |
| Frontend: невикористаних експортів | 24 | 24 | 0 |
| Frontend: експортів і за іменем, і за замовчуванням | 2 | 2 | 0 |
| Backend: невикористаних файлів | 3 | 3 | 0 |
| Backend: невикористаних залежностей | 3 | 3 | 0 |
| Backend: експортів за звітом knip | 144 | 144 | 0 |
| Backend: невикористаних експортів після перевірки звернень | 4 | 4 | 0 |

Backend, експорти без звернень з інших файлів (4): `controllers/siteController.js: getUserSites`, `utils/fileUtils.js: ensureDirExists`, `utils/fileUtils.js: downloadImage`, `config/mediaLimits.js: PLAN_LIMITS`.

## 8. Тести і покриття

| Показник | v0 | v0-check | Зміна |
|---|---|---|---|
| Frontend: тестів | 12 | — | — |
| Frontend: файлів з тестами | 2 | — | — |
| Backend: тестів | 0 | — | — |
| Backend: файлів з тестами | 0 | — | — |
| Frontend: покриття рядків | 0,73 % | — | — |
| Frontend: покриття операторів | 0,72 % | — | — |
| Frontend: покриття функцій | 0,41 % | — | — |
| Frontend: покриття гілок | 0,77 % | — | — |
| Backend: покриття рядків | 0,00 % | — | — |
| Backend: покриття операторів | 0,00 % | — | — |
| Backend: покриття функцій | 0,00 % | — | — |
| Backend: покриття гілок | 0,00 % | — | — |

