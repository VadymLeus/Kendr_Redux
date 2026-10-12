# Реєстр дефектів вихідної версії (v0)


Станом на 11.10.2026, код на теґу `v0`. Метод: читання вихідного коду, каталог API, звіти jscpd і madge (`metrics-before.md`, `../01-reverse-engineering/api-catalog.md`). **Жоден дефект поки не відтворено запуском**: колонка «Підтвердження» показує, чим він підтверджений; відтворення тестами виконується на етапі ADR-005, де кожен тест позначається `// KNOWN-DEFECT D-…`.

Номери рядків відповідають файлам на теґу `v0` і виводяться з вивантаження коду; перед цитуванням у звіті їх варто звірити на диску.

## Підсумок

Усього дефектів: **53**.

| Серйозність | Кількість |
|---|---|
| Критична | 2 |
| Висока | 10 |
| Середня | 17 |
| Низька | 24 |

| Категорія | Кількість |
|---|---|
| Безпека та контроль доступу (`SEC`) | 13 |
| Бізнес-логіка (`BIZ`) | 6 |
| Архітектура backend (`ARC`) | 7 |
| Редактор блоків (`BLK`) | 5 |
| Дублювання коду (frontend) (`DUP`) | 7 |
| Розбіжності клієнта й сервера (`CON`) | 7 |
| Мертвий код (`DEAD`) | 4 |
| Тестування (`TST`) | 2 |
| Конфігурація (`CFG`) | 2 |

| Планове виправлення | Кількість |
|---|---|
| до v1.0 | 2 |
| v1.0 | 18 |
| v1.0 → v2.0 | 1 |
| v2.0 | 20 |
| Перспективи | 12 |

Шкала серйозності: **критична**: обхід оплати або автентифікації без особливих умов; **висока**: доступ до чужих даних, втрата коштів чи функції, що вимагає лише звичайного облікового запису; **середня**: ризик за додаткових умов або помітна функціональна помилка; **низька**: підтримуваність, дрібні помилки.

«Планове виправлення» посилається на `README.md` (теґи) та `../03-design/adr/`. Усе, що позначено «Перспективи», описується в роботі, але не виправляється.

## Безпека та контроль доступу (`SEC`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-SEC-01 | Критична | `backend/controllers/transactionController.js:55–87` (`processGooglePayUpgrade`); `routes/transactionRoutes.js:8` | Будь-який авторизований користувач викликом `POST /api/transactions/upgrade/gpay` отримує тариф PLUS без оплати. Дані `paymentData` із запиту не перевіряються й використовуються лише для формування `provider_id` (запасне значення `gpay_test_<час>`); у `transactions` записується успішна транзакція. | читання коду | v2.0 (ADR-006) |
| D-SEC-02 | Критична | `backend/controllers/orderController.js:301–371` (`processGooglePay`); `routes/orderRoutes.js:10` | Покупець позначає власне замовлення оплаченим без звернення до платіжного шлюзу: `paymentData` не перевіряється. Далі списуються залишки, власнику сайту додається «успішна» транзакція, а для цифрових товарів на пошту покупця надсилаються посилання на файли (рядки 341–344), тобто товар отримано безкоштовно. | читання коду | v2.0 (ADR-006) |
| D-SEC-03 | Висока | `backend/controllers/orderController.js:373–402` (`getSiteOrders`, `updateOrderStatus`); `routes/orderRoutes.js:12–13` | Обидва маршрути захищені лише `verifyToken`: власник сайту не перевіряється. Будь-який авторизований користувач читає замовлення будь-якого сайту (ПІБ, email, телефон, адреса, склад замовлення) і змінює статус будь-якого замовлення на довільне значення (білого списку статусів немає). | читання коду; каталог API | v2.0 (ADR-004) |
| D-SEC-04 | Висока | `backend/controllers/authController.js:199–250` (`verify2FA`, `resendOtp`); `routes/authRoutes.js:64,66` | `resend-otp` приймає `purpose` із тіла запиту й записує його як призначення коду для будь-якого email. `verify-2fa` не вимагає, щоб крок пароля був пройдений, і не перевіряє роль та статус. Результат: токен видається за email і кодом із пошти без пароля, зокрема для admin і moderator, для яких скидання пароля поштою навмисно вимкнено (`authController.js:257`). Потрібен доступ до пошти жертви. Крім того, `resendOtp` розкриває наявність email (404 проти 200). | читання коду | v2.0 (ADR-004) |
| D-SEC-05 | Висока | `backend/controllers/siteController.js:64–90` (`getSiteInfoById`); `routes/siteRoutes.js:16` | Публічний маршрут `GET /api/sites/info/:id` без автентифікації повертає `author_email` (а також ім'я й аватар) власника сайту. Ідентифікатор сайту числовий (рис. 2.4 диплома), тож перебором можна зібрати email власників. | читання коду; перебір ідентифікаторів не відтворювався | v2.0 (ADR-004) |
| D-SEC-06 | Висока | `backend/models/Site.js:160–169` (`findByIdAndUserId`); 19 викликів у 6 контролерах; `teamController.js:122,181`; `siteController.js:266–297,484–535` | Права співавторів (`permissions`) лише зберігаються й віддаються інтерфейсу, але на сервері ніде не перевіряються. `findByIdAndUserId` пропускає будь-якого запису з `site_collaborators`, тому співавтор з мінімальними правами керує товарами, категоріями, сторінками, заявками з форм і може скинути сайт до шаблону (`resetSiteToTemplate`). Виклики: `categoryController` (1), `formController` (5), `pageController` (2), `productController` (7), `siteController` (2), `userTemplateController` (2). | читання коду | v2.0 (ADR-004) |
| D-SEC-07 | Середня | `backend/controllers/orderController.js:249–299` (`liqpayCallback`); `transactionController.js:89–114` (`liqpayWebhook`) | Підпис LiqPay перевіряється (`orderController.js:270–273`, `transactionController.js:95–98`), але сума й валюта з повідомлення не звіряються із сумою замовлення чи тарифу. Підпис порівнюється звичайним `!==`. | читання коду | v2.0 (ADR-006) |
| D-SEC-08 | Середня | `backend/routes/publicFormRoutes.js:6`; `utils/emailService.js:10–31`; `controllers/formController.js:8–39` | Публічна форма `POST /api/public/form/:siteId/submit` без капчі й обмеження частоти: кожна заявка надсилає лист власнику сайту (розсилка спаму від імені платформи). Поля `name`, `email`, `subject`, `message` та назва сайту підставляються в HTML листа без екранування, тому в листі з брендом платформи можна розмістити довільну розмітку. Запис заявки створюється до перевірки існування сайту (рядок 17 проти 19–25). | читання коду | Перспективи |
| D-SEC-09 | Середня | `backend/controllers/authController.js:101,123,216,344,353,369`; `middleware/verifyToken.js:11`; `verifyTokenOptional.js:13` | Запасний секрет `process.env.JWT_SECRET \|\| 'secret_key'`. Якщо змінну не задано в середовищі, токени можна підробити. В інших місцях (`userController.js:239`, `middleware/trackVisit.js:20`) запасного значення немає, тобто поведінка непослідовна. | читання коду; значення на розгортанні не перевірялось | v2.0 |
| D-SEC-10 | Низька | `backend/controllers/userController.js:227–249` (`restoreAccount`); `middleware/verifyToken.js:30` | Після відновлення акаунта видається токен без `token_version`, а `verifyToken` пропускає перевірку відкликання, якщо поля в токені немає: такий токен не втрачає чинність після зміни пароля. | читання коду | Перспективи |
| D-SEC-11 | Середня | `frontend/src/modules/editor/blocks/Footer/FooterBlock.jsx:113,130`; `AuthContext.jsx:22,63`; `shared/api/api.js:13` | Посилання футера підставляються в `href` без обробки (`link.link \|\| '#'`), тоді як `resolveSiteLink` (`shared/utils/linkUtils.js:5`) і `transformLink` в експорті (`htmlGenerator.js:16`) блокують `javascript:`, `data:`, `vbscript:`. Токен авторизації лежить у `localStorage`, а сайти показуються на тому ж origin (`/site/:site_path`, `App.jsx:76–77`). Вплив залежить від версії React; потребує відтворення. | читання коду; потребує відтворення | v2.0 (ADR-002) |
| D-SEC-12 | Низька | `backend/controllers/authController.js:9,62,205,278,295` | Одноразові коди генеруються через `Math.random()` (не криптографічний генератор), мають 6 цифр і порівнюються `!==`. Обмеження частоти на маршрутах є (`routes/authRoutes.js:30,64–68`). | читання коду | Перспективи |
| D-SEC-13 | Низька | `backend/server.js:49–50` | Ліміт тіла запиту 50 МБ застосовано до всіх маршрутів, зокрема публічних; глобального обмеження частоти запитів немає (лише на маршрутах автентифікації). | читання коду | Перспективи |

## Бізнес-логіка (`BIZ`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-BIZ-01 | Висока | `frontend/.../ProductCard.jsx:54–57`; `ProductDetailPage.jsx:225–244`; `CartPage.jsx:115–118`; `backend/controllers/orderController.js:142` | Ціна рахується трьома способами. Картка товару враховує лише `sale_percentage`. Сторінка товару додає `priceModifier` варіантів і бере знижку за правилом «варіант, інакше товар, інакше категорія». Кошик підсумовує ціни, надіслані клієнтом. Сервер при оформленні рахує `parseFloat(product.price) * quantity`: знижки й надбавки варіантів не враховуються. Покупець бачить в кошику одну суму, а замовлення (і сума LiqPay) створюються за каталожною ціною. Точну поведінку треба підтвердити тестом. | читання коду | v1.0 → v2.0 (ADR-004) |
| D-BIZ-02 | Висока | `backend/controllers/orderController.js:135,282–285,332–335` | Залишок перевіряється при оформленні, але списується лише в `liqpayCallback` і `processGooglePay`. Замовлення з оплатою при отриманні залишок не зменшують; `updateOrderStatus` теж його не чіпає. Перевірка залишку виконується без блокування рядка (`FOR UPDATE` немає), тому одночасні замовлення можуть перевищити запас. | читання коду | v2.0 (ADR-004) |
| D-BIZ-03 | Середня | `backend/config/mediaLimits.js:14–41`; `controllers/mediaController.js:57–59`; `controllers/userController.js:23,34`; UI: `CommerceTab.jsx:27–28`, `CreateSitePage.jsx:80–81`, `MySitesPage.jsx:124–125`, `ProfileGeneralTab.jsx:139–141` | Ліміти тарифу на кількість сайтів, товарів і категорій сервер лише віддає клієнту; перевіряє їх інтерфейс. Обробники створення сайту, товару й категорії ліміт не застосовують (ліміти на файли сервер перевіряє). | читання коду | v2.0 (ADR-004) |
| D-BIZ-04 | Середня | `backend/controllers/authController.js:28,301`; `controllers/userController.js:183–210`; `frontend/src/shared/utils/validationUtils.js:2–6` | Правила пароля існують у чотирьох варіантах. Клієнт вимагає 8 символів, цифру, велику й малу літери та відсікає прості послідовності. Сервер при реєстрації й скиданні перевіряє лише `^(?=.*[A-Z])(?=.*\d).{8,}$` (два однакових копіювання). `changePassword` не перевіряє новий пароль зовсім. | читання коду | Перспективи |
| D-BIZ-05 | Низька | `frontend/src/shared/config/limits.js:4`; `GeneralIdentitySection.jsx:145`; `validationUtils.js:51`; `backend/controllers/siteController.js:44` | Довжина адреси сайту (slug): поле вводу обмежене 30 символами, клієнтська перевірка допускає 40, сервер допускає 40. | читання коду | v1.0 |
| D-BIZ-06 | Середня | `backend/controllers/userController.js:212–225` (`deleteAccount`) | Після `User.softDeleteUser` викликається `Site.setAllUserSitesToDraft`, якого немає в жодному файлі backend. Виникає `TypeError`, користувач отримує помилку 500, але акаунт уже позначено видаленим, а сайти не переводяться в чернетки, що задумано при видаленні акаунта. | читання коду (єдина згадка методу в коді) | v2.0 |

## Архітектура backend (`ARC`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-ARC-01 | Висока | `backend/controllers/*` (`adminController` 43, `teamController` 30, `orderController` 29, `siteController` 28 викликів) | 14 із 21 контролера виконують SQL безпосередньо, усього 196 викликів. Це не відповідає рис. 2.5 диплома (ланцюжок «контролер → модель → БД»). | каталог API; читання коду | v1.0 (зріз order, site, page, product: 66 викликів) |
| D-ARC-02 | Середня | `backend/controllers/{delivery,media,order,report,team,transaction}Controller.js` | Шість контролерів не мають жодної моделі (п'ять із них пишуть SQL самі). У `models/` немає Order, Transaction, Team, Report. | каталог API | v1.0 (OrderRepository у зрізі) |
| D-ARC-03 | Середня | `orderController.js:62,307`; `siteController.js:130,516`; `supportController.js:42`; `teamController.js:243`; `transactionController.js:63`; `models/Page.js:76`; `models/Site.js:291` | Транзакції відкриваються вручну в дев'яти місцях (сім у контролерах, дві в моделях), без єдиної обгортки. | читання коду | v1.0 (`withTransaction`, зріз) |
| D-ARC-04 | Низька | `authController.js:10`; `orderController.js:18`; `siteController.js:25`; `adminController.js:655,694`; `middleware/platformGuards.js:17` | Читання таблиці `global_settings` розкидано по п'яти файлах: три локальні копії `getGlobalSettings` вибирають різні стовпці, ще два місця звертаються до таблиці напряму. | читання коду | Перспективи |
| D-ARC-05 | Низька | `adminController.js:274,291,344,369,394,493`; `adminController.js:322,426,524`; `pageController.js:58,83,110,136,167` | У `adminController` той самий запит `FROM sites s JOIN users u ON s.user_id = u.id` повторюється шість разів, а логіка страйків із `Warning.countForUser` щонайменше в трьох обробниках (jscpd: клони 11 і 13 рядків). У `pageController` `LEFT JOIN site_collaborators` повторюється в п'яти запитах. | jscpd + читання коду | v1.0 (pageController), решта — Перспективи |
| D-ARC-06 | Середня | `backend/middleware/errorHandler.js:9–24`; `controllers/mediaController.js:84–112`; `middleware/upload.js:25–48` | Формат помилок не уніфіковано. Помилки завантаження та перевищення лімітів тарифу повертаються з HTTP 200 і полем `error: true`; решта помилок віддає `err.message` клієнту. Ліміти типу, розміру й кількості файлів перевіряються після того, як файл уже завантажено в Cloudinary, і при порушенні файл видаляється (`cloudinary.uploader.destroy`). | читання коду | Перспективи |
| D-ARC-07 | Середня | `backend/middleware/upload.js:88–96`; `routes/authRoutes.js:59`, `productRoutes.js:34`, `siteRoutes.js:18`, `uploadRoutes.js:12`, `userRoutes.js:23`; `utils/fileUtils.js:15–40`; `authController.js:37` | Міграція файлового сховища на Cloudinary не завершена. `processAndSaveImage`, `processAndSaveLogo`, `processAndSaveGeneric` є порожніми заглушками (`next()`), але підключені у п'яти маршрутах. `deleteFile` видаляє лише локальні файли, тож ресурси Cloudinary після видалення користувачів, сайтів і товарів лишаються. При реєстрації адреса аватара формується як локальний шлях `/uploads/avatars/custom/<filename>`, хоча файл зберігається в Cloudinary. Відтворення: реєстрація з аватаром. | читання коду; потребує відтворення для аватара | Перспективи |

## Редактор блоків (`BLK`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-BLK-01 | Висока | `BlockRenderer.jsx:23`; `editorConfig.jsx:5,65`; `ui/tabs/SettingsTab.jsx:22`; `ui/tabs/AddBlocksTab.jsx:175–178`; `shared/utils/htmlGenerator.js:116` | Опис одного типу блока розкидано по шести місцях у п'яти файлах: відповідність типу компоненту, каталог, значення за замовчуванням, панель налаштувань, списки категорій і експорт. Додавання блока потребує двох нових файлів і правок у всіх шести місцях. | читання коду | v1.0 (ADR-002) |
| D-BLK-02 | Середня | `frontend/src/shared/utils/htmlGenerator.js:116,315`; `shared/utils/siteExporter.js` | Експорт сайту фактично є другим рендерером: кожен блок описано повторно у `switch`. Блоки «Каталог» і «Вітрина» в експорті замінено заглушкою (`Dynamic catalog requires backend connection.`). | читання коду | v1.0 (ADR-002) |
| D-BLK-03 | Низька | `BlockRenderer.jsx:13`; `blocks/Layout/LayoutBlock.jsx:6`; `ui/EditableBlockWrapper.jsx` | Два цикли залежностей (madge): `BlockRenderer` → `LayoutBlock` → `BlockRenderer` та через `EditableBlockWrapper`. Для `LayoutBlock` застосовано `React.lazy`, тому на роботу це не впливає, але вказує на відсутність спільного реєстру. | madge | v1.0 (ADR-002) |
| D-BLK-04 | Низька | `frontend/src/modules/editor/blocks/{Accordion,Button,Features,Footer,Form,Hero,Image,ShowCase,SocialIcons,Text,Video}Block.jsx` | Одинадцять блоків обгорнуто в `React.memo` з порівнянням `JSON.stringify(prev.blockData) === JSON.stringify(next.blockData)`: серіалізація при кожному рендері. Утиліти `blockUtils` вже працюють з незмінними структурами (immer). | читання коду | v1.0 (ADR-002) |
| D-BLK-05 | Середня | `backend/controllers/pageController.js:74–96` (`updatePageContent`); `routes/pageRoutes.js`; `backend/server.js:49` | `PUT /api/pages/:pageId/content` перевіряє лише права на сторінку, а `block_content` зберігає як є (`block_content \|\| []`): ні типу значення (масив чи ні), ні переліку допустимих `type`, ні форми `data`, ні розміру (крім загального ліміту тіла 50 МБ). Специфікація в дипломі (табл. 2.3, кроки 8 і 8а) передбачає серверну валідацію JSON і відхилення запиту; у коді її немає. Некоректний JSON, збережений через API, ламає відображення сторінки на публічному сайті й у редакторі. | читання коду | v2.0 (ADR-002) |

## Дублювання коду (frontend) (`DUP`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-DUP-01 | Середня | `ProductManager.jsx:25`; `GeneralSettingsTab.jsx:59`; `GeneralTemplatesSection.jsx:66`; `CreateSitePage.jsx:179`; `HeaderBlock.jsx:21`; `MediaInspector.jsx:18`; `CartPage.jsx:275`; `MyOrdersPage.jsx:42`; `TicketDetailPage.jsx:202`; `SiteCoverDisplay.jsx:10`; `SiteGridCard.jsx:226`; `UniversalMediaInput.jsx:26`; `Avatar.jsx:25`; `SiteHeader.jsx:6` | Перетворення шляху до медіа в повну адресу реалізовано не менше ніж у 14 локальних функціях, тоді як спільна `getMediaUrl` (`shared/utils/mediaUtils.js:14`) існує. Знайдено пошуком за іменами функцій, тож реальна кількість може бути більшою. | читання коду | v1.0 (за наявності часу) |
| D-DUP-02 | Низька | `AdminBillingPage.jsx:60`; `OrdersTab.jsx:64`; `AnalyticsTab.jsx:16`; `ProductCard.jsx:64`; `CartPage.jsx:42`; `MyOrdersPage.jsx:69`; `ProductDetailPage.jsx:135` | Таблиця символів валют `currencyMap` оголошена у сім місцях. | читання коду | v1.0 (за наявності часу) |
| D-DUP-03 | Середня | `SiteDisplayPage.jsx:27–57`; `SiteDashboardPage.jsx:300–335`; `ProductDetailPage.jsx:101–124`; `SitePreviewer.jsx:197–214` | Обчислення теми сайту (кольори світлого й темного режимів, CSS-змінні, розбір `theme_settings`) повторюється щонайменше у чотирьох місцях (jscpd: клони 12–18 рядків). | jscpd + читання коду | v1.0 (за наявності часу) |
| D-DUP-04 | Низька | `SiteDashboardPage.jsx:26,83` ↔ `SitePreviewer.jsx:12`, `BlockEditor.jsx:13` | Компонент `DeviceIframe` та хук `useDragAutoScroll` скопійовано (jscpd: клони 36 і 45 рядків). | jscpd | v1.0 (за наявності часу) |
| D-DUP-05 | Низька | `shared/hooks/useConfirm.js` та `app/providers/ConfirmContext.jsx`; `shared/hooks/useConfirmDialog.js` (`MyTicketsPage.jsx:10,48`; `TicketDetailPage.jsx:9,31`) | Два механізми підтвердження дій: контекстний `useConfirm` (використовується широко) і локальний `useConfirmDialog` (дві сторінки). | читання коду | Перспективи |
| D-DUP-06 | Низька | `OrdersTab.jsx` ↔ `MyOrdersPage.jsx` (23 рядки); `MediaPickerModal.jsx` ↔ `MediaLibraryPage.jsx` (23 + 10 + 10); `NewTicketPage.jsx` ↔ `TicketDetailPage.jsx` (24 + 11); `AdminUsersSitesPage.jsx` ↔ `ProfilePage.jsx` (14 + 18 + 10); `CatalogSettings.jsx` ↔ `ShowCaseSettings.jsx` | Решта значних клонів за звітом jscpd (повний перелік у `raw/jscpd/jscpd-report.json`). | jscpd | Перспективи |
| D-DUP-07 | Низька | `SiteDashboardPage.jsx:417–428`; `SiteDisplayPage.jsx:111–127`; `ProductDetailPage.jsx:78–95`; `SitePreviewer.jsx:240,271` | Перетворення глобальних хедера й футера (`type: header \| footer` → `global-header \| global-footer`, дані з `sites.header_content` / `footer_content`, запасний варіант із `getDefaultBlockData`) скопійовано у чотирьох місцях з однаковою логікою розбору JSON. Бекенд при створенні сайту записує тип `header` (`siteController.js:168,380,512`), редактор і рендерер перейменовують його на льоту. | читання коду | v1.0 (ADR-002) |

## Розбіжності клієнта й сервера (`CON`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-CON-01 | Висока | `frontend/src/modules/admin/pages/AdminTicketsReportsPage.jsx:99,105`; `backend/routes/supportRoutes.js:26`; `controllers/supportController.js:89,111,143–170` | Адмін-панель викликає `PUT /support/admin/:id/status`, а на сервері є лише `PUT /support/:ticketId/status`: закриття й відновлення тікета з адмінки повертає 404. Навіть після виправлення шляху модератор отримає 403, бо контролер вважає адміністратором лише роль `admin` (рядок 154). Те саме в `getTicketById` (рядок 89) та `addReply` (рядок 111): модератор бачить список тікетів (`verifyAdmin` пускає й `moderator`), але не може відкрити тікет чи відповісти, хоча за дипломом (табл. 2.1, рис. 2.1) обробляє звернення. Чи має модератор працювати з тікетами, — рішення за власником продукту. | читання коду; каталог API | v2.0 |
| D-CON-02 | Середня | `frontend/src/modules/profile/tabs/ProfileGeneralTab.jsx:131`; `modules/dashboard/pages/SiteDashboardPage.jsx:267`; `app/App.jsx:114` | Виклики `navigate('/auth')` (після виходу з системи) і `navigate('/dashboard')` (заблокований сайт) ведуть на адреси, яких немає в маршрутизації (є `/login`, `/auth/success`, `/dashboard/:site_path`), тому користувач потрапляє на сторінку 404. | читання коду | v2.0 |
| D-CON-03 | Низька | `frontend/src/pages/InvitePage.jsx:44`; `modules/auth/AuthPage.jsx:97`; `AuthSuccessPage.jsx:33–43` | `InvitePage` зберігає адресу повернення під ключем `redirectAfterAuth`, а читають її з ключа `redirectAfterLogin`: після входу за запрошенням користувача не повертає до запрошення. | читання коду | v2.0 |
| D-CON-04 | Низька | `frontend/src/modules/support/TicketDetailPage.jsx:17,205` | Адреса `http://localhost:5000` зашита в коді для вкладень тікета, тоді як решта застосунку використовує `BASE_URL` зі змінної середовища (`shared/config/index.js:2`). | читання коду | v2.0 |
| D-CON-05 | Низька | `frontend/src/modules/profile/pages/ProfilePage.jsx:284–286`; `backend/models/Warning.js:21–22` | Сторінка профілю виводить `warning.reason_note`, але `Warning.findForUser` вибирає лише `id`, `site_id`, `created_at`: причина попередження ніколи не показується. | читання коду | v2.0 |
| D-CON-06 | Низька | `frontend/src/modules/shop/CartPage.jsx:66–75`; `backend/controllers/siteController.js:64–90` | Кошик очікує від `/sites/info/:id` поля `user_id`, `collaborators`/`team`, `is_collaborator`, `role`, яких ендпоінт не повертає. Обмеження «власник і співавтор не купують у власному магазині» в інтерфейсі кошика ніколи не спрацьовує (сервер перевіряє його в `processCheckout`, `orderController.js:70–81`). | читання коду | Перспективи |
| D-CON-07 | Низька | `frontend/src/shared/ui/layouts/Layout.jsx:90–102,118–140` | `Layout` кожні 30 секунд викликає `/auth/me` лише щоб оновити глобальне оголошення, а дані сайту завантажує заново при кожній зміні `location.pathname`. | читання коду | Перспективи |

## Мертвий код (`DEAD`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-DEAD-01 | Низька | `backend/routes/settingsRoutes.js`; `backend/server.js` | Файл маршрутів не підключено в `server.js`: ендпоінт `PUT /platform-theme` недоступний. | каталог API | v1.0 |
| D-DEAD-02 | Низька | `backend/models/UserTemplate.js`; `controllers/userTemplateController.js` | Модель ніде не підключається; контролер працює напряму з SQL (5 викликів). | читання коду | v1.0 |
| D-DEAD-03 | Низька | `frontend/src/modules/editor/ui/modals/BlockSettingsModal.jsx:3–9,12` | Файл ніде не імпортується, а сім його імпортів вказують на неіснуючі шляхи (`./settings/BannerSettings`, `./features/editor/settings/*` тощо). Містить другий, мертвий `SettingsComponentMap`. | читання коду | v1.0 |
| D-DEAD-04 | Низька | `frontend/tailwind.config.js:2,11` | Файл написано як ES-модуль, але містить `require(...)`, і не підключений директивою `@config` у `src/app/styles/index.css`; з Tailwind v4 (`@import "tailwindcss"`) він ігнорується. | читання коду | v1.0 |

## Тестування (`TST`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-TST-01 | Висока | `frontend/tests/` (3 файли, 126 рядків коду); `backend/` (тестів немає) | Один unit-тест, один інтеграційний і один e2e-тест, усі на frontend: 0,30 % від продуктового коду. Для backend тестів немає, покриття не вимірювалось (`metrics-before.md`). | sloc | до v1.0 (ADR-005) |
| D-TST-02 | Низька | `backend/server.js:79` | Застосунок не експортується: `app.listen` викликається в самому модулі, тому HTTP-тести (supertest) без запуску сервера неможливі. | читання коду | до v1.0 (ADR-005) |

## Конфігурація (`CFG`)

| ID | Серйозність | Місце | Опис | Підтвердження | Виправлення |
|---|---|---|---|---|---|
| D-CFG-01 | Середня | `backend/controllers/orderController.js:42,274`; `transactionController.js:22,101` | Параметр `sandbox: 1` зашито в параметри платежу LiqPay (замовлення й тариф), а обробники приймають статус `sandbox` як успішну оплату: у такому вигляді реальні платежі неможливі, а тестові активують замовлення й тариф. | читання коду | v2.0 |
| D-CFG-02 | Низька | `backend/server.js:39–44` | Адреси розгортання (`https://kendr.vercel.app`, `https://kendr-backend.onrender.com`) зашито у списку CORS поряд зі змінною `CLIENT_URL`; для іншого домену потрібна правка коду. | читання коду | v2.0 |

## Пріоритет відтворення тестами

Першими в характеризаційні тести (ADR-005) йдуть дефекти, що впливають на гроші й чужі дані:

1. D-SEC-01
2. D-SEC-02
3. D-SEC-03
4. D-BIZ-01
5. D-BIZ-02
6. D-SEC-06
7. D-SEC-04
8. D-SEC-05
9. D-CON-01
10. D-BIZ-06

## Потребує перевірки й не входить до підсумку

- `frontend/src/shared/utils/htmlGenerator.js:5–7`: у карті екранування `escapeHTML` значення для `&`, `<`, `>` збігаються з ключами (`'<': '<'`). Імовірно, це артефакт вивантаження (сутності могли декодуватися), але перевірте файл на диску: якщо це так і є, експортований сайт не екранує текст.
- Чи задано `JWT_SECRET` на розгортанні (від цього залежить вплив D-SEC-09).
- Версія React і поведінка `javascript:`-посилань у ній (вплив D-SEC-11).
- Твердження з попереднього огляду, які не підтверджувались у цьому проході й тому в реєстр не внесені: що `Layout` завантажує сайт «з усіма товарами» (підтверджено лише повторне завантаження даних сайту, D-CON-07); що кольори теми в копіях розходяться; дублювання `FontPicker` і `FontSelector`, `FontLoader` і `useBlockFonts`.
- `useAutoSave` перевірено в `gap-analysis.md`: у редакторі блоків він не використовується (лише `GeneralSettingsTab.jsx`), дефектом не є.
- `deletion_scheduled_for`: бекенд виставляє дату (+7 днів при призупиненні сайту) і показує її власнику, але в коді backend немає ні планувальника (`setInterval`, `node-cron`), ні запиту, що видаляє сайти після цієї дати (0 збігів). Перевірте `db/schema.sql` на подію MySQL (`CREATE EVENT`): якщо її немає, строк «7 днів» лише інформаційний. Для акаунтів 14-денний строк перевіряється ліниво, під час входу (`authController.js:88–95,146–152`).
- CSS-клас області видимості блоків (`text-scope-…`, `btn-scope-…`, `accordion-scope-…` та ін.) будується з `blockData.block_id || blockData.id || 'preview'`, але `blockData` — це `block.data`, а `block_id` лежить на самому блоці (`BlockRenderer.jsx:136,155`). Тож клас, імовірно, завжди `…-preview`. Вплив залежить від того, що саме задають ці стилі (`<style>.клас { змінні шрифту }`): перевірте в браузері сторінку з двома текстовими блоками з різними шрифтами.
