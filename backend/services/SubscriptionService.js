// backend/services/SubscriptionService.js
const crypto = require('crypto');
const TransactionRepository = require('../repositories/TransactionRepository');
const UserRepository = require('../repositories/UserRepository');
const LiqPayService = require('./LiqPayService');
const PaymentService = require('./PaymentService');
const { ServiceError } = require('./ServiceError');

const PLUS_PRICE = 299.00;
const PREMIUM_PLANS = ['PLUS', 'ADMIN'];
const ALREADY_PREMIUM = 'У вас вже активовано преміум тариф.';
const KEYS_MISSING = 'Ключі LiqPay платформи не налаштовані в системі.';

const platformKeys = () => ({
    publicKey: process.env.LIQPAY_PUBLIC_KEY,
    privateKey: process.env.LIQPAY_PRIVATE_KEY
});

class SubscriptionService {
    static async startUpgrade(userId) {
        const { publicKey, privateKey } = platformKeys();
        if (!publicKey || !privateKey) throw new ServiceError(500, KEYS_MISSING);
        if (PREMIUM_PLANS.includes(await UserRepository.findPlan(userId))) {
            throw new ServiceError(400, ALREADY_PREMIUM);
        }
        const transactionId = crypto.randomUUID();
        const description = `Оплата довічного тарифу Kendr PLUS для користувача #${userId}`;
        await TransactionRepository.create({
            id: transactionId,
            userId,
            amount: PLUS_PRICE,
            currency: 'UAH',
            status: 'pending',
            providerId: null,
            description
        });
        return LiqPayService.createUpgradePayment(transactionId, PLUS_PRICE, description, publicKey, privateKey);
    }

    static async upgradeWithGooglePay(userId, paymentData) {
        if (PREMIUM_PLANS.includes(await UserRepository.findPlan(userId))) {
            throw new ServiceError(400, ALREADY_PREMIUM);
        }
        const verified = await PaymentService.verifyGooglePay(paymentData, {
            amount: PLUS_PRICE,
            currency: 'UAH',
            reference: `plan:${userId}`
        });
        await TransactionRepository.transaction(async (connection) => {
            if (PREMIUM_PLANS.includes(await UserRepository.findPlanForUpdate(userId, connection))) {
                throw new ServiceError(400, ALREADY_PREMIUM);
            }
            await TransactionRepository.create({
                id: crypto.randomUUID(),
                userId,
                amount: PLUS_PRICE,
                currency: 'UAH',
                status: 'success',
                providerId: verified.providerId,
                description: `Оплата довічного тарифу Kendr PLUS для користувача #${userId} (Google Pay)`
            }, connection);
            await UserRepository.setPlan(userId, 'PLUS', connection);
        });
    }

    static async handleLiqPayCallback({ data, signature }) {
        if (!data || !signature) {
            throw new ServiceError(400, 'Missing data or signature');
        }
        const { privateKey } = platformKeys();
        if (!privateKey) throw new ServiceError(500, KEYS_MISSING);
        if (!PaymentService.verifySignature(data, signature, privateKey)) {
            throw new ServiceError(403, 'Invalid signature');
        }
        const payload = PaymentService.decodeCallback(data);
        if (!PaymentService.isPaidStatus(payload.status)) return;
        const transactionId = PaymentService.referenceOf(payload);
        await TransactionRepository.transaction(async (connection) => {
            const transaction = await TransactionRepository.findById(transactionId, connection);
            if (!transaction || transaction.status !== 'pending') return;
            PaymentService.assertPaymentMatches(payload, { amount: transaction.amount, currency: transaction.currency });
            const claimed = await TransactionRepository.markSuccessIfPending(transactionId, payload.payment_id ?? null, connection);
            if (claimed) await UserRepository.setPlan(transaction.user_id, 'PLUS', connection);
        });
    }
}

module.exports = SubscriptionService;
