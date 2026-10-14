// Характеризаційний тест: як експорт показує блоки, щойно додані з редактора (зі значеннями за замовчуванням).
// Фіксує розбіжності між редактором і експортом, які реєстр блоків (v1.0) не усував: у v1.0 вивід лишався тим самим,
// у v2.0 шапка й підвал потрапляють в експорт (D-BLK-06).
import { describe, it, expect } from 'vitest';
import { generateFullHTML } from '../../src/shared/utils/htmlGenerator';
import { BLOCK_LIBRARY, getDefaultBlockData } from '../../src/modules/editor/core/blockRegistry';
import { expectGolden } from '../helpers/golden';

const blockOf = (type, options) => ({ type, block_id: `default-${type}`, data: getDefaultBlockData(type, options) });
const bodyOf = (html) => html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('<script>'));
const squash = (text) => text.replace(/\s+/g, ' ').trim();
const exportOne = (type) => squash(bodyOf(generateFullHTML({ title: 'T' }, [blockOf(type)], 'P')));
// Рік у значенні за замовчуванням залежить від дати, тому в золотому файлі текст підвалу закріплено.
const PINNED_COPYRIGHT = '© 2026 Назва компанії';
const pinYear = (block) => (block.type === 'global-footer' ? { ...block, data: { ...block.data, copyright: PINNED_COPYRIGHT } } : block);

describe('експорт блоків зі значеннями за замовчуванням', () => {
    const exportable = BLOCK_LIBRARY.map((b) => b.type);

    it('золотий файл: усі блоки каталогу в одній сторінці', () => {
        const blocks = [
            ...BLOCK_LIBRARY.map((b) => b.type).map((type) => pinYear(blockOf(type))),
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

    it('глобальні блоки (global-header, global-footer) потрапляють в експорт (D-BLK-06)', () => {
        const header = exportOne('global-header');
        expect(header).toContain('<header');
        expect(header).toContain('>Мій Сайт</span>');
        expect(header).toContain('href="contacts.html"');
        const footer = exportOne('global-footer');
        expect(footer).toContain('<footer');
        expect(footer).toContain('Назва компанії');
        expect(footer).toContain('href="privacy.html"');
    });

    it('усі типи каталогу, крім зображення й мапи, дають непорожній HTML', () => {
        const empty = exportable.filter((type) => exportOne(type) === '');
        expect(empty.sort()).toEqual(['image', 'map']);
    });
});
