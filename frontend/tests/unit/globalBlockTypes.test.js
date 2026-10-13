// frontend/tests/unit/globalBlockTypes.test.js
import { describe, it, expect } from 'vitest';
import { LEGACY_TYPE_ALIASES, isHeaderType, isFooterType, isGlobalType } from '../../src/modules/editor/core/globalBlockTypes';

describe('типи глобальних блоків', () => {
    it('псевдоніми ведуть до канонічних типів', () => {
        expect(LEGACY_TYPE_ALIASES).toEqual({ header: 'global-header', footer: 'global-footer' });
    });

    it.each([
        ['header', true, false], ['global-header', true, false],
        ['footer', false, true], ['global-footer', false, true],
        ['hero', false, false], ['layout', false, false], ['', false, false], [undefined, false, false],
    ])('тип %j: шапка %s, підвал %s', (type, header, footer) => {
        expect(isHeaderType(type)).toBe(header);
        expect(isFooterType(type)).toBe(footer);
    });

    it.each([
        ['header', true], ['footer', true], ['global-header', true], ['global-footer', true], ['global-щось', true],
        ['hero', false], ['text', false], ['', false], [undefined, false], [null, false],
    ])('isGlobalType(%j) = %s', (type, expected) => {
        expect(isGlobalType(type)).toBe(expected);
    });
});
