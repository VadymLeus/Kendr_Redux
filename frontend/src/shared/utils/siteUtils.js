// frontend/src/shared/utils/siteUtils.js

/**
 * Скільки сайтів користувач створив сам. Каталог «мої сайти» (`scope=my`) повертає ще й сайти, де він співавтор,
 * а ліміт тарифу рахується лише за власними (сервер перевіряє його через `SiteRepository.countByOwner`).
 */
export const countOwnedSites = (sites, userId) => {
    if (!Array.isArray(sites) || userId === undefined || userId === null) return 0;
    return sites.filter(site => site && String(site.user_id) === String(userId)).length;
};

const isSameUser = (siteData, user) => Boolean(siteData && user) && String(siteData.user_id) === String(user.id);

const isStaffUser = (user) => user?.role === 'admin' || user?.role === 'moderator';

/**
 * Співавтор з роллю «глядач» лише переглядає сайт. Власник і персонал платформи ролі не мають, навіть якщо
 * запис співавтора існує. Сервер відхиляє запис такого користувача (403), інтерфейс його не пропонує.
 */
export const isViewerOnly = (siteData, user) =>
    Boolean(siteData && user) && siteData.my_role === 'viewer' && !isSameUser(siteData, user) && !isStaffUser(user);

/**
 * Шаблон із сайту зберігає власник (особистий) або персонал платформи (системний); співавтору сервер відмовляє
 * (403), тому розділ «Шаблони» в налаштуваннях сайту йому не показують.
 */
export const canSaveSiteTemplates = (siteData, user) => isSameUser(siteData, user) || (Boolean(siteData && user) && isStaffUser(user));
