// backend/services/PricingService.js
const { ServiceError } = require('./ServiceError');

const toNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toPercent = (value) => Math.min(100, Math.max(0, toNumber(value)));

const toVariants = (variants) => {
    if (Array.isArray(variants)) return variants;
    if (typeof variants === 'string') {
        try {
            const parsed = JSON.parse(variants);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
};

class PricingService {
    static selectVariantValues(product, options) {
        const chosen = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
        const variants = toVariants(product.variants);
        return Object.entries(chosen).map(([name, label]) => {
            const variant = variants.find(v => v && v.name === name);
            const value = variant && Array.isArray(variant.values)
                ? variant.values.find(val => val && val.label === label)
                : undefined;
            if (!value) {
                throw new ServiceError(400, `Варіант "${name}: ${label}" товару "${product.name}" недоступний. Оновіть кошик.`);
            }
            return value;
        });
    }

    static unitPrice(product, options) {
        const values = PricingService.selectVariantValues(product, options);
        const basePrice = values.reduce((sum, value) => sum + toNumber(value.priceModifier), toNumber(product.price));
        const variantDiscount = Math.max(0, ...values.map(value => toPercent(value.salePercentage)));
        const discount = variantDiscount || toPercent(product.sale_percentage) || toPercent(product.category_discount) || 0;
        return Math.max(0, Math.round(basePrice * (1 - discount / 100)));
    }

    static calculateOrderTotal(items) {
        let total = 0;
        for (const item of items) {
            total += parseFloat(item.price) * item.quantity;
        }
        return Math.round(total * 100) / 100;
    }
}

module.exports = PricingService;
