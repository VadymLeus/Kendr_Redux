# Каталог API (v0)

Згенеровано скриптом [`tools/api_catalog.py`](../../tools/api_catalog.py) із `backend/routes/*.js` та `backend/server.js`; код не виконується, файли лише читаються. Заміри на інших тегах роблять тим самим скриптом.

Колонка «Доступ» визначена за middleware у маршрутах (`verifyToken`, `verifyAdmin`, `verifyStrictAdmin`) і за middleware, підключеним у `server.js` або через `router.use`. Перевірки всередині контролерів (власник сайту, права співавтора) не враховано. Глобальні `verifyTokenOptional` і `checkMaintenance` застосовуються до всіх маршрутів і в колонці middleware не показані. Кореневий `GET /` у `server.js` до каталогу не входить.

## Підсумок

| Показник | Значення |
|---|---|
| Ендпоінтів усього | 142 (141 підключено в `server.js`, 1 у непідключеному файлі) |
| Файлів маршрутів | 22 |
| Доступ: public | 32 |
| Доступ: token | 85 |
| Доступ: admin / moderator | 21 |
| Доступ: лише головний admin | 4 |
| Контролерів | 21 |
| Контролерів із прямими SQL-запитами | 14 з 21 |
| Прямих SQL-викликів у контролерах | 196 |
| Контролерів без жодної моделі | 6 (`delivery`, `media`, `order`, `report`, `team`, `transaction`) |

## Файли маршрутів

| Файл | Префікс | Ендпоінтів | public | token | admin / moderator | лише головний admin |
|---|---|---|---|---|---|---|
| `adminRoutes.js` | `/api/admin` | 24 | 0 | 0 | 20 | 4 |
| `authRoutes.js` | `/api/auth` | 13 | 11 | 2 | 0 | 0 |
| `categoryRoutes.js` | `/api/categories` | 4 | 1 | 3 | 0 | 0 |
| `deliveryRoutes.js` | `/api/delivery` | 2 | 2 | 0 | 0 | 0 |
| `favoriteRoutes.js` | `/api/favorites` | 4 | 0 | 4 | 0 | 0 |
| `formRoutes.js` | `/api/form` | 5 | 0 | 5 | 0 | 0 |
| `mediaRoutes.js` | `/api/media` | 5 | 0 | 5 | 0 | 0 |
| `orderRoutes.js` | `/api/orders` | 7 | 1 | 6 | 0 | 0 |
| `pageRoutes.js` | `/api/pages` | 5 | 0 | 5 | 0 | 0 |
| `productRoutes.js` | `/api/products` | 13 | 4 | 9 | 0 | 0 |
| `publicFormRoutes.js` | `/api/public/form` | 1 | 1 | 0 | 0 | 0 |
| `reportRoutes.js` | `/api/reports` | 1 | 1 | 0 | 0 | 0 |
| `savedBlockRoutes.js` | `/api/saved-blocks` | 4 | 0 | 4 | 0 | 0 |
| `settingsRoutes.js` | `не підключено` | 1 | 0 | 1 | 0 | 0 |
| `siteRoutes.js` | `/api/sites` | 17 | 6 | 11 | 0 | 0 |
| `supportRoutes.js` | `/api/support` | 6 | 0 | 5 | 1 | 0 |
| `tagRoutes.js` | `/api/tags` | 2 | 2 | 0 | 0 | 0 |
| `teamRoutes.js` | `/api/team` | 11 | 0 | 11 | 0 | 0 |
| `transactionRoutes.js` | `/api/transactions` | 3 | 1 | 2 | 0 | 0 |
| `uploadRoutes.js` | `/api/upload` | 1 | 0 | 1 | 0 | 0 |
| `userRoutes.js` | `/api/users` | 9 | 2 | 7 | 0 | 0 |
| `userTemplateRoutes.js` | `/api/user-templates` | 4 | 0 | 4 | 0 | 0 |

## Ендпоінти

### `adminRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/admin/dashboard-stats` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getDashboardStats` |
| GET | `/api/admin/logs` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getAdminLogs` |
| GET | `/api/admin/control/settings` | лише головний admin | `verifyToken`, `verifyAdmin`, `verifyStrictAdmin` | `adminController.getSystemSettings` |
| PUT | `/api/admin/control/settings` | лише головний admin | `verifyToken`, `verifyAdmin`, `verifyStrictAdmin` | `adminController.updateSystemSettings` |
| GET | `/api/admin/users` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getAllUsers` |
| POST | `/api/admin/users/:id/suspend` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.suspendUserAccount` |
| POST | `/api/admin/users/:id/restore` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.restoreUserAccount` |
| DELETE | `/api/admin/users/:id` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.deleteUser` |
| GET | `/api/admin/sites` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getAllSites` |
| DELETE | `/api/admin/sites/:site_path` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.deleteSiteByAdmin` |
| POST | `/api/admin/sites/:site_path/suspend` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.suspendSite` |
| POST | `/api/admin/sites/:site_path/restore` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.restoreSite` |
| POST | `/api/admin/sites/:site_path/probation` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.setProbation` |
| GET | `/api/admin/reports` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getReports` |
| PUT | `/api/admin/reports/:id/dismiss` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.dismissReport` |
| PUT | `/api/admin/reports/:id/reopen` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.reopenReport` |
| POST | `/api/admin/reports/:id/ban` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.banSiteFromReport` |
| GET | `/api/admin/templates` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.getSystemTemplates` |
| POST | `/api/admin/templates` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.createSystemTemplate` |
| PUT | `/api/admin/templates/:id` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.updateSystemTemplate` |
| DELETE | `/api/admin/templates/:id` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.deleteSystemTemplate` |
| POST | `/api/admin/templates/:id/copy` | admin / moderator | `verifyToken`, `verifyAdmin` | `adminController.copyTemplate` |
| GET | `/api/admin/transactions` | лише головний admin | `verifyToken`, `verifyAdmin`, `verifyStrictAdmin` | `transactionController.getAdminTransactions` |
| GET | `/api/admin/orders` | лише головний admin | `verifyToken`, `verifyAdmin`, `verifyStrictAdmin` | `transactionController.getAdminOrders` |

### `authRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/auth/register` | public | `registerLimiter`, `upload.single('avatar')`, `verifyTurnstile`, `processAndSaveImage('avatars/custom', 'avatar', 128)` | `authController.register` |
| POST | `/api/auth/login` | public | `loginLimiter`, `verifyTurnstile` | `authController.login` |
| POST | `/api/auth/admin/login` | public | `adminLoginLimiter`, `verifyTurnstile` | `authController.adminLogin` |
| POST | `/api/auth/verify-2fa` | public | `verify2FALimiter` | `authController.verify2FA` |
| POST | `/api/auth/verify-email` | public | `verify2FALimiter` | `authController.verifyEmail` |
| POST | `/api/auth/resend-otp` | public | `otpResendLimiter` | `authController.resendOtp` |
| POST | `/api/auth/forgot-password` | public | `forgotPasswordLimiter`, `verifyTurnstile` | `authController.forgotPassword` |
| POST | `/api/auth/verify-reset-code` | public | `verify2FALimiter` | `authController.verifyResetCode` |
| POST | `/api/auth/reset-password` | public | `forgotPasswordLimiter` | `authController.resetPassword` |
| GET | `/api/auth/google` | public | — | `passport.authenticate('google', { scope: ['profile', 'email'] })` |
| GET | `/api/auth/google/callback` | public | `passport.authenticate('google', { session: false, failureRedirect: `${clientUrl}/login?error=google_auth_failed` })` | `authController.googleCallback` |
| GET | `/api/auth/me` | token | `verifyToken` | `authController.getMe` |
| POST | `/api/auth/refresh` | token | `verifyToken` | `authController.refreshToken` |

### `categoryRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/categories/site/:siteId` | public | — | `categoryController.getCategoriesForSite` |
| POST | `/api/categories` | token | `verifyToken` | `categoryController.createCategory` |
| PUT | `/api/categories/:categoryId` | token | `verifyToken` | `categoryController.updateCategory` |
| DELETE | `/api/categories/:categoryId` | token | `verifyToken` | `categoryController.deleteCategory` |

### `deliveryRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/delivery/cities` | public | — | `deliveryController.getCities` |
| GET | `/api/delivery/warehouses` | public | — | `deliveryController.getWarehouses` |

### `favoriteRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/favorites` | token | `verifyToken` | `favoriteController.getFavorites` |
| GET | `/api/favorites/ids` | token | `verifyToken` | `favoriteController.getFavoriteIds` |
| POST | `/api/favorites/:siteId` | token | `verifyToken` | `favoriteController.addFavorite` |
| DELETE | `/api/favorites/:siteId` | token | `verifyToken` | `favoriteController.removeFavorite` |

### `formRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/form/:siteId` | token | `verifyToken` | `formController.getSubmissions` |
| PUT | `/api/form/:siteId/:submissionId/read` | token | `verifyToken` | `formController.markSubmissionRead` |
| PATCH | `/api/form/:siteId/:submissionId/status` | token | `verifyToken` | `formController.updateStatus` |
| PATCH | `/api/form/:siteId/:submissionId/pin` | token | `verifyToken` | `formController.toggleSubmissionPin` |
| DELETE | `/api/form/:siteId/:submissionId` | token | `verifyToken` | `formController.deleteSubmission` |

### `mediaRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/media` | token | `verifyToken` | `mediaController.getAll` |
| GET | `/api/media/limits` | token | `verifyToken` | `mediaController.getMediaLimitsStatus` |
| POST | `/api/media/upload` | token | `verifyToken`, `mediaUpload.single('mediaFile')` | `mediaController.upload` |
| PUT | `/api/media/:id` | token | `verifyToken` | `mediaController.updateMedia` |
| DELETE | `/api/media/:id` | token | `verifyToken` | `mediaController.deleteMedia` |

### `orderRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/orders/checkout` | token | `verifyToken` | `orderController.processCheckout` |
| POST | `/api/orders/liqpay-callback` | public | — | `orderController.liqpayCallback` |
| POST | `/api/orders/:id/pay` | token | `verifyToken` | `orderController.generatePaymentForOrder` |
| POST | `/api/orders/:orderId/pay/gpay` | token | `verifyToken` | `orderController.processGooglePay` |
| GET | `/api/orders/my` | token | `verifyToken` | `orderController.getMyOrders` |
| GET | `/api/orders/site/:siteId` | token | `verifyToken` | `orderController.getSiteOrders` |
| PUT | `/api/orders/:id/status` | token | `verifyToken` | `orderController.updateOrderStatus` |

### `pageRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/pages/:pageId` | token | `verifyToken` | `pageController.getPageById` |
| PUT | `/api/pages/:pageId/content` | token | `verifyToken` | `pageController.updatePageContent` |
| PUT | `/api/pages/:pageId/settings` | token | `verifyToken` | `pageController.updatePageSettings` |
| DELETE | `/api/pages/:pageId` | token | `verifyToken` | `pageController.deletePage` |
| POST | `/api/pages/:pageId/set-home` | token | `verifyToken` | `pageController.setHomePage` |

### `productRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/products` | public | — | `productController.getProducts` |
| GET | `/api/products/site/:siteId` | public | — | `productController.getProductsForSite` |
| GET | `/api/products/:productId` | public | — | `productController.getProductById` |
| GET | `/api/products/:productId/reviews` | public | — | `productController.getProductReviews` |
| GET | `/api/products/:productId/purchase-status` | token | `verifyToken` | `productController.checkPurchaseStatus` |
| POST | `/api/products/:productId/reviews` | token | `verifyToken` | `productController.addProductReview` |
| PUT | `/api/products/:productId/reviews/:reviewId/reply` | token | `verifyToken` | `productController.replyToReview` |
| DELETE | `/api/products/:productId/reviews/:reviewId` | token | `verifyToken` | `productController.deleteReview` |
| POST | `/api/products` | token | `verifyToken` | `productController.addProduct` |
| PUT | `/api/products/:productId` | token | `verifyToken` | `productController.updateProduct` |
| DELETE | `/api/products/:productId` | token | `verifyToken` | `productController.deleteProduct` |
| POST | `/api/products/:productId/gallery` | token | `verifyToken`, `upload.single('galleryImage')`, `processAndSaveImage('shops/products/gallery', 'gallery', 500)` | `productController.addToGallery` |
| DELETE | `/api/products/:productId/gallery` | token | `verifyToken` | `productController.removeFromGallery` |

### `publicFormRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/public/form/:siteId/submit` | public | — | `formController.submitForm` |

### `reportRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/reports` | public | — | `reportController.createReport` |

### `savedBlockRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/saved-blocks` | token | `verifyToken` | `savedBlockController.getSavedBlocks` |
| POST | `/api/saved-blocks` | token | `verifyToken` | `savedBlockController.saveBlock` |
| PUT | `/api/saved-blocks/:id` | token | `verifyToken` | `savedBlockController.updateSavedBlock` |
| DELETE | `/api/saved-blocks/:id` | token | `verifyToken` | `savedBlockController.deleteSavedBlock` |

### `settingsRoutes.js` (не підключено в `server.js`)

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| PUT | `/platform-theme` | token | `verifyToken` | `settingsController.updatePlatformTheme` |

### `siteRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/sites/check-slug` | token | `verifyToken` | `siteController.checkSlug` |
| GET | `/api/sites/templates` | public | — | `siteController.getTemplates` |
| GET | `/api/sites/catalog` | public | — | `siteController.getSites` |
| GET | `/api/sites/default-logos` | public | — | `siteController.getDefaultLogos` |
| GET | `/api/sites/my-suspended` | token | `verifyToken` | `siteController.getMySuspendedSites` |
| GET | `/api/sites/info/:id` | public | — | `siteController.getSiteInfoById` |
| GET | `/api/sites/:id/analytics` | token | `verifyToken` | `siteController.getSiteAnalytics` |
| POST | `/api/sites/create` | token | `verifyToken`, `upload.single('logo')`, `processAndSaveLogo(64)` | `siteController.createSite` |
| PUT | `/api/sites/:siteId/reset-template` | token | `verifyToken` | `siteController.resetSiteToTemplate` |
| PATCH | `/api/sites/:siteId/pin` | token | `verifyToken` | `siteController.toggleSitePin` |
| GET | `/api/sites/:siteId/pages` | token | `verifyToken` | `pageController.getPagesForSite` |
| POST | `/api/sites/:siteId/pages` | token | `verifyToken` | `pageController.createPage` |
| PUT | `/api/sites/:site_path/rename` | token | `verifyToken` | `siteController.renameSite` |
| PUT | `/api/sites/:site_path/settings` | token | `verifyToken` | `siteController.updateSiteSettings` |
| DELETE | `/api/sites/:site_path` | token | `verifyToken` | `siteController.deleteSite` |
| GET | `/api/sites/:site_path` | public | `trackVisit` | `siteController.getSiteByPath` |
| GET | `/api/sites/:site_path/:slug` | public | `trackVisit` | `siteController.getSiteByPath` |

### `supportRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/support` | token | `verifyToken`, `ticketUpload.array('attachments', 5)`, `processAndSaveTicketImages` | `supportController.createTicket` |
| GET | `/api/support/my-tickets` | token | `verifyToken` | `supportController.getUserTickets` |
| GET | `/api/support/:ticketId` | token | `verifyToken` | `supportController.getTicketById` |
| POST | `/api/support/:ticketId/reply` | token | `verifyToken`, `ticketUpload.array('attachments', 5)`, `processAndSaveTicketImages` | `supportController.addReply` |
| GET | `/api/support/admin/tickets` | admin / moderator | `verifyToken`, `verifyAdmin` | `supportController.getAdminTickets` |
| PUT | `/api/support/:ticketId/status` | token | `verifyToken` | `supportController.updateTicketStatus` |

### `tagRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/tags` | public | — | `tagController.getAllTags` |
| GET | `/api/tags/site/:siteId` | public | — | `tagController.getTagsForSite` |

### `teamRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/team/:id/lock` | token | `verifyToken` | `teamController.heartbeat` |
| POST | `/api/team/:id/unlock` | token | `verifyToken` | `teamController.releaseLock` |
| POST | `/api/team/:id/invite` | token | `verifyToken` | `teamController.generateInvite` |
| GET | `/api/team/:id/invite` | token | `verifyToken` | `teamController.getActiveInvite` |
| DELETE | `/api/team/:id/invite` | token | `verifyToken` | `teamController.deleteInvite` |
| POST | `/api/team/invite/accept` | token | `verifyToken` | `teamController.acceptInvite` |
| GET | `/api/team/:id/collaborators` | token | `verifyToken` | `teamController.getCollaborators` |
| DELETE | `/api/team/:id/collaborators/:userId` | token | `verifyToken` | `teamController.removeCollaborator` |
| POST | `/api/team/:id/transfer/verify` | token | `verifyToken` | `teamController.verifyTransfer` |
| POST | `/api/team/:id/transfer` | token | `verifyToken` | `teamController.transferSite` |
| PUT | `/api/team/:id/collaborators/:userId/permissions` | token | `verifyToken` | `teamController.updatePermissions` |

### `transactionRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/transactions/upgrade` | token | `verifyToken` | `transactionController.processUpgrade` |
| POST | `/api/transactions/upgrade/gpay` | token | `verifyToken` | `transactionController.processGooglePayUpgrade` |
| POST | `/api/transactions/liqpay-callback` | public | — | `transactionController.liqpayWebhook` |

### `uploadRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/upload` | token | `verifyToken`, `upload.single('image')`, `processAndSaveGeneric('media', 'user-img', 1200)` | `uploadController.uploadGenericImage` |

### `userRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| GET | `/api/users/default-avatars` | public | — | `userController.getDefaultAvatars` |
| GET | `/api/users/:username` | public | — | `userController.getPublicProfile` |
| PUT | `/api/users/profile` | token | `verifyToken` | `userController.updateProfile` |
| PUT | `/api/users/profile/password` | token | `verifyToken`, `passwordChangeLimiter` | `userController.changePassword` |
| PUT | `/api/users/profile/avatar-url` | token | `verifyToken` | `userController.updateAvatarUrl` |
| DELETE | `/api/users/profile/avatar` | token | `verifyToken` | `userController.deleteAvatar` |
| POST | `/api/users/profile/avatar` | token | `verifyToken`, `upload.single('avatar')`, `processAndSaveImage('avatars/custom', 'user', 500)` | `userController.uploadAvatar` |
| DELETE | `/api/users/me` | token | `verifyToken` | `userController.deleteAccount` |
| POST | `/api/users/me/restore` | token | `verifyToken` | `userController.restoreAccount` |

### `userTemplateRoutes.js`

| Метод | Шлях | Доступ | Middleware | Обробник |
|---|---|---|---|---|
| POST | `/api/user-templates` | token | `verifyToken` | `userTemplateController.saveAsTemplate` |
| PUT | `/api/user-templates/:id` | token | `verifyToken` | `userTemplateController.updateTemplate` |
| GET | `/api/user-templates` | token | `verifyToken` | `userTemplateController.getMyTemplates` |
| DELETE | `/api/user-templates/:id` | token | `verifyToken` | `userTemplateController.deleteTemplate` |

## Контролери й прямий SQL

Лічильник: виклики `db.query(` та `connection.query(` у `backend/controllers/*.js`. «Модель» — чи підключає контролер хоча б один файл із `models/`.

| Контролер | SQL-викликів | Модель |
|---|---|---|
| `adminController` | 43 | так |
| `teamController` | 30 | ні |
| `orderController` | 29 | ні |
| `siteController` | 28 | так |
| `authController` | 14 | так |
| `transactionController` | 14 | ні |
| `mediaController` | 10 | ні |
| `pageController` | 6 | так |
| `userController` | 6 | так |
| `userTemplateController` | 5 | так |
| `formController` | 3 | так |
| `productController` | 3 | так |
| `supportController` | 3 | так |
| `reportController` | 2 | ні |
| `categoryController` | 0 | так |
| `deliveryController` | 0 | ні |
| `favoriteController` | 0 | так |
| `savedBlockController` | 0 | так |
| `settingsController` | 0 | так |
| `tagController` | 0 | так |
| `uploadController` | 0 | так |
