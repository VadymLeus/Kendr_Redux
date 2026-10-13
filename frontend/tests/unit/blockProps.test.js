// frontend/tests/unit/blockProps.test.js
import { describe, it, expect } from 'vitest';
import { areBlockPropsEqual } from '../../src/modules/editor/core/blockProps';

const props = (overrides = {}) => ({
    blockData: { title: 'A', items: [{ id: 1, tags: ['x'] }] },
    isEditorPreview: false,
    siteData: { id: 7, title: 'Сайт' },
    ...overrides,
});

describe('areBlockPropsEqual', () => {
    it('той самий об\'єкт даних дає true', () => {
        const shared = props();
        expect(areBlockPropsEqual(shared, { ...shared })).toBe(true);
    });

    it('окрема глибока копія даних дає true', () => {
        expect(areBlockPropsEqual(props(), props({ blockData: { title: 'A', items: [{ id: 1, tags: ['x'] }] } }))).toBe(true);
    });

    it('порядок ключів не має значення', () => {
        expect(areBlockPropsEqual(props({ blockData: { a: 1, b: 2 } }), props({ blockData: { b: 2, a: 1 } }))).toBe(true);
    });

    it('зміна вкладеного значення дає false', () => {
        expect(areBlockPropsEqual(props(), props({ blockData: { title: 'A', items: [{ id: 1, tags: ['y'] }] } }))).toBe(false);
    });

    it('додане або видалене поле дає false', () => {
        expect(areBlockPropsEqual(props({ blockData: { a: 1 } }), props({ blockData: { a: 1, b: 2 } }))).toBe(false);
        expect(areBlockPropsEqual(props({ blockData: { a: 1, b: 2 } }), props({ blockData: { a: 1 } }))).toBe(false);
    });

    it('порядок елементів масиву має значення', () => {
        expect(areBlockPropsEqual(props({ blockData: { l: [1, 2] } }), props({ blockData: { l: [2, 1] } }))).toBe(false);
    });

    it('зміна isEditorPreview дає false', () => {
        expect(areBlockPropsEqual(props(), props({ isEditorPreview: true }))).toBe(false);
    });

    it('зміна id сайту дає false, зміна інших полів сайту — true', () => {
        expect(areBlockPropsEqual(props(), props({ siteData: { id: 8, title: 'Сайт' } }))).toBe(false);
        expect(areBlockPropsEqual(props(), props({ siteData: { id: 7, title: 'Інша назва' } }))).toBe(true);
    });

    it('відсутні siteData з обох боків дають true, з одного — false', () => {
        expect(areBlockPropsEqual(props({ siteData: undefined }), props({ siteData: undefined }))).toBe(true);
        expect(areBlockPropsEqual(props({ siteData: undefined }), props())).toBe(false);
    });

    it('відсутні дані блока з обох боків дають true', () => {
        expect(areBlockPropsEqual(props({ blockData: undefined }), props({ blockData: undefined }))).toBe(true);
        expect(areBlockPropsEqual(props({ blockData: undefined }), props())).toBe(false);
    });

    it('інші props (style, обробники) не враховуються', () => {
        expect(areBlockPropsEqual(props({ style: { a: 1 }, onMenuToggle: () => 1 }), props({ style: { a: 2 }, onMenuToggle: () => 2 }))).toBe(true);
    });
});
