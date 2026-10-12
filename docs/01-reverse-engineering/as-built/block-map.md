# Карта реєстрації блоків (v0)

Доповнення до діаграми `block-registration.puml`: де саме в коді описано кожен тип блока редактора й чим відрізняються набори ключів. Дані зібрано читанням коду на теґу `v0`; таблицю можна відтворити за номерами рядків.

## Шість місць, де описано тип блока

| № | Місце | Файл і рядки | Що містить | Ключів |
|---|---|---|---|---|
| ① | `BLOCK_LIBRARY` | `frontend/src/modules/editor/core/editorConfig.jsx:5–31` | тип, назва, іконка, пресети макета | 15 |
| ② | `getDefaultBlockData` | `editorConfig.jsx:65–224` | значення за замовчуванням (`switch`) | 15 |
| ③ | `blockMap` | `editor/core/BlockRenderer.jsx:23–40` | тип → React-компонент (`lazy`) | 16 |
| ④ | `SettingsComponentMap` | `editor/ui/tabs/SettingsTab.jsx:22–40` | тип → панель налаштувань | 17 |
| ⑤ | списки категорій палітри | `editor/ui/tabs/AddBlocksTab.jsx:175–178` | чотири переліки типів, записані вручну | 15 (разом) |
| ⑥ | `generateBlockHTML` | `shared/utils/htmlGenerator.js:116–335` | HTML для експорту сайту (`switch`) | 15 |

Додавання нового типу блока (наприклад, `quote`) потребує двох нових файлів (`XxxBlock.jsx`, `XxxSettings.jsx`) і правок у всіх шести місцях: разом вісім змін. Пропуск будь-якого місця не викликає помилки збірки: блок просто не з'явиться в палітрі, не відкриє налаштування або не потрапить в експорт (у `BlockRenderer` для невідомого типу показується червоний блок «Невідомий тип блоку», у `generateBlockHTML` повертається порожній рядок).

## Матриця «тип × місце»

Знак «✓» означає, що тип є в наборі. Для хедера й футера враховано псевдоніми (див. наступну таблицю).

| Тип блока | ① | ② | ③ | ④ | ⑤ | ⑥ |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `hero` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `text` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `image` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `button` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `layout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `showcase` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (заглушка) |
| `catalog` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (заглушка) |
| `features` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `form` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `video` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `map` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `accordion` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `social_icons` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `global-header` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (як `header`) |
| `global-footer` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (як `footer`) |

Усі п'ятнадцять типів присутні в усіх шести місцях, тобто на v0 набори узгоджені. Проблема не в пропусках, а в тому, що узгодженість тримається вручну, а експорт відтворює кожен блок вдруге: `catalog` і `showcase` у ⑥ замінено заглушками з порожніми картками (`htmlGenerator.js:294–317`, на сторінці експорту стоїть напис «Dynamic catalog requires backend connection»).

## Псевдоніми хедера й футера

Для глобальних хедера й футера використовуються по два імені, і набори ключів розрізняються:

| Місце | `global-header` | `header` | `global-footer` | `footer` |
|---|:-:|:-:|:-:|:-:|
| ① `BLOCK_LIBRARY` | ✓ | — | ✓ | — |
| ② `getDefaultBlockData` | ✓ | — | ✓ | — |
| ③ `blockMap` | ✓ | ✓ | ✓ | — |
| ④ `SettingsComponentMap` | ✓ | ✓ | ✓ | ✓ |
| ⑤ палітра | ✓ | — | ✓ | — |
| ⑥ `generateBlockHTML` | — | ✓ | — | ✓ |

Розходження гасяться перейменуванням «на льоту»:

- Бекенд створює хедер із типом `header` у трьох місцях: `createSite` (рядок 168), `updateSiteSettings` (380) і `resetSiteToTemplate` (512) у `backend/controllers/siteController.js`.
- Редактор і рендерер при завантаженні сторінки замінюють `header` / `footer` на `global-header` / `global-footer` і підставляють дані з `sites.header_content` / `sites.footer_content` (або `getDefaultBlockData`). Цей код скопійовано у чотирьох місцях: `SiteDashboardPage.jsx:417–428`, `SiteDisplayPage.jsx:111–127`, `ProductDetailPage.jsx:78–95`, `SitePreviewer.jsx:240,271` (дефект D-DUP-07).
- Під час збереження сторінки дані хедера й футера виносяться окремим запитом `PUT /sites/:path/settings`, а в `pages.block_content` лишається блок із порожнім `data: {}` (`SiteDashboardPage.jsx:543–563`).
- Експорт (`generateFullHTML`, `htmlGenerator.js:338–354`) створює блоки `header` / `footer` із полів сайту, тому в ⑥ їх названо без префікса `global-`.

Наслідок: сирий блок `footer`, що потрапив би напряму в `BlockRenderer`, відобразився б як «Невідомий тип блоку». Зараз такого шляху немає, бо всі три місця виклику (`SiteDisplayPage`, `ProductDetailPage`, `SitePreviewer`) нормалізують дані заздалегідь.

## Формат JSON блока: диплом і код

| Ознака | У дипломі (розділ 2.2, JSON-схема) | У коді v0 |
|---|---|---|
| Ідентифікатор блока | `id` | `block_id` (`SiteDashboardPage.jsx:512`, `siteController.js:13`); у вкладених елементах (пункти меню, акордеон, переваги) — `id` |
| Значення `type` | `"Hero"`, `"Text"` (з великої літери) | `'hero'`, `'text'`, `'social_icons'`, `'global-header'` (нижній регістр) |
| Вміст блока | `props` | `data` |
| Вкладені блоки | не описано | `layout`: `data.columns` — масив колонок, кожна — масив блоків |
| Спільні поля `data` | не описано | `styles.paddingTop` / `paddingBottom`, `animation`, `anchorId` (`BlockRenderer.jsx:92,114–118,146`) |

Див. також `gap-analysis.md` (рядок про схему JSON).

## Пов'язані дефекти

- D-BLK-01: шість місць опису одного типу.
- D-BLK-02: експорт як другий рендерер.
- D-BLK-03: два цикли залежностей `BlockRenderer` ↔ `LayoutBlock` ↔ `EditableBlockWrapper`.
- D-BLK-05: `block_content` зберігається на сервері без валідації.
- D-DUP-07: чотири копії нормалізації хедера й футера.
- D-DEAD-03: `BlockSettingsModal.jsx` не імпортується.

Цільовий стан (один дескриптор на тип блока з полями `type`, `label`, `icon`, `category`, `getDefaults`, `Component`, `Settings`, `toHtml`) описано в ADR-002 (`docs/03-design/adr/`).
