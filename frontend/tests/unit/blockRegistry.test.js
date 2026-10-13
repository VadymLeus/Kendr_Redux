// frontend/tests/unit/blockRegistry.test.js
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    BLOCK_REGISTRY,
    BLOCK_LIBRARY,
    getBlockDescriptor,
    getBlockComponent,
    getSettingsComponent,
    getBlockHtmlRenderer,
    getDefaultBlockData,
    getBlocksByCategory,
    getDraggableBlocks,
} from '../../src/modules/editor/core/blockRegistry';

const ALL_TYPES = [
    'hero', 'text', 'image', 'button', 'showcase', 'layout', 'catalog', 'features',
    'form', 'video', 'map', 'accordion', 'social_icons', 'global-header', 'global-footer',
];
const CATEGORIES = ['basic', 'ecommerce', 'layout', 'global'];
const REGISTRY_FILE = resolve(process.cwd(), 'src', 'modules', 'editor', 'core', 'blockRegistry.js');
const BLOCKS_DIR = resolve(process.cwd(), 'src', 'modules', 'editor', 'blocks');
const isLazy = (component) => component?.$$typeof === Symbol.for('react.lazy');

describe('реєстр блоків: склад і форма дескрипторів', () => {
    it('15 типів у фіксованому порядку, типи унікальні', () => {
        expect(BLOCK_REGISTRY.map((d) => d.type)).toEqual(ALL_TYPES);
        expect(new Set(BLOCK_REGISTRY.map((d) => d.type)).size).toBe(15);
    });

    it.each(ALL_TYPES)('дескриптор "%s" містить усі поля', (type) => {
        const descriptor = getBlockDescriptor(type);
        expect(descriptor.type).toBe(type);
        expect(typeof descriptor.label).toBe('string');
        expect(descriptor.label.length).toBeGreaterThan(0);
        expect(descriptor.icon).toBeTruthy();
        expect(CATEGORIES).toContain(descriptor.category);
        expect(typeof descriptor.getDefaults).toBe('function');
        expect(typeof descriptor.toHtml).toBe('function');
        expect(isLazy(descriptor.Component)).toBe(true);
        expect(isLazy(descriptor.Settings)).toBe(true);
    });

    it('прапорець isGlobal мають лише global-header і global-footer', () => {
        expect(BLOCK_REGISTRY.filter((d) => d.isGlobal).map((d) => d.type)).toEqual(['global-header', 'global-footer']);
    });

    it('пресети має лише макет', () => {
        expect(BLOCK_REGISTRY.filter((d) => d.presets).map((d) => d.type)).toEqual(['layout']);
    });

    it('невідомий тип не має дескриптора, ключі прототипа не вважаються типами', () => {
        expect(getBlockDescriptor('wat')).toBeUndefined();
        expect(getBlockDescriptor('constructor')).toBeUndefined();
        expect(getBlockDescriptor('__proto__')).toBeUndefined();
        expect(getBlockDescriptor(undefined)).toBeUndefined();
    });
});

describe('реєстр блоків і файли проєкту', () => {
    const source = readFileSync(REGISTRY_FILE, 'utf8');
    const imports = [...source.matchAll(/import\('\.\.\/blocks\/([A-Za-z]+)\/([A-Za-z]+)'\)/g)].map((m) => ({ dir: m[1], file: m[2] }));

    it('кожне лінкове завантаження вказує на наявний файл', () => {
        expect(imports).toHaveLength(30);
        imports.forEach(({ dir, file }) => {
            expect(existsSync(join(BLOCKS_DIR, dir, `${file}.jsx`))).toBe(true);
        });
    });

    it('кожен тип має пару файлів <Назва>Block і <Назва>Settings в одній теці', () => {
        const byDir = new Map();
        imports.forEach(({ dir, file }) => byDir.set(dir, [...(byDir.get(dir) || []), file]));
        expect(byDir.size).toBe(15);
        byDir.forEach((files, dir) => {
            expect(files.sort()).toEqual([`${dir}Block`, `${dir}Settings`]);
        });
    });

    it('кожна тека в modules/editor/blocks зареєстрована (додати блок без запису в реєстр не можна)', () => {
        const folders = readdirSync(BLOCKS_DIR).filter((name) => statSync(join(BLOCKS_DIR, name)).isDirectory());
        const registered = new Set(imports.map(({ dir }) => dir));
        expect(folders.sort()).toEqual([...registered].sort());
    });
});

describe('реєстр блоків: похідний каталог BLOCK_LIBRARY', () => {
    it('повторює порядок, назви й пресети дескрипторів, іконка є елементом розміру 20', () => {
        expect(BLOCK_LIBRARY.map((b) => b.type)).toEqual(ALL_TYPES);
        BLOCK_LIBRARY.forEach((entry) => {
            const descriptor = getBlockDescriptor(entry.type);
            expect(entry.name).toBe(descriptor.label);
            expect(entry.category).toBe(descriptor.category);
            expect(entry.icon.props.size).toBe(20);
            expect(entry.icon.type).toBe(descriptor.icon);
        });
        expect(BLOCK_LIBRARY.find((b) => b.type === 'layout').presets).toBe(getBlockDescriptor('layout').presets);
    });

    it('getDraggableBlocks повертає весь каталог', () => {
        expect(getDraggableBlocks()).toEqual(BLOCK_LIBRARY);
    });
});

describe('getBlocksByCategory', () => {
    it.each([
        ['basic', ['hero', 'text', 'image', 'button', 'features', 'form', 'video', 'map', 'accordion', 'social_icons']],
        ['ecommerce', ['showcase', 'catalog']],
        ['layout', ['layout']],
        ['global', ['global-header', 'global-footer']],
    ])('категорія "%s"', (category, types) => {
        expect(getBlocksByCategory(category).map((b) => b.type)).toEqual(types);
    });

    it('невідома категорія порожня; усі категорії разом дають усі 15 типів', () => {
        expect(getBlocksByCategory('wat')).toEqual([]);
        expect(CATEGORIES.flatMap((c) => getBlocksByCategory(c))).toHaveLength(15);
    });
});

describe('getBlockComponent (рендер на сторінці)', () => {
    it.each(ALL_TYPES)('тип "%s" → компонент дескриптора', (type) => {
        expect(getBlockComponent(type)).toBe(getBlockDescriptor(type).Component);
    });

    it('псевдонім "header" веде до компонента global-header', () => {
        expect(getBlockComponent('header')).toBe(getBlockDescriptor('global-header').Component);
    });

    it('особливість: псевдонім "footer" рендерер не знає (панель налаштувань і експорт знають)', () => {
        expect(getBlockComponent('footer')).toBeUndefined();
    });

    it.each(['wat', 'constructor', 'toString', '__proto__', undefined, null])('невідомий тип %j → undefined', (type) => {
        expect(getBlockComponent(type)).toBeUndefined();
    });
});

describe('getSettingsComponent (панель налаштувань)', () => {
    it.each(ALL_TYPES)('тип "%s" → панель дескриптора', (type) => {
        expect(getSettingsComponent(type)).toBe(getBlockDescriptor(type).Settings);
    });

    it.each([['header', 'global-header'], ['footer', 'global-footer']])('псевдонім "%s" веде до панелі %s', (alias, type) => {
        expect(getSettingsComponent(alias)).toBe(getBlockDescriptor(type).Settings);
    });

    it.each(['wat', 'constructor', undefined])('невідомий тип %j → undefined', (type) => {
        expect(getSettingsComponent(type)).toBeUndefined();
    });
});

describe('getBlockHtmlRenderer (експорт сайту)', () => {
    it.each(ALL_TYPES.filter((t) => !t.startsWith('global-')))('тип "%s" → toHtml дескриптора', (type) => {
        expect(getBlockHtmlRenderer(type)).toBe(getBlockDescriptor(type).toHtml);
    });

    it.each([['header', 'global-header'], ['footer', 'global-footer']])('псевдонім "%s" веде до toHtml %s', (alias, type) => {
        expect(getBlockHtmlRenderer(alias)).toBe(getBlockDescriptor(type).toHtml);
    });

    it.each(['global-header', 'global-footer'])('KNOWN-DEFECT D-BLK-06: тип "%s" в експорті пропускається', (type) => {
        expect(getBlockHtmlRenderer(type)).toBeUndefined();
    });

    it.each(['wat', 'constructor', undefined])('невідомий тип %j → undefined', (type) => {
        expect(getBlockHtmlRenderer(type)).toBeUndefined();
    });
});

describe('getDefaultBlockData', () => {
    it.each(ALL_TYPES)('тип "%s" → getDefaults дескриптора, block_theme "auto"', (type) => {
        const data = getDefaultBlockData(type);
        expect(data).toHaveProperty('block_theme', 'auto');
        expect(Object.keys(data).sort()).toEqual(Object.keys(getBlockDescriptor(type).getDefaults({})).sort());
    });

    it.each(['wat', 'header', 'footer', 'constructor'])('невідомий тип або псевдонім "%s" → лише block_theme', (type) => {
        expect(getDefaultBlockData(type)).toEqual({ block_theme: 'auto' });
    });

    it('options передаються дескриптору (макет)', () => {
        const data = getDefaultBlockData('layout', { preset: '33-33-33', columns: 3 });
        expect(data.preset).toBe('33-33-33');
        expect(data.columns).toEqual([[], [], []]);
    });

    it('кожен виклик повертає новий об\'єкт зі свіжими ідентифікаторами елементів', () => {
        const a = getDefaultBlockData('accordion');
        const b = getDefaultBlockData('accordion');
        expect(a).not.toBe(b);
        expect(a.items[0].id).not.toBe(b.items[0].id);
    });
});

describe('toHtml макета', () => {
    it('вкладені блоки передаються функції renderBlock із контексту, кожен окремо', () => {
        const renderBlock = vi.fn((block) => `<i>${block.type}</i>`);
        const inner = [{ type: 'text', data: {} }, { type: 'button', data: {} }];
        const html = getBlockDescriptor('layout').toHtml({ preset: '50-50', columns: [[inner[0]], [inner[1]]] }, { renderBlock });
        expect(renderBlock).toHaveBeenCalledTimes(2);
        expect(renderBlock).toHaveBeenCalledWith(inner[0]);
        expect(renderBlock).toHaveBeenCalledWith(inner[1]);
        expect(html).toContain('<i>text</i>');
        expect(html).toContain('<i>button</i>');
    });

    it('макет без колонок дає порожню сітку', () => {
        const renderBlock = vi.fn();
        const html = getBlockDescriptor('layout').toHtml({}, { renderBlock });
        expect(renderBlock).not.toHaveBeenCalled();
        expect(html).toContain('grid-template-columns: 1fr 1fr;');
    });
});

describe('toHtml каталогу й вітрини', () => {
    it('каталог додає примітку про бекенд, вітрина — ні; решта розмітки однакова', () => {
        const data = { title: 'Товари', columns: 2, items_per_page: 2 };
        const catalog = getBlockDescriptor('catalog').toHtml(data);
        const showcase = getBlockDescriptor('showcase').toHtml(data);
        expect(catalog).toContain('Dynamic catalog requires backend connection.');
        expect(showcase).not.toContain('Dynamic catalog requires backend connection.');
        const squash = (html) => html.replace(/\s+/g, ' ').trim();
        const withoutNote = catalog.replace(/<div style="text-align: center; margin-top: 30px;[^]*?<\/div>/, '');
        expect(squash(withoutNote)).toBe(squash(showcase));
    });
});
