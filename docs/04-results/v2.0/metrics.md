# Метрики версії v2.0

Згенеровано `tools/summarize.mjs` із сирих даних каталогу `docs/04-results/v2.0/raw`; для порівняння використано `docs/02-analysis/raw/metrics-v0.json`, `docs/04-results/v1.0/metrics.json`. Значення в таблицях не редагуються вручну. Частки наведено до сотих, роздільник розрядів — пропуск, десяткова ознака — кома.

## 1. Розмір коду

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Backend: файлів | 74 | 92 | 103 | +29 |
| Backend: фізичних рядків | 7 434 | 7 865 | 8 573 | +1 139 |
| Backend: рядків коду | 6 894 | 7 184 | 7 774 | +880 |
| Backend: рядків коментарів | 91 | 112 | 135 | +44 |
| Frontend (`src`, з CSS): файлів | 198 | 201 | 202 | +4 |
| Frontend: фізичних рядків | 36 583 | 36 276 | 36 306 | −277 |
| Frontend: рядків коду | 34 869 | 34 563 | 34 551 | −318 |
| Frontend: рядків коментарів | 260 | 263 | 295 | +35 |

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Рядків коду разом (продуктовий код) | 41 763 | 41 747 | 42 325 | +562 |

| Тестовий код | Файлів | Рядків коду |
|---|---|---|
| `backend/tests` | 60 | 12 383 |
| `frontend/tests` | 35 | 4 637 |

## 2. Дублювання коду

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Клонів (JS + JSX) | 73 | 66 | 64 | −9 |
| Дубльованих рядків | 986 | 908 | 888 | −98 |
| Частка дублювання | 2,26 % | 2,07 % | 1,99 % | −0,26 п. п. |

## 3. Залежності між модулями

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Циклічних залежностей: backend | 0 | 0 | 0 | 0 |
| Циклічних залежностей: frontend | 2 | 0 | 0 | −2 |
| Імпортів на неіснуючі файли (backend і frontend) | 7 | 0 | 0 | −7 |

## 4. API та шар доступу до даних

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Ендпоінтів | 142 | 141 | 141 | −1 |
| Публічні (`public`) | 32 | 32 | 32 | 0 |
| Лише за токеном (`token`) | 85 | 84 | 84 | −1 |
| Адмін / модератор | 21 | 21 | 21 | 0 |
| Лише головний адмін | 4 | 4 | 4 | 0 |
| Контролерів | 21 | 20 | 20 | −1 |
| Контролерів із прямими SQL-запитами | 14 | 10 | 10 | −4 |
| Прямих SQL-викликів у контролерах | 196 | 130 | 120 | −76 |
| Контролерів, що викликають сервіси | 0 | 6 | 13 | +13 |

Файли й SQL-виклики за шарами backend (`.query(` і `.execute(`):

| Шар | Файлів v0 | Файлів v1.0 | Файлів v2.0 | SQL v0 | SQL v1.0 | SQL v2.0 |
|---|---|---|---|---|---|---|
| `controllers` | 21 | 20 | 20 | 196 | 130 | 120 |
| `services` | 0 | 12 | 18 | 0 | 0 | 0 |
| `repositories` | 0 | 9 | 9 | 0 | 90 | 100 |
| `models` | 13 | 9 | 9 | 111 | 59 | 63 |
| `middleware` | 9 | 9 | 9 | 6 | 6 | 6 |
| `utils` | 4 | 5 | 7 | 1 | 1 | 1 |
| `config` | 4 | 5 | 8 | 5 | 5 | 5 |

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| SQL-викликів у backend усього | 319 | 291 | 295 | −24 |

## 5. Розмір файлів

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Backend: файлів понад 300 рядків | 7 | 5 | 6 | −1 |
| Backend: файлів понад 500 рядків | 2 | 1 | 1 | −1 |
| Backend: найбільший файл, рядків | 776 | 776 | 776 | 0 |
| Frontend: файлів понад 300 рядків | 34 | 34 | 34 | 0 |
| Frontend: файлів понад 500 рядків | 11 | 12 | 12 | +1 |
| Frontend: найбільший файл, рядків | 840 | 831 | 842 | +2 |

Найбільші файли v2.0: backend — `controllers/adminController.js` (776), frontend — `modules/dashboard/pages/SiteDashboardPage.jsx` (842). Рахуються файли `.js` і `.jsx` у backend (без `tests`) та `.js`, `.jsx` і `.css` у `frontend/src`.

## 6. Невикористаний код і залежності (knip)

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Frontend: невикористаних файлів | 4 | 0 | 0 | −4 |
| Frontend: невикористаних залежностей (`dependencies`) | 0 | 0 | 0 | 0 |
| Frontend: невикористаних `devDependencies` | 5 | 0 | 0 | −5 |
| Frontend: невикористаних експортів | 24 | 17 | 16 | −8 |
| Frontend: експортів і за іменем, і за замовчуванням | 2 | 2 | 2 | 0 |
| Backend: невикористаних файлів | 3 | 0 | 0 | −3 |
| Backend: невикористаних залежностей | 3 | 0 | 0 | −3 |
| Backend: експортів за звітом knip | 144 | 144 | 155 | +11 |
| Backend: невикористаних експортів після перевірки звернень | 4 | 4 | 15 | +11 |

Backend, експорти без звернень з інших файлів (15): `config/jwtSecret.js: MISSING_CODE`, `config/jwtSecret.js: MISSING_MESSAGE`, `config/corsOrigins.js: DEV_ORIGIN`, `controllers/siteController.js: getUserSites`, `utils/fileUtils.js: ensureDirExists`, `utils/fileUtils.js: downloadImage`, `services/siteValidation.js: SLUG_MIN_LENGTH`, `services/siteValidation.js: SLUG_MAX_LENGTH`, `services/productVisibility.js: withoutDigitalFile`, `services/siteSettings.js: SECTION_FIELDS`, `services/blockContentValidation.js: MAX_BLOCKS`, `services/blockContentValidation.js: MAX_DEPTH`, `services/blockContentValidation.js: MAX_CONTENT_BYTES`, `services/blockContentValidation.js: MAX_ID_LENGTH`, `config/mediaLimits.js: PLAN_LIMITS`.

## 7. Цикломатична складність (ESLint, правило `complexity`)

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Frontend: функцій | 2 717 | 2 739 | 2 755 | +38 |
| Frontend: середня складність | 3,41 | 3,33 | 3,33 | −0,08 |
| Frontend: максимум | 121 | 121 | 121 | 0 |
| Frontend: функцій зі складністю понад 10 | 175 | 170 | 168 | −7 |
| Frontend: функцій зі складністю понад 20 | 58 | 56 | 56 | −2 |
| Backend: функцій | 365 | 485 | 593 | +228 |
| Backend: середня складність | 4,81 | 3,74 | 3,50 | −1,30 |
| Backend: медіана | 3,00 | 2,00 | 2,00 | −1,00 |
| Backend: максимум | 53 | 33 | 37 | −16 |
| Backend: функцій зі складністю понад 10 | 38 | 35 | 36 | −2 |
| Backend: функцій зі складністю понад 20 | 9 | 6 | 6 | −3 |
| Разом: функцій зі складністю понад 10 | 213 | 205 | 204 | −9 |

Найскладніші функції backend:

| Складність | Функція | Розташування |
|---|---|---|
| 37 | `OrderService.placeOrder` | `services/OrderService.js:116` |
| 26 | `SiteService.getByPath` | `services/SiteService.js:174` |
| 23 | `platformGuards.checkMaintenance` | `middleware/platformGuards.js:28` |
| 22 | `SiteRepository.getPublic` | `repositories/SiteRepository.js:14` |
| 21 | `adminController.getDashboardStats` | `controllers/adminController.js:55` |
| 21 | `mediaController.upload` | `controllers/mediaController.js:69` |

Найскладніші функції frontend:

| Складність | Функція | Розташування |
|---|---|---|
| 121 | `ProductDetailPage` | `modules/shop/ProductDetailPage.jsx:38` |
| 62 | `HeaderBlock` | `modules/editor/blocks/Header/HeaderBlock.jsx:33` |
| 58 | `EditableBlockWrapper` | `modules/editor/ui/EditableBlockWrapper.jsx:31` |
| 56 | `SiteDetailsPanel` | `modules/admin/components/SiteDetailsPanel.jsx:19` |
| 55 | `ProductCard` | `modules/editor/ui/components/ProductCard.jsx:11` |
| 54 | `SiteDisplayPage` | `modules/renderer/pages/SiteDisplayPage.jsx:21` |

## 8. Тести і покриття

| Показник | v0 | v1.0 | v2.0 | Зміна |
|---|---|---|---|---|
| Frontend: тестів | 12 | 625 | 804 | +792 |
| Frontend: файлів з тестами | 2 | 20 | 28 | +26 |
| Backend: тестів | 0 | 1 226 | 2 248 | +2 248 |
| Backend: файлів з тестами | 0 | 37 | 50 | +50 |
| Frontend: покриття рядків | 0,73 % | 11,00 % | 13,10 % | +12,37 п. п. |
| Frontend: покриття операторів | 0,72 % | 10,92 % | 13,01 % | +12,28 п. п. |
| Frontend: покриття функцій | 0,41 % | 9,89 % | 11,51 % | +11,10 п. п. |
| Frontend: покриття гілок | 0,77 % | 11,80 % | 13,61 % | +12,85 п. п. |
| Backend: покриття рядків | 0,00 % | 71,53 % | 76,89 % | +76,89 п. п. |
| Backend: покриття операторів | 0,00 % | 70,33 % | 75,91 % | +75,91 п. п. |
| Backend: покриття функцій | 0,00 % | 76,29 % | 82,97 % | +82,97 п. п. |
| Backend: покриття гілок | 0,00 % | 63,43 % | 70,35 % | +70,35 п. п. |

Покриття frontend (v2.0): рядків 1 263 із 9 639, операторів 1 427 із 10 970, функцій 317 із 2 755, гілок 1 452 із 10 666.

Покриття backend (v2.0): рядків 3 288 із 4 276, операторів 3 491 із 4 599, функцій 492 із 593, гілок 1 718 із 2 442.

Покриття рядків backend за шарами:

| Шар | Файлів | Рядків покрито | Рядків усього | Частка |
|---|---|---|---|---|
| `controllers` | 20 | 1 139 | 1 883 | 60,49 % |
| `services` | 18 | 934 | 936 | 99,79 % |
| `repositories` | 9 | 320 | 381 | 83,99 % |
| `models` | 9 | 149 | 234 | 63,68 % |
| `middleware` | 9 | 185 | 223 | 82,96 % |
| `utils` | 7 | 115 | 170 | 67,65 % |
| `config` | 8 | 90 | 93 | 96,77 % |
| `routes` | 21 | 281 | 281 | 100,00 % |

