// backend/config/blockTypes.js
// Перелік типів блоків, які сервер приймає у block_content (D-BLK-05, ADR-002).
// Дзеркало реєстру редактора frontend/src/modules/editor/core/blockRegistry.js:
// контрактний тест frontend/tests/unit/blockTypesContract.test.js порівнює обидва переліки,
// тож новий блок без рядка тут не пройде перевірку.

const BLOCK_TYPES = [
    'hero',
    'text',
    'image',
    'button',
    'showcase',
    'layout',
    'catalog',
    'features',
    'form',
    'video',
    'map',
    'accordion',
    'social_icons',
    'global-header',
    'global-footer'
];

// Старі імена шапки й підвалу: їх створює бекенд (D-DUP-07), а редактор зводить до global-header / global-footer.
const LEGACY_BLOCK_TYPES = ['header', 'footer'];

module.exports = { BLOCK_TYPES, LEGACY_BLOCK_TYPES };
