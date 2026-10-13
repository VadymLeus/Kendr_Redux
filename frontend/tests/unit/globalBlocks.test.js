// frontend/tests/unit/globalBlocks.test.js
import { describe, it, expect, vi } from 'vitest';
import {
    parseGlobalContent,
    resolveGlobalData,
    normalizeGlobalBlocks,
    mergeGlobalBlocks,
} from '../../src/modules/editor/core/globalBlocks';
import { getDefaultBlockData } from '../../src/modules/editor/core/blockRegistry';

const HEADER = { logo_src: '/h.png', site_title: 'Шапка', nav_items: [{ id: 'n1', label: 'Дім', link: '/' }] };
const FOOTER = { variant: 'standard', copyright: 'Підвал' };
const keysOf = (value) => Object.keys(value).sort();

describe('parseGlobalContent', () => {
    it('рядок із JSON розбирається, порожній рядок дає порожній об\'єкт', () => {
        expect(parseGlobalContent('{"a":1}')).toEqual({ a: 1 });
        expect(parseGlobalContent('')).toEqual({});
    });

    it('об\'єкт повертається як є, відсутнє значення дає порожній об\'єкт', () => {
        expect(parseGlobalContent(HEADER)).toBe(HEADER);
        expect(parseGlobalContent(null)).toEqual({});
        expect(parseGlobalContent(undefined)).toEqual({});
    });

    it('некоректний JSON викликає виняток', () => {
        expect(() => parseGlobalContent('{oops')).toThrow(SyntaxError);
    });
});

describe('resolveGlobalData', () => {
    it('непорожні дані повертаються без копіювання', () => {
        expect(resolveGlobalData(HEADER, 'global-header')).toBe(HEADER);
        expect(resolveGlobalData(JSON.stringify(FOOTER), 'global-footer')).toEqual(FOOTER);
    });

    it.each([[null], [undefined], [''], ['{}'], [{}]])('порожнє значення %j замінюється даними за замовчуванням', (raw) => {
        expect(keysOf(resolveGlobalData(raw, 'global-header'))).toEqual(keysOf(getDefaultBlockData('global-header')));
        expect(keysOf(resolveGlobalData(raw, 'global-footer'))).toEqual(keysOf(getDefaultBlockData('global-footer')));
    });
});

describe('normalizeGlobalBlocks', () => {
    const site = { header_content: HEADER, footer_content: JSON.stringify(FOOTER) };

    it.each(['header', 'global-header'])('"%s" стає global-header з даними сайту', (type) => {
        const [result] = normalizeGlobalBlocks([{ type, block_id: 'b1', name: 'Шапка', data: { stale: true } }], site);
        expect(result).toEqual({ type: 'global-header', block_id: 'b1', name: 'Шапка', data: HEADER });
    });

    it.each(['footer', 'global-footer'])('"%s" стає global-footer з даними сайту', (type) => {
        const [result] = normalizeGlobalBlocks([{ type, block_id: 'b2', data: {} }], site);
        expect(result).toEqual({ type: 'global-footer', block_id: 'b2', data: FOOTER });
    });

    it('інші блоки повертаються тим самим об\'єктом, порядок зберігається', () => {
        const text = { type: 'text', block_id: 't', data: { value: 'a' } };
        const hero = { type: 'hero', block_id: 'h', data: {} };
        const result = normalizeGlobalBlocks([text, { type: 'header', block_id: 'x', data: {} }, hero], site);
        expect(result.map((b) => b.type)).toEqual(['text', 'global-header', 'hero']);
        expect(result[0]).toBe(text);
        expect(result[2]).toBe(hero);
    });

    it('порожні дані сайту замінюються значеннями за замовчуванням', () => {
        const [header, footer] = normalizeGlobalBlocks(
            [{ type: 'header', data: {} }, { type: 'footer', data: {} }],
            { header_content: '', footer_content: null }
        );
        expect(keysOf(header.data)).toEqual(keysOf(getDefaultBlockData('global-header')));
        expect(keysOf(footer.data)).toEqual(keysOf(getDefaultBlockData('global-footer')));
    });

    it('вхідний масив і блоки не змінюються', () => {
        const input = [{ type: 'header', block_id: 'b', data: { keep: 1 } }];
        const snapshot = JSON.stringify(input);
        normalizeGlobalBlocks(input, site);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('некоректний JSON у даних сайту викликає виняток', () => {
        expect(() => normalizeGlobalBlocks([{ type: 'header', data: {} }], { header_content: '{oops' })).toThrow(SyntaxError);
    });

    it('сайт без шапки в даних, але блок без глобальних типів, винятків не викликає', () => {
        const text = { type: 'text', data: {} };
        expect(normalizeGlobalBlocks([text], {})).toEqual([text]);
    });
});

describe('mergeGlobalBlocks', () => {
    it('не масив дає порожній масив', () => {
        expect(mergeGlobalBlocks(null, {})).toEqual([]);
        expect(mergeGlobalBlocks('x', {})).toEqual([]);
    });

    it('інші блоки лишаються без змін', () => {
        const text = { type: 'text', data: {} };
        expect(mergeGlobalBlocks([text], { header_content: HEADER })[0]).toBe(text);
    });

    it('дані сайту (об\'єкт) накладаються поверх даних блока', () => {
        const [result] = mergeGlobalBlocks(
            [{ type: 'header', block_id: 'b', data: { site_title: 'Свій', show_title: true } }],
            { header_content: { site_title: 'Сайтовий', nav_items: [{ id: '1', label: 'A', link: '/' }] } }
        );
        expect(result.type).toBe('global-header');
        expect(result.block_id).toBe('b');
        expect(result.data).toEqual({ site_title: 'Сайтовий', show_title: true, nav_items: [{ id: '1', label: 'A', link: '/' }] });
    });

    it('рядок із JSON розбирається так само', () => {
        const [result] = mergeGlobalBlocks(
            [{ type: 'global-footer', data: { a: 1 } }],
            { footer_content: JSON.stringify({ copyright: 'С' }) }
        );
        expect(result.data).toEqual({ a: 1, copyright: 'С' });
    });

    it('масив блоків: беруться дані першого блока потрібного виду (header або global-header)', () => {
        const content = [
            { type: 'text', data: { x: 0 } },
            { type: 'global-header', data: { site_title: 'Перший' } },
            { type: 'header', data: { site_title: 'Другий' } },
        ];
        const [result] = mergeGlobalBlocks([{ type: 'header', data: { nav_items: [{ id: '1' }] } }], { header_content: content });
        expect(result.data.site_title).toBe('Перший');
    });

    it('масив без блока потрібного виду дає дані блока без змін', () => {
        const [result] = mergeGlobalBlocks(
            [{ type: 'footer', data: { copyright: 'К' } }],
            { footer_content: [{ type: 'header', data: { site_title: 'Не те' } }] }
        );
        expect(result.data).toEqual({ copyright: 'К' });
    });

    it('об\'єкт із ключем "0": дані з "0" і кореневі властивості без "0", type і block_id', () => {
        const [result] = mergeGlobalBlocks(
            [{ type: 'header', data: { nav_items: [{ id: '1' }] } }],
            { header_content: { 0: { data: { site_title: 'З нуля' } }, type: 'header', block_id: 'z', logo_src: '/l.png' } }
        );
        expect(result.data).toEqual({ nav_items: [{ id: '1' }], site_title: 'З нуля', logo_src: '/l.png' });
    });

    it('некоректний JSON не ламає блок: помилка пишеться в консоль, дані блока лишаються', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const [header, footer] = mergeGlobalBlocks(
            [{ type: 'header', data: { site_title: 'А', nav_items: [{ id: '1' }] } }, { type: 'footer', data: { copyright: 'Б' } }],
            { header_content: '{oops', footer_content: '{oops' }
        );
        expect(header.data).toEqual({ site_title: 'А', nav_items: [{ id: '1' }] });
        expect(footer.data).toEqual({ copyright: 'Б' });
        expect(error).toHaveBeenCalledWith('Header parse error', expect.any(SyntaxError));
        expect(error).toHaveBeenCalledWith('Footer parse error', expect.any(SyntaxError));
        error.mockRestore();
    });

    it('шапка: порожні nav_items і відсутній site_title добираються з даних за замовчуванням', () => {
        const defaults = getDefaultBlockData('global-header');
        const [result] = mergeGlobalBlocks([{ type: 'header', data: { nav_items: [], logo_src: '/x.png' } }], {});
        expect(result.data.logo_src).toBe('/x.png');
        expect(result.data.site_title).toBe(defaults.site_title);
        expect(result.data.nav_items).toHaveLength(defaults.nav_items.length);
    });

    it('шапка: порожній рядок site_title лишається порожнім (замінюється лише undefined)', () => {
        const [result] = mergeGlobalBlocks([{ type: 'header', data: { site_title: '', nav_items: [{ id: '1' }] } }], {});
        expect(result.data.site_title).toBe('');
    });

    it('шапка й підвал без жодних даних дістають значення за замовчуванням повністю', () => {
        const [header, footer] = mergeGlobalBlocks([{ type: 'header' }, { type: 'footer' }], {});
        expect(keysOf(header.data)).toEqual(keysOf(getDefaultBlockData('global-header')));
        expect(keysOf(footer.data)).toEqual(keysOf(getDefaultBlockData('global-footer')));
    });

    it('підвал із частковими даними не доповнюється значеннями за замовчуванням', () => {
        const [result] = mergeGlobalBlocks([{ type: 'footer', data: { copyright: 'К' } }], {});
        expect(result.data).toEqual({ copyright: 'К' });
    });
});
