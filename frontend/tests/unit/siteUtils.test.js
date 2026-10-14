// Тести допоміжних функцій інтерфейсу сайтів (крок 7.6b): лічильник «мої сайти» не враховує сайти, де користувач лише
// співавтор; «глядач» бачить дашборд лише для перегляду; розділ «Шаблони» показується власнику й персоналу.
import { describe, it, expect } from 'vitest';
import { countOwnedSites, isViewerOnly, canSaveSiteTemplates } from '../../src/shared/utils/siteUtils';

describe('countOwnedSites', () => {
    const catalog = [
        { id: 1, user_id: 5 },
        { id: 2, user_id: 5 },
        { id: 3, user_id: 9 },
    ];

    it('рахує лише сайти користувача, а не сайти, де він співавтор', () => {
        expect(countOwnedSites(catalog, 5)).toBe(2);
        expect(countOwnedSites(catalog, 9)).toBe(1);
    });

    it('користувач без власних сайтів (лише співавтор) отримує 0', () => {
        expect(countOwnedSites(catalog, 7)).toBe(0);
    });

    it('порівнює ідентифікатори як рядки: "5" і 5 — той самий користувач', () => {
        expect(countOwnedSites(catalog, '5')).toBe(2);
        expect(countOwnedSites([{ id: 1, user_id: '5' }], 5)).toBe(1);
    });

    it('не рахує сайти без user_id та порожні елементи', () => {
        expect(countOwnedSites([{ id: 1 }, null, undefined, { id: 2, user_id: 5 }], 5)).toBe(1);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['об\'єкт', { length: 3 }],
        ['рядок', 'abc'],
    ])('відповідь сервера «%s» замість масиву → 0', (_, value) => {
        expect(countOwnedSites(value, 5)).toBe(0);
    });

    it.each([['undefined', undefined], ['null', null]])('невідомий користувач (%s) → 0', (_, userId) => {
        expect(countOwnedSites(catalog, userId)).toBe(0);
    });
});

describe('isViewerOnly', () => {
    const site = { id: 1, user_id: 5, my_role: 'viewer' };

    it('співавтор з роллю viewer лише переглядає', () => {
        expect(isViewerOnly(site, { id: 7, role: 'user' })).toBe(true);
    });

    it.each([['editor'], [null], [undefined]])('роль %s не робить користувача глядачем', (role) => {
        expect(isViewerOnly({ ...site, my_role: role }, { id: 7, role: 'user' })).toBe(false);
    });

    it('власник не глядач, навіть якщо в сайті лишився запис ролі', () => {
        expect(isViewerOnly(site, { id: 5, role: 'user' })).toBe(false);
        expect(isViewerOnly(site, { id: '5', role: 'user' })).toBe(false);
    });

    it.each([['admin'], ['moderator']])('персонал платформи (%s) не глядач', (role) => {
        expect(isViewerOnly(site, { id: 7, role })).toBe(false);
    });

    it('без сайту або користувача — не глядач', () => {
        expect(isViewerOnly(null, { id: 7 })).toBe(false);
        expect(isViewerOnly(site, null)).toBe(false);
        expect(isViewerOnly(undefined, undefined)).toBe(false);
    });
});

describe('canSaveSiteTemplates', () => {
    const site = { id: 1, user_id: 5, my_role: 'editor' };

    it('власник може зберігати шаблони (id порівнюються як рядки)', () => {
        expect(canSaveSiteTemplates(site, { id: 5, role: 'user' })).toBe(true);
        expect(canSaveSiteTemplates(site, { id: '5', role: 'user' })).toBe(true);
    });

    it.each([['admin'], ['moderator']])('персонал платформи (%s) може зберігати шаблони', (role) => {
        expect(canSaveSiteTemplates(site, { id: 7, role })).toBe(true);
    });

    it.each([['editor'], ['viewer']])('співавтор (%s) не може: розділ «Шаблони» йому не показують', (role) => {
        expect(canSaveSiteTemplates({ ...site, my_role: role }, { id: 7, role: 'user' })).toBe(false);
    });

    it('без сайту або користувача — не може', () => {
        expect(canSaveSiteTemplates(null, { id: 5 })).toBe(false);
        expect(canSaveSiteTemplates(site, null)).toBe(false);
        expect(canSaveSiteTemplates(null, { id: 7, role: 'admin' })).toBe(false);
    });
});
