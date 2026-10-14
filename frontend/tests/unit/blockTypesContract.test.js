// frontend/tests/unit/blockTypesContract.test.js
// Контракт між реєстром блоків редактора й переліком типів, який приймає сервер (D-BLK-05, ADR-002):
// новий блок без рядка в backend/config/blockTypes.js не збережеться на сервері, тож тест падає раніше.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { BLOCK_REGISTRY } from '../../src/modules/editor/core/blockRegistry';
import { LEGACY_TYPE_ALIASES } from '../../src/modules/editor/core/globalBlockTypes';

const require = createRequire(import.meta.url);
const { BLOCK_TYPES, LEGACY_BLOCK_TYPES } = require('../../../backend/config/blockTypes');

describe('перелік типів блоків: реєстр редактора ↔ backend/config/blockTypes.js', () => {
    it('типи реєстру збігаються з типами, які приймає сервер', () => {
        expect([...BLOCK_TYPES].sort()).toEqual(BLOCK_REGISTRY.map((descriptor) => descriptor.type).sort());
    });

    it('старі імена шапки й підвалу збігаються з псевдонімами редактора', () => {
        expect([...LEGACY_BLOCK_TYPES].sort()).toEqual(Object.keys(LEGACY_TYPE_ALIASES).sort());
    });

    it('кожне старе ім\'я веде до типу з переліку сервера', () => {
        Object.values(LEGACY_TYPE_ALIASES).forEach((type) => expect(BLOCK_TYPES).toContain(type));
    });

    it('типи не повторюються', () => {
        expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
        expect(new Set(LEGACY_BLOCK_TYPES).size).toBe(LEGACY_BLOCK_TYPES.length);
    });
});
