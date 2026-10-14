import { describe, it, expect } from 'vitest';
import { analyzePassword, validateSiteSlug, validateSiteTitle } from '../../src/shared/utils/validationUtils';

describe('validationUtils', () => {
    describe('analyzePassword', () => {
        it('повертає помилку для порожнього пароля', () => {
            const result = analyzePassword('');
            expect(result.isValid).toBe(false);
            expect(result.score).toBe(0);
        });
        it('визначає сильний і правильний пароль', () => {
            const result = analyzePassword('StrongPass123');
            expect(result.isValid).toBe(true);
            expect(result.score).toBe(4);
            expect(result.checks.isLongEnough).toBe(true);
            expect(result.checks.hasCapital).toBe(true);
        });
        it('провалює тест, якщо пароль містить заборонену послідовність', () => {
            const result = analyzePassword('Qwerty123456');
            expect(result.isValid).toBe(false);
            expect(result.isSimple).toBe(true);
        });
    });

    describe('validateSiteSlug', () => {
        it('пропускає валідний slug', () => {
            const result = validateSiteSlug('my-cool-store');
            expect(result.isValid).toBe(true);
            expect(result.status).toBe('checking');
            expect(result.error).toBeNull();
        });
        it('відхиляє занадто короткий slug', () => {
            const result = validateSiteSlug('ab');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Мінімум 3 символи');
        });
        it('межа довжини збігається з полем вводу й сервером: 30 символів (D-BIZ-05)', () => {
            expect(validateSiteSlug('abcdefghij'.repeat(3)).isValid).toBe(true);
            const tooLong = validateSiteSlug('abcdefghij'.repeat(3) + 'k');
            expect(tooLong.isValid).toBe(false);
            expect(tooLong.status).toBe('invalid');
            expect(tooLong.error).toBe('Максимум 30 символів');
        });
        it('адреса з 40 символів, яку раніше пропускала клієнтська перевірка, тепер відхиляється', () => {
            expect(validateSiteSlug('ab'.repeat(20)).isValid).toBe(false);
        });
        it('відхиляє зарезервовані імена', () => {
            const result = validateSiteSlug('admin');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('зарезервовано');
        });
        it('відхиляє slug, що починається з дефіса', () => {
            const result = validateSiteSlug('-mysite');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Не може починатися або закінчуватися дефісом');
        });
    });

    describe('validateSiteTitle', () => {
        it('повертає назву без помилок, якщо вона валідна', () => {
            const result = validateSiteTitle('Мій Супер Магазин');
            expect(result.val).toBe('Мій Супер Магазин');
            expect(result.error).toBeNull();
        });
        it('вирізає небезпечні символи < та > і повертає помилку', () => {
            const result = validateSiteTitle('<script>Hello</script>');
            expect(result.val).toBe('scriptHello/script');
            expect(result.error).toContain('заборонені');
        });
    });
});