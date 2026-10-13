// Характеризаційний тест v0: як експорт показує блоки, щойно додані з редактора (зі значеннями за замовчуванням).
// Фіксує розбіжності між редактором і експортом, які в реєстрі блоків (v1.0) зникнуть тільки за рішенням,
// ухваленим окремо: у v1.0 вивід лишається тим самим.
import { describe, it, expect } from 'vitest';
import { generateFullHTML } from '../../src/shared/utils/htmlGenerator';
import { BLOCK_LIBRARY, getDefaultBlockData } from '../../src/modules/editor/core/blockRegistry';
import { expectGolden } from '../helpers/golden';

const blockOf = (type, options) => ({ type, block_id: `default-${type}`, data: getDefaultBlockData(type, options) });
const bodyOf = (html) => html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('<script>'));
const squash = (text) => text.replace(/\s+/g, ' ').trim();
const exportOne = (type) => squash(bodyOf(generateFullHTML({ title: 'T' }, [blockOf(type)], 'P')));

describe('експорт блоків зі значеннями за замовчуванням', () => {
    const exportable = BLOCK_LIBRARY.map((b) => b.type).filter((t) => !t.startsWith('global-'));

    it('золотий файл: усі блоки каталогу в одній сторінці', () => {
        const blocks = [
            ...BLOCK_LIBRARY.map((b) => b.type).map((type) => blockOf(type)),
            blockOf('layout', { preset: '25-25-25-25', columns: 4 }),
        ];
        expectGolden(generateFullHTML({ title: 'Значення за замовчуванням' }, blocks, 'Блоки'), 'export/editor-defaults.html');
    });

    it('блоки без наповнення (зображення, мапа) в експорт не потрапляють', () => {
        expect(exportOne('image')).toBe('');
        expect(exportOne('map')).toBe('');
    });

    it('каталог, вітрина, форма й відео експортуються як статична розмітка', () => {
        expect(exportOne('catalog')).toContain('Dynamic catalog requires backend connection.');
        expect(exportOne('showcase')).toContain('height: 250px; background: #eee;');
        expect(exportOne('form')).toContain('<textarea');
        expect(exportOne('video')).not.toContain('<video');
    });

    it('особливість: блок "Переваги" зі стандартними даними містить "text-align: undefined"', () => {
        expect(exportOne('features')).toContain('text-align: undefined;');
    });

    it('особливість: текст зі стандартними даними експортується абзацем незалежно від поля style', () => {
        expect(exportOne('text')).toContain('<p style="font-size: 1rem; font-weight: 400;');
    });

    it('глобальні блоки (global-header, global-footer) в експорті порожні (D-BLK-06)', () => {
        expect(exportOne('global-header')).toBe('');
        expect(exportOne('global-footer')).toBe('');
    });

    it('усі решта типи каталогу, крім зображення й мапи, дають непорожній HTML', () => {
        const empty = exportable.filter((type) => exportOne(type) === '');
        expect(empty.sort()).toEqual(['image', 'map']);
    });
});
