// backend/services/PaymentService.js
const crypto = require('crypto');
const LiqPayService = require('./LiqPayService');
const { ServiceError } = require('./ServiceError');

const CURRENCY = 'UAH';
const PAID_STATUSES = ['success', 'wait_accept'];

const toCents = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : null;
};

class PaymentService {
    static decodeCallback(data) {
        let payload;
        try {
            payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        } catch (error) {
            throw new ServiceError(400, 'Invalid payload');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new ServiceError(400, 'Invalid payload');
        }
        return payload;
    }

    static referenceOf(payload) {
        if (typeof payload.order_id !== 'string' || payload.order_id === '') {
            throw new ServiceError(400, 'Invalid payload');
        }
        const reference = payload.order_id.split('_')[0];
        if (reference === '') throw new ServiceError(400, 'Invalid payload');
        return reference;
    }

    static verifySignature(data, signature, privateKey) {
        if (typeof data !== 'string' || typeof signature !== 'string' || !privateKey) return false;
        const expected = Buffer.from(LiqPayService.sign(data, privateKey));
        const received = Buffer.from(signature);
        return expected.length === received.length && crypto.timingSafeEqual(expected, received);
    }

    static isPaidStatus(status) {
        if (PAID_STATUSES.includes(status)) return true;
        return status === 'sandbox' && LiqPayService.isSandbox();
    }

    static assertPaymentMatches(payload, { amount, currency = CURRENCY }) {
        const paid = toCents(payload.amount);
        const expected = toCents(amount);
        const sameCurrency = typeof payload.currency === 'string' && payload.currency.toUpperCase() === currency;
        if (paid === null || expected === null || paid !== expected || !sameCurrency) {
            throw new ServiceError(400, 'Amount or currency mismatch');
        }
    }

    static async verifyGooglePay() {
        throw new ServiceError(501, 'Оплата через Google Pay тимчасово недоступна: платіж не можна підтвердити на сервері.');
    }
}

module.exports = PaymentService;
