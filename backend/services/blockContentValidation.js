// backend/services/blockContentValidation.js
// Перевірка block_content перед збереженням сторінки (D-BLK-05, ADR-002).
// Масив блоків; у кожному block_id, type і data; type входить до config/blockTypes.js;
// layout.data.columns перевіряється рекурсивно; кількість, вкладеність і розмір обмежені.
const { ServiceError } = require('./ServiceError');
const { BLOCK_TYPES, LEGACY_BLOCK_TYPES } = require('../config/blockTypes');

const ACCEPTED_TYPES = new Set([...BLOCK_TYPES, ...LEGACY_BLOCK_TYPES]);
const MAX_BLOCKS = 500;
const MAX_DEPTH = 5;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_ID_LENGTH = 100;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const invalid = (message) => new ServiceError(400, message);

const validateBlock = (block, path, depth, counter) => {
    if (!isPlainObject(block)) {
        throw invalid(`Блок ${path} має бути об'єктом.`);
    }
    counter.count += 1;
    if (counter.count > MAX_BLOCKS) {
        throw invalid(`На сторінці забагато блоків (максимум ${MAX_BLOCKS}).`);
    }
    if (typeof block.block_id !== 'string' || block.block_id.trim() === '' || block.block_id.length > MAX_ID_LENGTH) {
        throw invalid(`Блок ${path} не має коректного block_id.`);
    }
    if (typeof block.type !== 'string' || !ACCEPTED_TYPES.has(block.type)) {
        throw invalid(`Блок ${path} має невідомий тип.`);
    }
    if (!isPlainObject(block.data)) {
        throw invalid(`Блок ${path} не має даних (data має бути об'єктом).`);
    }
    if (block.type === 'layout') {
        validateColumns(block.data.columns, `${path}.data.columns`, depth, counter);
    }
};

const validateBlocks = (blocks, path, depth, counter) => {
    if (depth > MAX_DEPTH) {
        throw invalid(`Вкладеність блоків перевищує ${MAX_DEPTH} рівнів.`);
    }
    blocks.forEach((block, index) => validateBlock(block, `${path}[${index}]`, depth, counter));
};

const validateColumns = (columns, path, depth, counter) => {
    if (columns === undefined) return;
    if (!Array.isArray(columns)) {
        throw invalid(`Колонки макета ${path} мають бути масивом.`);
    }
    columns.forEach((column, index) => {
        if (!Array.isArray(column)) {
            throw invalid(`Колонка ${path}[${index}] має бути масивом блоків.`);
        }
        validateBlocks(column, `${path}[${index}]`, depth + 1, counter);
    });
};

const validateBlockContent = (blockContent) => {
    if (!Array.isArray(blockContent)) {
        throw invalid('Вміст сторінки (block_content) має бути масивом блоків.');
    }
    if (Buffer.byteLength(JSON.stringify(blockContent), 'utf8') > MAX_CONTENT_BYTES) {
        throw invalid(`Вміст сторінки перевищує ${MAX_CONTENT_BYTES / (1024 * 1024)} МБ.`);
    }
    validateBlocks(blockContent, '', 0, { count: 0 });
    return blockContent;
};

module.exports = { validateBlockContent, MAX_BLOCKS, MAX_DEPTH, MAX_CONTENT_BYTES, MAX_ID_LENGTH };
