// backend/services/LiqPayService.js
const crypto = require('crypto');

class LiqPayService {
    static sign(data, privateKey) {
        return crypto.createHash('sha1').update(privateKey + data + privateKey).digest('base64');
    }

    static createPayment(orderId, amount, publicKey, privateKey) {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const callbackUrl = process.env.NGROK_URL 
            ? `${process.env.NGROK_URL}/api/orders/liqpay-callback`
            : `${backendUrl}/api/orders/liqpay-callback`;
        const liqpayParams = {
            public_key: publicKey,
            version: '3',
            action: 'pay',
            amount: amount,
            currency: 'UAH',
            description: `Замовлення #${orderId} на суму ${amount} UAH`,
            order_id: `${orderId}_${Date.now()}`,
            server_url: callbackUrl, 
            result_url: `${frontendUrl}/my-orders`,
            sandbox: 1
        };
        const jsonString = JSON.stringify(liqpayParams);
        const dataStr = Buffer.from(jsonString).toString('base64');
        return { data: dataStr, signature: LiqPayService.sign(dataStr, privateKey) };
    }
}

module.exports = LiqPayService;
