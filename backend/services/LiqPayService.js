// backend/services/LiqPayService.js
const crypto = require('crypto');

const encode = (params, privateKey) => {
    const data = Buffer.from(JSON.stringify(params)).toString('base64');
    return { data, signature: LiqPayService.sign(data, privateKey) };
};

const callbackUrl = (path) => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    return process.env.NGROK_URL ? `${process.env.NGROK_URL}${path}` : `${backendUrl}${path}`;
};

const sandboxParams = () => (LiqPayService.isSandbox() ? { sandbox: 1 } : {});

class LiqPayService {
    static sign(data, privateKey) {
        return crypto.createHash('sha1').update(privateKey + data + privateKey).digest('base64');
    }

    static isSandbox() {
        return ['1', 'true'].includes(String(process.env.LIQPAY_SANDBOX || '').trim().toLowerCase());
    }

    static createPayment(orderId, amount, publicKey, privateKey) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return encode({
            public_key: publicKey,
            version: '3',
            action: 'pay',
            amount: amount,
            currency: 'UAH',
            description: `Замовлення #${orderId} на суму ${amount} UAH`,
            order_id: `${orderId}_${Date.now()}`,
            server_url: callbackUrl('/api/orders/liqpay-callback'),
            result_url: `${frontendUrl}/my-orders`,
            ...sandboxParams()
        }, privateKey);
    }

    static createUpgradePayment(transactionId, amount, description, publicKey, privateKey) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return encode({
            public_key: publicKey,
            version: '3',
            action: 'pay',
            amount: amount,
            currency: 'UAH',
            description,
            order_id: transactionId,
            server_url: callbackUrl('/api/transactions/liqpay-callback'),
            result_url: `${frontendUrl}/settings`,
            ...sandboxParams()
        }, privateKey);
    }
}

module.exports = LiqPayService;
