// Характеризаційні тести v0: фіксують поточну поведінку resolveSiteLink.
// Функція перетворює посилання з налаштувань блоків на адресу всередині публічного сайту (/site/<slug>/...).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveSiteLink } from '../../src/shared/utils/linkUtils';

describe('resolveSiteLink', () => {
    let warn;
    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('порожні та нерядкові значення', () => {
        it.each([
            ['undefined', undefined],
            ['null', null],
            ['порожній рядок', ''],
            ['число', 42],
            ['об\'єкт', { href: '/a' }],
        ])('%s -> "#"', (_, value) => {
            expect(resolveSiteLink(value, 'shop')).toBe('#');
        });
    });

    describe('небезпечні схеми', () => {
        it.each([
            'javascript:alert(1)',
            'JavaScript:alert(1)',
            '  javascript:alert(1)  ',
            'data:text/html;base64,PHNjcmlwdD4=',
            'vbscript:msgbox(1)',
        ])('блокує %s і повертає "#"', (link) => {
            expect(resolveSiteLink(link, 'shop')).toBe('#');
            expect(warn).toHaveBeenCalled();
        });

        it('нешкідливі посилання не викликають попередження', () => {
            resolveSiteLink('/about', 'shop');
            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe('посилання, що повертаються без змін (після trim)', () => {
        it.each([
            ['#contacts', '#contacts'],
            ['http://example.com/a', 'http://example.com/a'],
            ['https://example.com/a?x=1', 'https://example.com/a?x=1'],
            ['//cdn.example.com/lib.js', '//cdn.example.com/lib.js'],
            ['mailto:hello@example.com', 'mailto:hello@example.com'],
            ['tel:+380501234567', 'tel:+380501234567'],
            ['  https://example.com  ', 'https://example.com'],
            ['/site/other/page', '/site/other/page'],
        ])('%s -> %s', (link, expected) => {
            expect(resolveSiteLink(link, 'shop')).toBe(expected);
        });
    });

    describe('внутрішні сторінки сайту', () => {
        it('відносний шлях отримує префікс /site/<slug>/', () => {
            expect(resolveSiteLink('contacts', 'shop')).toBe('/site/shop/contacts');
        });
        it('початковий слеш прибирається', () => {
            expect(resolveSiteLink('/contacts', 'shop')).toBe('/site/shop/contacts');
        });
        it('корінь "/" веде на головну сторінку сайту', () => {
            expect(resolveSiteLink('/', 'shop')).toBe('/site/shop');
        });
        it('рядок із самих пробілів веде на головну сторінку сайту', () => {
            expect(resolveSiteLink('   ', 'shop')).toBe('/site/shop');
        });
        it('вкладений шлях зберігається', () => {
            expect(resolveSiteLink('/catalog/shoes', 'shop')).toBe('/site/shop/catalog/shoes');
        });
        it('пробіли навколо шляху обрізаються', () => {
            expect(resolveSiteLink('  /about  ', 'shop')).toBe('/site/shop/about');
        });
    });

    describe('особливості поточної реалізації', () => {
        it('схема в верхньому регістрі не розпізнається як зовнішня і стає частиною шляху', () => {
            expect(resolveSiteLink('HTTPS://example.com', 'shop')).toBe('/site/shop/HTTPS://example.com');
        });
        it('без sitePath у шлях потрапляє рядок "undefined"', () => {
            expect(resolveSiteLink('/about', undefined)).toBe('/site/undefined/about');
            expect(resolveSiteLink('/', undefined)).toBe('/site/undefined');
        });
    });
});
