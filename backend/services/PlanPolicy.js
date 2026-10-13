// backend/services/PlanPolicy.js
const { getLimitsForUser } = require('../config/mediaLimits');

class PlanPolicy {
    static getLimits(plan) {
        return getLimitsForUser(plan);
    }
}

module.exports = PlanPolicy;
