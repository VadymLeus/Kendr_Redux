// backend/services/productValidation.js
const { ServiceError } = require('./ServiceError');

const MAX_PRICE = 99999999.99;
const PRODUCT_TYPES = ['physical', 'digital'];

const isBlank = (value) => value === undefined || value === null || value === '';

const toNumber = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
};

const readPrice = (value) => {
    if (isBlank(value)) return 0;
    const price = toNumber(value);
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
        throw new ServiceError(400, 'Ціна товару має бути числом від 0 до 99999999.99.');
    }
    return price;
};

const readSalePercentage = (value) => {
    if (isBlank(value)) return 0;
    const percentage = toNumber(value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        throw new ServiceError(400, 'Знижка товару має бути від 0 до 100 %.');
    }
    return Math.round(percentage);
};

const readStock = (value) => {
    if (isBlank(value)) return null;
    const stock = toNumber(value);
    if (!Number.isInteger(stock) || stock < 0) {
        throw new ServiceError(400, 'Залишок товару має бути цілим числом не менше 0.');
    }
    return stock;
};

const readType = (value) => {
    if (isBlank(value)) return undefined;
    if (!PRODUCT_TYPES.includes(value)) {
        throw new ServiceError(400, 'Недопустимий тип товару.');
    }
    return value;
};

const readDiscount = (value) => {
    if (isBlank(value)) return 0;
    const percentage = toNumber(value);
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
        throw new ServiceError(400, 'Знижка категорії має бути цілим числом від 0 до 100 %.');
    }
    return percentage;
};

module.exports = { readPrice, readSalePercentage, readStock, readType, readDiscount };
