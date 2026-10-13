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

Джерело: `raw/file-sizes.csv` (файли `.js` і `.jsx` у `backend` та `.js`, `.jsx` і `.css` у `frontend/src`; до 34 файлів frontend понад 300 рядків входить `index.css`, 304 рядки).

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
| Функції | 11 | 2 712 | 0,41 % |
| Гілки | 83 | 10 848 | 0,77 % |

Автоматизованих тестів: 12 (9 unit у `validationUtils.test.js`, 3 інтеграційні в `InputWithCounter.test.jsx`), усі проходять. Додатково є один e2e-тест Playwright (`tests/e2e/example.spec.js`: вхід, створення сайту, увімкнення cookie, видалення); він потребує запущених застосунку й БД і в замірі не виконувався. Покриття backend: тестів немає, 0 %.

Відтворення замірів 7–9: `node tools/measure.mjs --tag=<тег>` з кореня репозиторію, докладніше в [`tools/README.md`](../../tools/README.md).

## 10. Характеризаційні тести backend (`v0.1`)

Це не замір `v0`: тести додано до незмінного коду `v0` (змінено лише винесення `app.js` із `server.js`), щоб мати базу для порівняння з `v1.0` і `v2.0` (ADR-005). Заміри 13.10.2026: Vitest 4.1.11, supertest, `@vitest/coverage-v8` (v8), тестова MySQL 8.0 у Docker (`docker-compose.yml`). Готові тести замовлень, тарифу, сайтів, сторінок, товарів, команди, загальних обмежень платформи, автентифікації, профілю й життєвого циклу акаунта та підтримки; тести frontend — у розділі 11.

| Файл (`backend/tests/characterization/`) | Тестів | Область |
|------------------------------------------|--------|---------|
| `app.smoke.test.js` | 13 | каркас застосунку, `verifyToken` |
| `orders.checkout.test.js` | 27 | оформлення замовлення, ціна |
| `orders.checkout.input.test.js` | 5 | кількість у позиціях, помилки без статусу |
| `orders.stock.test.js` | 9 | списання залишків |
| `orders.payment.test.js` | 25 | callback LiqPay, Google Pay |
| `orders.access.test.js` | 12 | доступ до замовлень, статуси |
| `transactions.upgrade.test.js` | 12 | тариф PLUS |
| `sites.public.test.js` | 66 | публічний перегляд сайту, видимість сторінок, відвідування, каталог, шаблони |
| `sites.create.test.js` | 39 | створення сайту (порожнього й із шаблону), перевірка адреси |
| `sites.access.test.js` | 58 | налаштування, ключі LiqPay, скидання до шаблону, закріплення, перейменування, видалення, аналітика |
| `pages.test.js` | 49 | сторінки сайту: створення, читання, вміст, налаштування, видалення, головна |
| `products.test.js` | 98 | товари, галерея, категорії, відгуки |
| `team.test.js` | 59 | блокування редагування, запрошення, співавтори, передача сайту |
| `platform.guards.test.js` | 11 | режим обслуговування, блокування редактора |
| `auth.register.test.js` | 30 | реєстрація, підтвердження пошти, слабкі паролі, генерація коду |
| `auth.login.test.js` | 23 | вхід, видані токени, стан акаунта, `/auth/me`, `/auth/refresh` |
| `auth.tokens.test.js` | 19 | `verifyToken`, запасний секрет, відкликання токенів |
| `auth.admin.test.js` | 24 | вхід персоналу з двофакторним кодом, `resend-otp` |
| `auth.recovery.test.js` | 24 | відновлення пароля |
| `auth.guards.test.js` | 24 | обмежувачі частоти, Cloudflare Turnstile |
| `auth.google.test.js` | 19 | вхід через Google (стратегія passport, `googleCallback`) |
| `users.profile.test.js` | 41 | публічний профіль, редагування, пароль, аватар |
| `users.lifecycle.test.js` | 20 | видалення й відновлення акаунта, строк 14 днів |
| `support.test.js` | 37 | звернення, апеляції, відповіді, адмінський список |
| **Разом** | **744** | усі проходять (24 файли) |

Тестами backend відтворено 45 дефектів із 86 (реєстр на момент заміру; обидва критичні, 11 із 14 високих, 19 із 31 середніх, 13 із 39 низьких): D-SEC-01, D-SEC-02, D-SEC-03, D-SEC-04, D-SEC-05, D-SEC-06, D-SEC-07, D-SEC-09, D-SEC-10, D-SEC-12, D-SEC-14, D-SEC-15, D-SEC-16, D-SEC-17, D-SEC-18, D-SEC-19, D-SEC-20, D-SEC-21, D-SEC-22, D-SEC-23, D-SEC-24, D-SEC-25, D-SEC-26, D-BIZ-01, D-BIZ-02, D-BIZ-03, D-BIZ-04, D-BIZ-05, D-BIZ-06, D-BIZ-08, D-BIZ-09, D-BIZ-10, D-BIZ-11, D-BIZ-12, D-BIZ-13, D-BIZ-14, D-BIZ-15, D-BLK-05, D-ARC-10, D-ARC-11, D-ARC-12, D-CFG-01, D-CON-01, D-CON-05, D-DEAD-08. Перелік складено за маркерами `KNOWN-DEFECT D-…` у коді тестів. Загальний реєстр на момент заміру налічує 86 дефектів: 12 із них (D-SEC-19…D-SEC-26, D-BIZ-13…D-BIZ-15, D-ARC-12) знайдено під час написання тестів автентифікації, профілю й підтримки.

Покриття backend (файли `app.js`, `config/`, `controllers/`, `middleware/`, `models/`, `routes/`, `utils/`, перелік у `backend/vitest.config.mjs`):

| Метрика | Покрито | Усього | Частка |
|---------|---------|--------|--------|
| Рядки | 2 598 | 3 814 | 68,12 % |
| Оператори | 2 740 | 4 094 | 66,93 % |
| Функції | 241 | 365 | 66,03 % |
| Гілки | 1 375 | 2 284 | 60,20 % |

Vitest виводить частки з усіканням (68,11 %, 66,92 %, 66,02 %, 60,2 %); наведено точні значення. Для порівняння: на `v0` покриття backend дорівнювало 0 % (тестів не було). Тести не перевіряють роботу маршрутів адмін-панелі (`/api/admin`: лише доступ до неї після входу персоналу й режим обслуговування), медіатеки й завантаження файлів (лише режим обслуговування), форм (`/api/form`, `/api/public/form`), доставки, скарг, шаблонів користувача, тегів, обраного й збережених блоків; ці контролери, а також моделі й гілки помилок, яких тести не торкаються, лишаються непокритими. Зріз реструктуризації `v1.0` (`order`, `site`, `page`, `product`) характеризаційними тестами охоплено.

Відтворення: `docker compose up -d`, далі в `backend/` — `npm install --legacy-peer-deps` і `npm run test:coverage`.

## 11. Характеризаційні тести frontend (`v0.1`)

Так само не замір `v0`: тести додано до незмінного коду, щоб мати базу для порівняння з `v1.0` і `v2.0` (ADR-005). Vitest 4.1.2, jsdom, Testing Library; компоненти блоків і панелей підмінено заглушками, `JSZip`, `file-saver` і мережу в тестах експорту — підмінами. Фіксується поточна поведінка, зокрема помилкова; золоті файли (`frontend/tests/golden/`) зберігають повний вивід експорту.

| Файл (`frontend/tests/`) | Тестів | Область |
|---------------------------|--------|---------|
| `unit/linkUtils.test.js` | 27 | `resolveSiteLink`, небезпечні схеми посилань |
| `unit/htmlGenerator.test.js` | 115 | експорт сайту: каркас, правила для кожного блока, екранування, золоті файли |
| `unit/blockUtils.test.js` | 33 | пошук, зміна, видалення, додавання й переміщення блоків у дереві |
| `unit/editorConfig.test.jsx` | 40 | каталог блоків, значення за замовчуванням, опції |
| `unit/exportDefaults.test.jsx` | 7 | експорт блоків із значеннями за замовчуванням редактора (золотий файл) |
| `unit/siteExporter.test.js` | 24 | архів сайту: файли, медіа, тема |
| `integration/BlockRenderer.test.jsx` | 40 | відповідність «тип → компонент», обгортки, порожній стан |
| `integration/SettingsTab.test.jsx` | 33 | відповідність «тип → панель налаштувань» |
| `integration/CartContext.test.jsx` | 22 | кошик: збереження, зміна, перемикання користувача |
| `integration/ProductCard.test.jsx` | 33 | картка товару: ціна зі знижкою, кнопка покупки |
| `integration/ProductDetailPage.test.jsx` | 29 | сторінка товару: ціна, варіанти, кнопка покупки, стани |
| `integration/CartPage.test.jsx` | 29 | сторінка кошика: суми, оформлення, способи оплати |
| `unit/validationUtils.test.js`, `integration/InputWithCounter.test.jsx` | 9 + 3 | тести, що були на `v0` |
| **Разом** | **444** | усі проходять (14 файлів); 432 нових |

Відтворено дефекти D-BIZ-01 (клієнтська частина) і D-BLK-02, знайдено D-SEC-27, D-BLK-06, D-BLK-07 і D-ARC-13 (див. `defects.md`). Тести `BlockRenderer`, `SettingsTab` і `editorConfig` фіксують таблиці типів блоків, якими після переходу на реєстр (ADR-002) мають стати дескриптори, тож у `v1.0` вони лишаються зеленими без змін.

Покриття frontend (ті самі параметри, що й у розділі 9: `@vitest/coverage-v8` 4.1.2, усі 196 файлів `frontend/src/**/*.{js,jsx}`, тести `tests/unit` і `tests/integration`; сирі дані — `raw/coverage-frontend-tests/coverage-summary.json`):

| Метрика | Покрито | Усього | Частка | `v0` (розділ 9) |
|---------|---------|--------|--------|-----------------|
| Рядки | 936 | 9 705 | 9,64 % | 0,73 % |
| Оператори | 1 059 | 11 039 | 9,59 % | 0,72 % |
| Функції | 192 | 2 712 | 7,07 % | 0,41 % |
| Гілки | 1 176 | 10 848 | 10,84 % | 0,77 % |

Знаменники збігаються із замірами `v0`, тож порівняння коректне. Покриття сконцентровано там, де тести цілеспрямовано фіксують поведінку: за рядками `htmlGenerator.js`, `blockUtils.js`, `editorConfig.jsx`, `linkUtils.js`, `SettingsTab.jsx`, `CartContext.jsx` — 100 %, `siteExporter.js` — 99,1 %, `BlockRenderer.jsx` — 95,6 %, `ProductCard.jsx` — 86,7 %, `CartPage.jsx` — 76,3 %, `ProductDetailPage.jsx` — 67,7 %. За каталогами: `modules/shop` — 53,8 % (328 із 610 рядків), `shared/utils` — 65,8 % (288 із 438), `modules/editor` — 11,4 % (224 із 1 957). Каталоги `modules/dashboard`, `modules/admin`, `modules/auth`, `modules/media`, `modules/profile`, `modules/support` і `shared/ui` майже або повністю не покриті. Низьке загальне значення очікуване: код блоків і редактора сторінки тестами не охоплено, бо їх підмінено заглушками.

Тести не перевіряють відображення самих блоків (їх підмінено заглушками), перетягування блоків у браузері, адмін-панель, профіль і підтримку; ці частини frontend лишаються непокритими.

Відтворення: у `frontend/` — `npm install --legacy-peer-deps`, далі `npx vitest run tests/unit tests/integration`. Покриття: `npm i --no-save --legacy-peer-deps @vitest/coverage-v8@4.1.2`, далі та сама команда з параметрами `--coverage.enabled --coverage.provider=v8 "--coverage.include=src/**/*.{js,jsx}" --coverage.reporter=text --coverage.reporter=json-summary`.
