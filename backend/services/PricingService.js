// backend/services/PricingService.js
class PricingService {
    static calculateOrderTotal(items) {
        let total = 0;
        for (const item of items) {
            total += parseFloat(item.price) * item.quantity;
        }
        return total;
    }
}

module.exports = PricingService;
