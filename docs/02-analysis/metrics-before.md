# Метрики вихідної версії (v0)

Заміри виконано 10–12.10.2026 на коді, ідентичному тегу `v0` (після нього змінювались лише документація, `README.md` та `.env.example`). Сирі виводи інструментів лежать у [`raw/`](raw).

| Інструмент | Версія | Призначення |
|-----------|--------|-------------|
| sloc | 0.3.2 | розмір коду |
| jscpd | остання на момент заміру | дублювання коду |
| madge | 8.0.0 | циклічні залежності |
| `tools/api_catalog.py` | власний | ендпоінти, доступ, SQL у контролерах |
| knip | остання на момент заміру | невикористані файли, залежності, експорти |
| ESLint (правило `complexity`) | 9 | цикломатична складність функцій |
| Vitest + `@vitest/coverage-v8` | 4.1.2 | кількість тестів, покриття |

## 1. Розмір коду

| Частина | Файлів | Фізичних рядків | Рядків коду | Рядків коментарів | Частка коментарів |
|---------|--------|-----------------|-------------|-------------------|-------------------|
| Backend | 74 | 7 434 | 6 894 | 91 | 1,3 % |
| Frontend (`src`) | 198 | 36 583 | 34 869 | 260 | 0,7 % |
| **Разом (продуктовий код)** | **272** | **44 017** | **41 763** | **351** | **0,8 %** |
| Тести (`frontend/tests`) | 3 | 149 | 126 | 8 | |

Похідні показники:

- Співвідношення frontend : backend за рядками коду: **5,06 : 1** (34 869 / 6 894).
- Частка тестового коду від продуктового: **0,30 %** (126 / 41 763).
- Backend-тестів немає.

Джерела: `raw/sloc-backend.txt`, `raw/sloc-frontend.txt`, `raw/sloc-tests.txt`.

## 2. Дублювання коду

Інструмент jscpd, поріг: клон від 8 рядків.

| Формат | Файлів | Рядків | Клонів | Дубльованих рядків | Частка |
|--------|--------|--------|--------|--------------------|--------|
| JavaScript | 94 | 9 170 | 14 | 172 | 1,88 % |
| JSX | 173 | 34 508 | 59 | 814 | 2,36 % |
| **Разом (JS + JSX)** | **267** | **43 678** | **73** | **986** | **2,26 %** |

Файли JSON (`package.json` проти `package-lock.json`, 1 клон, 28 рядків) і CSS (1 файл, 0 клонів) у підсумок не включено як шум.

Найбільші клони:

| Рядків | Де |
|--------|----|
| 45 | `SiteDashboardPage.jsx` [81–125] ↔ `BlockEditor.jsx` [11–55] |
| 36 | `SiteDashboardPage.jsx` [48–83] ↔ `SitePreviewer.jsx` [33–70] |
| 29 | `SiteDisplayPage.jsx` [202–230] ↔ `ProductDetailPage.jsx` [659–687] |
| 27 | `userTemplateController.js` [18–44] ↔ [128–154] (у межах одного файлу) |
| 24 | `NewTicketPage.jsx` [42–65] ↔ `TicketDetailPage.jsx` [137–160] |
| 23 | `OrdersTab.jsx` [164–186] ↔ `MyOrdersPage.jsx` [364–386] |
| 23 | `MediaPickerModal.jsx` [110–132] ↔ `MediaLibraryPage.jsx` [182–203] |

Файли з найбільшою кількістю клонів: `SiteDashboardPage.jsx`, `SiteDisplayPage.jsx`, `ProductDetailPage.jsx`, `AdminUsersSitesPage.jsx`, `AuthPage.jsx`, `AddBlocksTab.jsx`.

Обмеження методу: поріг у 8 рядків фіксує лише великі копіювання. Короткі повторювані фрагменти (наприклад, однакові перетворення адрес медіа чи мап валют) нижче порога й у цю цифру не входять.

Джерело: `raw/jscpd/jscpd-report.json`.

## 3. Залежності між модулями

| Частина | Оброблено файлів | Циклічних залежностей |
|---------|------------------|-----------------------|
| Backend | 74 | 0 |
| Frontend | 198 | 2 |

Знайдені цикли (frontend):

1. `modules/editor/core/BlockRenderer.jsx` → `modules/editor/blocks/Layout/LayoutBlock.jsx` → `BlockRenderer.jsx`
2. `BlockRenderer.jsx` → `LayoutBlock.jsx` → `modules/editor/ui/EditableBlockWrapper.jsx` → `BlockRenderer.jsx`

Обидва цикли пов'язані з вкладеним блоком Layout, який рендерить інші блоки. У `BlockRenderer` для `LayoutBlock` застосовано `React.lazy`, тому на роботу застосунку цикл не впливає.

Джерела: `raw/madge-backend.txt`, `raw/madge-frontend.txt`.

## 4. API та шар доступу до даних

| Показник | Значення |
|----------|----------|
| Ендпоінтів усього | 142 (141 підключено в `server.js`, 1 у непідключеному файлі `settingsRoutes.js`) |
| Файлів маршрутів | 22 |
| Публічні (`public`) | 32 |
| Лише за токеном (`token`) | 85 |
| Адмін / модератор | 21 |
| Лише головний адмін | 4 |
| Контролерів | 21 |
| Контролерів із прямими SQL-запитами | **14 з 21 (66,7 %)** |
| Прямих SQL-викликів у контролерах | 196 |
| Контролерів без жодної моделі | 6 (`delivery`, `media`, `order`, `report`, `team`, `transaction`) |

Колонка «доступ» визначена за middleware у маршрутах. Перевірки всередині контролерів (власник сайту, права співавтора) у ній не враховані.

Джерело: [`../01-reverse-engineering/api-catalog.md`](../01-reverse-engineering/api-catalog.md) (генерується `tools/api_catalog.py`; `python tools/api_catalog.py --json` друкує ці числа).

## 5. Розмір файлів

| Показник | Backend | Frontend |
|----------|---------|----------|
| Файлів понад 300 рядків | 7 | 34 |
| Файлів понад 500 рядків | 2 | 11 |
| Найбільший файл | `adminController.js` (776) | `SiteDashboardPage.jsx` (840) |

Найбільші файли frontend: `SiteDashboardPage` (840), `ProductManager` (802), `ProductDetailPage` (692), `CartPage` (630), `AdminUsersSitesPage` (608).

Джерело: `raw/file-sizes.csv`.

## 6. Додавання нового блока редактора

Ручний підрахунок за кодом (докладно — [`block-map.md`](../01-reverse-engineering/as-built/block-map.md)).

| Показник | Значення |
|----------|----------|
| Місць, де описано тип блока | 6 |
| Наявних файлів, які треба змінити | 5 (`editorConfig.jsx` двічі, `BlockRenderer.jsx`, `SettingsTab.jsx`, `AddBlocksTab.jsx`, `htmlGenerator.js`) |
| Нових файлів | 2 (`XxxBlock.jsx`, `XxxSettings.jsx`) |
| Файлів у сумі | 7 (8 змін) |

## 7. Невикористаний код і залежності

Інструмент knip із конфігураціями `tools/knip-frontend.json` і `tools/knip-backend.json`. Сирі виводи: `raw/knip-frontend.json`, `raw/knip-backend.json`.

| Показник | Frontend | Backend |
|----------|----------|---------|
| Невикористані файли | 4 | 3 |
| Невикористані залежності (`dependencies`) | 0 | 3 |
| Невикористані `devDependencies` | 5 | 0 |
| Невикористані експорти | 24 | 4 після ручної перевірки (knip повідомив 144) |
| Експорт і за іменем, і за замовчуванням | 2 | 0 |

Невикористані файли:

- frontend: `NovaPoshtaDelivery.jsx`, `SiteHeader.jsx`, `SettingsGroup.jsx`, `BlockSettingsModal.jsx` (D-DEAD-03);
- backend: `controllers/settingsController.js` і `routes/settingsRoutes.js` (D-DEAD-01), `models/UserTemplate.js` (D-DEAD-02).

Невикористані залежності: backend — `react-dnd`, `react-dnd-html5-backend`, `sharp`; frontend (`devDependencies`) — `@eslint/js`, `@testing-library/user-event`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`.

Ручна перевірка backend: 140 із 144 «невикористаних експортів» — обробники контролерів, які насправді підключено в маршрутах (звернення `controller.fn`; knip їх не розпізнає, імовірно через CommonJS). Для кожного з 144 імен підраховано звернення з інших файлів backend (`.ім'я` або деструктуризація `require`): жодного звернення мають `getUserSites` (`siteController.js`), `ensureDirExists` і `downloadImage` (`utils/fileUtils.js`); `PLAN_LIMITS` (`config/mediaLimits.js`) експортується, але використовується лише у власному файлі. Підсумок для таблиці в `README.md`: файлів 7, залежностей 8, експортів 28 (24 + 4).

## 8. Цикломатична складність

ESLint 9, правило `complexity` (класичний підрахунок) із порогом 0, тобто повідомлення видається для кожної функції; конфігурація `tools/eslint-complexity.config.mjs`, сирий вивід `raw/eslint-complexity.json`. Проаналізовано `frontend/src` і `backend` (без `node_modules`): 271 файл, помилок розбору немає. Вкладені функції рахуються окремо; умови `&&` і `?:` у JSX належать функції-компоненту, тому значення для React-компонентів і для обробників backend порівнювати напряму не слід.

| Показник | Frontend | Backend | Разом |
|----------|----------|---------|-------|
| Функцій проаналізовано | 2 717 | 365 | 3 082 |
| Середня складність | 3,41 | 4,81 | 3,57 |
| Медіана | 1 | 3 | 1 |
| Максимум | 121 (`ProductDetailPage.jsx:37`) | 53 (`siteController.js:309`, `updateSiteSettings`) | 121 |
| Функцій зі складністю понад 10 | 175 | 38 | 213 (6,9 %) |
| Функцій зі складністю понад 20 | 58 | 9 | 67 |

Найскладніші функції backend: `siteController.updateSiteSettings` (53, рядок 309), `orderController.processCheckout` (50, рядок 50), `siteController.createSite` (42, рядок 113), `siteController.resetSiteToTemplate` (31, рядок 484), `siteController.getSiteByPath` (26, рядок 249). Усі п'ять входять до зрізу `order`, `site` (ADR-003).

Найскладніші функції frontend: `ProductDetailPage` (121), `generateBlockHTML` у `htmlGenerator.js` (82), `HeaderBlock` (62), `EditableBlockWrapper` (59), `SiteDetailsPanel` (56).

## 9. Покриття тестами

Vitest 4.1.2 і `@vitest/coverage-v8` 4.1.2; у підрахунок включено всі 196 файлів `frontend/src/**/*.{js,jsx}`, тести `tests/unit` і `tests/integration`. Сирі виводи: `raw/coverage-frontend.txt`, `raw/coverage-frontend/coverage-summary.json`.

| Метрика | Покрито | Усього | Частка |
|---------|---------|--------|--------|
| Рядки | 71 | 9 705 | 0,73 % |
| Оператори | 80 | 11 039 | 0,72 % |
| Функції | 11 | 2 712 | 0,40 % |
| Гілки | 83 | 10 848 | 0,76 % |

Автоматизованих тестів: 12 (9 unit у `validationUtils.test.js`, 3 інтеграційні в `InputWithCounter.test.jsx`), усі проходять. Додатково є один e2e-тест Playwright (`tests/e2e/example.spec.js`: вхід, створення сайту, увімкнення cookie, видалення); він потребує запущених застосунку й БД і в замірі не виконувався. Покриття backend: тестів немає, 0 %.

Відтворення замірів 7–9: `node tools/measure.mjs` з кореня репозиторію.

## 10. Характеризаційні тести backend (`v0.1`)

Це не замір `v0`: тести додано до незмінного коду `v0` (змінено лише винесення `app.js` із `server.js`), щоб мати базу для порівняння з `v1.0` і `v2.0` (ADR-005). Заміри 12.10.2026: Vitest 4.1.11, supertest, `@vitest/coverage-v8` (v8), тестова MySQL 8.0 у Docker (`docker-compose.yml`). Стан проміжний: готові тести замовлень і тарифу, тести сайтів, сторінок і автентифікації ще попереду.

| Файл (`backend/tests/characterization/`) | Тестів | Область |
|------------------------------------------|--------|---------|
| `app.smoke.test.js` | 13 | каркас застосунку, `verifyToken` |
| `orders.checkout.test.js` | 27 | оформлення замовлення, ціна |
| `orders.checkout.input.test.js` | 5 | кількість у позиціях, помилки без статусу |
| `orders.stock.test.js` | 9 | списання залишків |
| `orders.payment.test.js` | 25 | callback LiqPay, Google Pay |
| `orders.access.test.js` | 12 | доступ до замовлень, статуси |
| `transactions.upgrade.test.js` | 12 | тариф PLUS |
| **Разом** | **103** | усі проходять |

Відтворено 10 дефектів із 64 (обидва критичні, 4 із 11 високих): D-SEC-01, D-SEC-02, D-SEC-03, D-SEC-07, D-BIZ-01, D-BIZ-02, D-BIZ-08, D-BIZ-09, D-ARC-10, D-CFG-01.

Покриття backend (файли `app.js`, `config/`, `controllers/`, `middleware/`, `models/`, `routes/`, `utils/`, перелік у `backend/vitest.config.mjs`):

| Метрика | Покрито | Усього | Частка |
|---------|---------|--------|--------|
| Рядки | 1 052 | 3 814 | 27,58 % |
| Оператори | 1 062 | 4 094 | 25,94 % |
| Функції | 94 | 365 | 25,75 % |
| Гілки | 251 | 2 284 | 10,99 % |

Vitest виводить частку гілок із усіканням (10,98 %); наведено точне значення. Для порівняння: на `v0` покриття backend дорівнювало 0 % (тестів не було).

Відтворення: `docker compose up -d`, далі в `backend/` — `npm install --legacy-peer-deps` і `npm run test:coverage`.
