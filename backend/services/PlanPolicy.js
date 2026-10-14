// backend/services/PlanPolicy.js
const { getLimitsForUser } = require('../config/mediaLimits');
const { ServiceError } = require('./ServiceError');

const COUNTED_RESOURCES = {
    sites: { limit: 'maxSites', message: (max) => `Ви досягли ліміту сайтів (${max}) на вашому тарифі.` },
    products: { limit: 'maxProducts', message: (max) => `Досягнуто ліміту товарів (${max}) на тарифі власника сайту.` },
    categories: { limit: 'maxCategories', message: (max) => `Досягнуто ліміту категорій (${max}) на тарифі власника сайту.` }
};

class PlanPolicy {
    static getLimits(plan) {
        return getLimitsForUser(plan);
    }

    static assertWithinLimit(plan, resource, currentCount) {
        const rule = COUNTED_RESOURCES[resource];
        const max = PlanPolicy.getLimits(plan)[rule.limit];
        if (Number(currentCount) >= max) {
            throw new ServiceError(403, rule.message(max));
        }
    }
}

module.exports = PlanPolicy;
