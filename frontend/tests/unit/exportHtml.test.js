// frontend/tests/unit/exportHtml.test.js
// Допоміжні функції експорту, що підставляють значення в HTML: escapeHTML, transformLink, cssNumber (D-SEC-27).
import { describe, it, expect } from 'vitest';
import { escapeHTML, transformLink, cssNumber, getPaddingStyle, renderButtonHTML } from '../../src/shared/utils/exportHtml';

describe('escapeHTML', () => {
    it.each([
        ['&', '&amp;'],
        ['<', '&lt;'],
        ['>', '&gt;'],
        ['"', '&quot;'],
        ["'", '&#39;'],
    ])('символ %s → %s', (input, expected) => {
        expect(escapeHTML(input)).toBe(expected);
    });

    it('екранує кожне входження, а вже екрановане екранує повторно (& → &amp;)', () => {
        expect(escapeHTML('<a href="x">T&C</a>')).toBe('&lt;a href=&quot;x&quot;&gt;T&amp;C&lt;/a&gt;');
        expect(escapeHTML('&amp;')).toBe('&amp;amp;');
    });

    it('текст без службових символів не змінюється', () => {
        expect(escapeHTML('Кава з молоком, 100% гарантія')).toBe('Кава з молоком, 100% гарантія');
    });

    it.each([[undefined], [null], [42], [true]])('не рядок %j повертається як є', (value) => {
        expect(escapeHTML(value)).toBe(value);
    });
});

describe('transformLink', () => {
    it.each([
        ['/', 'index.html'],
        ['about', 'about.html'],
        ['/page/contacts', 'contacts.html'],
        ['/about?x=1', 'about.html'],
        ['https://example.com/a', 'https://example.com/a'],
        ['mailto:a@b.c', 'mailto:a@b.c'],
        ['tel:+380501234567', 'tel:+380501234567'],
        ['#top', '#top'],
    ])('%s → %s', (input, expected) => {
        expect(transformLink(input)).toBe(expected);
    });

    it.each([['javascript:alert(1)'], ['  JavaScript:alert(1)'], ['data:text/html,<b>'], ['vbscript:x'], [undefined], [null], [''], [42]])('небезпечне або порожнє значення %j → #', (input) => {
        expect(transformLink(input)).toBe('#');
    });

    it('D-SEC-27: результат екранований для підстановки в href="..."', () => {
        expect(transformLink('https://example.com/" onmouseover="alert(1)')).toBe('https://example.com/&quot; onmouseover=&quot;alert(1)');
        expect(transformLink('https://example.com/?a=1&b=2')).toBe('https://example.com/?a=1&amp;b=2');
        expect(transformLink('#a"b')).toBe('#a&quot;b');
    });

    it('відносне посилання з лапкою: лапка екранується після додавання .html', () => {
        expect(transformLink('a"b')).toBe('a&quot;b.html');
    });
});

describe('cssNumber', () => {
    it.each([[0, 0], [12, 12], [-3, -3], [0.5, 0.5], ['12', 12], [' 7 ', 7], ['0.3', 0.3], ['0', 0]])('%j → %j', (input, expected) => {
        expect(cssNumber(input, 99)).toBe(expected);
    });

    it.each([[NaN], [Infinity], [-Infinity], [''], ['  '], ['abc'], ['12px'], ['1;" x="y'], [null], [undefined], [true], [[]], [{}], [[5]]])('%j → запасне значення', (input) => {
        expect(cssNumber(input, 99)).toBe(99);
    });
});

describe('getPaddingStyle', () => {
    it('значення за замовчуванням — 40px', () => {
        expect(getPaddingStyle({})).toBe('padding-top: 40px; padding-bottom: 40px;');
    });

    it('styles.paddingTop / paddingBottom мають пріоритет, у тому числі нуль', () => {
        expect(getPaddingStyle({ styles: { paddingTop: 10, paddingBottom: 0 } })).toBe('padding-top: 10px; padding-bottom: 0px;');
    });

    it('застарілий рядок padding читається через parseInt', () => {
        expect(getPaddingStyle({ padding: '24px' })).toBe('padding-top: 24px; padding-bottom: 24px;');
    });

    it('D-SEC-27: нечислові значення замінюються на 40', () => {
        expect(getPaddingStyle({ styles: { paddingTop: '1;" x="y', paddingBottom: null } })).toBe('padding-top: 40px; padding-bottom: 40px;');
        expect(getPaddingStyle({ padding: 'abc' })).toBe('padding-top: 40px; padding-bottom: 40px;');
    });
});

describe('renderButtonHTML', () => {
    it('без посилання — <button>, з посиланням — <a> з екранованим href', () => {
        expect(renderButtonHTML({ text: 'B' })).toContain('<button type="button"');
        expect(renderButtonHTML({ text: 'B', link: '/a?x=1&y=2' })).toContain('<a href="a.html"');
    });

    it('D-SEC-27: текст і радіус не виходять за межі розмітки', () => {
        const html = renderButtonHTML({ text: '<b>B</b>', link: '/a', borderRadius: '1;" onmouseover="x' });
        expect(html).toContain('<span>&lt;b&gt;B&lt;/b&gt;</span>');
        expect(html).toContain('border-radius: 4px;');
        expect(html).not.toContain('onmouseover');
    });

    it('радіус із числа або рядка з числом береться як є', () => {
        expect(renderButtonHTML({ text: 'B', borderRadius: 10 })).toContain('border-radius: 10px;');
        expect(renderButtonHTML({ text: 'B', borderRadius: '8' })).toContain('border-radius: 8px;');
        expect(renderButtonHTML({ text: 'B' })).toContain('border-radius: 4px;');
    });
});
