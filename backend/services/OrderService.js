// backend/services/OrderService.js
const crypto = require('crypto');
const OrderRepository = require('../repositories/OrderRepository');
const ProductRepository = require('../repositories/ProductRepository');
const GlobalSettingsRepository = require('../repositories/GlobalSettingsRepository');
const TransactionRepository = require('../repositories/TransactionRepository');
const PricingService = require('./PricingService');
const LiqPayService = require('./LiqPayService');
const emailService = require('../utils/emailService');
const { decrypt } = require('../utils/encryption');
const { ServiceError } = require('./ServiceError');

const BILLING_PAUSED = 'Прийом платежів тимчасово призупинено адміністрацією платформи.';

const generateOrderNumber = (size = 12) => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let id = '';
    const bytes = crypto.randomBytes(size);
    for (let i = 0; i < size; i++) {
        id += chars[bytes[i] % chars.length];
    }
    return id;
};

const settlementOf = (items) => {
    const isDigitalOnly = items.length > 0 && items.every(item => item.type === 'digital');
    return {
        newStatus: isDigitalOnly ? 'completed' : 'paid',
        digitalItems: items.filter(item => item.type === 'digital' && item.digital_file_url)
    };
};

const decrementStockFor = async (items, connection) => {
    for (const item of items) {
        if (item.type !== 'digital' && item.product_id) {
            await ProductRepository.decrementStock(item.product_id, item.quantity, connection);
        }
    }
};

class OrderService {
    static async isBillingEnabled() {
        let settings = { billing_enabled: 1 };
        try {
            const row = await GlobalSettingsRepository.findBilling();
            if (row) settings = row;
        } catch (e) {
            console.warn('Таблиця global_settings не знайдена або порожня.');
        }
        return !!settings.billing_enabled;
    }

    static async getBillingPausedError() {
        if (await OrderService.isBillingEnabled()) return null;
        return new ServiceError(403, BILLING_PAUSED);
    }

    static async checkout(userId, { siteId, items, customerData, paymentMethod }) {
        const method = paymentMethod === 'cod' ? 'cod' : 'online';
        if (!siteId) throw new ServiceError(400, 'Не вказано магазин для оформлення.');
        if (!items || items.length === 0) throw new ServiceError(400, 'Список товарів порожній.');
        const placed = await OrderRepository.transaction(
            (connection) => OrderService.placeOrder(connection, userId, siteId, items, customerData, method)
        );
        const { orderId, total, sitePublicKey, sitePrivateKey } = placed;
        if (method === 'online' && sitePublicKey && sitePrivateKey) {
            const paymentData = LiqPayService.createPayment(orderId, total, sitePublicKey, sitePrivateKey);
            return {
                liqpayData: paymentData.data,
                liqpaySignature: paymentData.signature,
                orderId,
                paymentMethod: method
            };
        }
        return { orderId, paymentMethod: method };
    }

    static async placeOrder(connection, userId, siteId, items, customerData, method) {
        const site = await OrderRepository.findSiteForPayment(siteId, connection);
        if (!site) {
            throw new ServiceError(404, 'Магазин не знайдено.');
        }
        if (String(site.user_id) === String(userId)) {
            throw new ServiceError(403, 'Ви не можете купувати товари у власному магазині.');
        }
        if (await OrderRepository.isCollaborator(siteId, userId, connection)) {
            throw new ServiceError(403, 'Співавтори не можуть оформлювати замовлення на цьому сайті.');
        }
        if (method === 'online' && !site.is_online_payment_enabled) {
            throw new ServiceError(400, 'Продавець тимчасово не приймає онлайн оплату.');
        }
        if (method === 'cod' && !site.is_cod_enabled) {
            throw new ServiceError(400, 'Продавець не відправляє товари післяплатою.');
        }
        const customer = await OrderRepository.findCustomer(userId, connection);
        if (!customer) throw new Error('Користувача не знайдено');
        const realUserEmail = customer.email;
        const deliveryName = (customerData && customerData.name) ? customerData.name : customer.username;
        const deliveryPhone = (customerData && customerData.phone) ? customerData.phone : '';
        const pendingCount = await OrderRepository.countPending(siteId, userId, realUserEmail, deliveryPhone, connection);
        if (pendingCount >= 5) {
            throw new ServiceError(429, 'Ви досягли ліміту неоплачених замовлень (5). Будь ласка, оплатіть або скасуйте попередні замовлення перед створенням нових.');
        }
        let sitePublicKey = null;
        let sitePrivateKey = null;
        if (method === 'online') {
            if (site.liqpay_public_key && site.liqpay_private_key) {
                sitePublicKey = site.liqpay_public_key;
                sitePrivateKey = decrypt(site.liqpay_private_key);
                if (!sitePrivateKey) {
                    throw new ServiceError(500, 'Помилка дешифрування ключа оплати.');
                }
            }
        }
        let isDigitalOnly = true;
        const validatedItems = [];
        for (const reqItem of items) {
            const product = await ProductRepository.findForCheckout(reqItem.id, siteId, connection);
            if (!product) throw new Error(`Деякі товари недоступні або не належать цьому магазину.`);
            if (product.type !== 'digital' && product.stock_quantity !== null) {
                if (reqItem.quantity > product.stock_quantity) {
                    throw new Error(`Недостатньо товару "${product.name}" на складі.`);
                }
                isDigitalOnly = false;
            } else if (product.type !== 'digital') {
                isDigitalOnly = false;
            }
            validatedItems.push({
                ...product,
                quantity: reqItem.quantity,
                options: reqItem.options || {}
            });
        }
        const total = PricingService.calculateOrderTotal(validatedItems);
        if (!isDigitalOnly && (!customerData || !customerData.address || !customerData.address.trim())) {
            throw new Error('Адреса доставки обов\'язкова для фізичних товарів.');
        }
        if (isDigitalOnly && method === 'cod') {
            throw new Error('Цифрові товари не можна замовити післяплатою.');
        }
        const orderId = generateOrderNumber();
        await OrderRepository.create({
            id: orderId,
            siteId,
            customerId: userId,
            customerName: deliveryName,
            customerEmail: realUserEmail,
            customerPhone: deliveryPhone,
            deliveryAddress: isDigitalOnly ? 'Цифрова доставка' : customerData.address,
            totalAmount: total,
            paymentMethod: method
        }, connection);
        for (const item of validatedItems) {
            await OrderRepository.addItem(orderId, item, connection);
        }
        return { orderId, total, sitePublicKey, sitePrivateKey };
    }

    static async createPayment(orderId, userId) {
        const paused = await OrderService.getBillingPausedError();
        if (paused) throw paused;
        const order = await OrderRepository.findByIdAndCustomer(orderId, userId);
        if (!order) throw new ServiceError(404, 'Замовлення не знайдено');
        const site = await OrderRepository.findSiteForPayment(order.site_id);
        if (site && String(site.user_id) === String(userId)) {
            throw new ServiceError(403, 'Ви не можете оплачувати власні товари.');
        }
        if (await OrderRepository.isCollaborator(order.site_id, userId)) {
            throw new ServiceError(403, 'Співавтори не можуть оплачувати товари на цьому сайті.');
        }
        if (order.status !== 'pending') {
            throw new ServiceError(400, 'Це замовлення вже оплачено або скасовано.');
        }
        if (order.payment_method === 'cod') {
            throw new ServiceError(400, 'Це замовлення оформлено з оплатою при отриманні. Онлайн оплата недоступна.');
        }
        const items = await OrderRepository.findItemsForPayment(orderId);
        for (const item of items) {
            if (item.type !== 'digital') {
                const product = await ProductRepository.findStock(item.product_id);
                if (product && product.stock_quantity !== null && product.stock_quantity < item.quantity) {
                    throw new ServiceError(400, `Недостатньо товару "${product.name}" на складі.`);
                }
            }
        }
        if (!site || !site.is_online_payment_enabled) {
            throw new ServiceError(400, 'Магазин тимчасово не може приймати онлайн оплату.');
        }
        if (!site.liqpay_public_key || !site.liqpay_private_key) {
            return { orderId: order.id, amount: order.total_amount };
        }
        const sitePrivateKey = decrypt(site.liqpay_private_key);
        if (!sitePrivateKey) throw new ServiceError(500, 'Помилка конфігурації ключів оплати продавця.');
        const paymentData = LiqPayService.createPayment(order.id, order.total_amount, site.liqpay_public_key, sitePrivateKey);
        return {
            liqpayData: paymentData.data,
            liqpaySignature: paymentData.signature
        };
    }

    static async handleLiqPayCallback({ data, signature }) {
        if (!data || !signature) {
            throw new ServiceError(400, 'Missing data or signature');
        }
        const decodedData = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        const { order_id: liqpayOrderId, status } = decodedData;
        const realOrderId = liqpayOrderId.split('_')[0];
        const order = await OrderRepository.findById(realOrderId);
        if (!order) {
            throw new ServiceError(404, 'Order not found');
        }
        const site = await OrderRepository.findSiteForCallback(order.site_id);
        if (!site || !site.liqpay_private_key) {
            throw new ServiceError(400, 'Private key missing for site');
        }
        const sitePrivateKey = decrypt(site.liqpay_private_key);
        if (!sitePrivateKey) throw new ServiceError(500, 'Private key decryption failed');
        const siteAccentColor = site.site_theme_accent || 'blue';
        if (signature !== LiqPayService.sign(data, sitePrivateKey)) {
            throw new ServiceError(403, 'Invalid signature');
        }
        if (status === 'success' || status === 'wait_accept' || status === 'sandbox') {
            if (order.status === 'pending') {
                const items = await OrderRepository.findItems(realOrderId);
                const { newStatus, digitalItems } = settlementOf(items);
                await OrderRepository.updateStatus(realOrderId, newStatus);
                await decrementStockFor(items);
                if (digitalItems.length > 0) {
                    await emailService.sendDigitalGoodsEmail(order.customer_email, order.customer_name, digitalItems, siteAccentColor);
                }
            }
        }
    }

    static async payWithGooglePay(orderId, userId, paymentData) {
        await OrderRepository.transaction(async (connection) => {
            const order = await OrderRepository.findById(orderId, connection);
            if (!order) {
                throw new ServiceError(404, 'Замовлення не знайдено');
            }
            if (String(order.customer_id) !== String(userId)) {
                throw new ServiceError(403, 'Доступ заборонено');
            }
            if (order.status === 'paid' || order.status === 'completed') {
                throw new ServiceError(400, 'Замовлення вже оплачено');
            }
            const items = await OrderRepository.findItems(orderId, connection);
            const { newStatus, digitalItems } = settlementOf(items);
            await OrderRepository.updateStatusAndTouch(orderId, newStatus, connection);
            await decrementStockFor(items, connection);
            const site = await OrderRepository.findSiteOwnerAndAccent(order.site_id, connection);
            const siteOwnerId = site.user_id;
            const siteAccentColor = site.site_theme_accent || 'blue';
            if (digitalItems.length > 0) {
                await emailService.sendDigitalGoodsEmail(order.customer_email, order.customer_name, digitalItems, siteAccentColor);
            }
            const providerId = paymentData?.paymentMethodData?.tokenizationData?.token
                ? 'gpay_' + paymentData.paymentMethodData.tokenizationData.token.substring(0, 20)
                : 'gpay_test_' + Date.now();
            await TransactionRepository.create({
                id: crypto.randomUUID(),
                userId: siteOwnerId,
                amount: order.total_amount,
                currency: 'UAH',
                status: 'success',
                providerId,
                description: `Оплата замовлення #${orderId} через Google Pay`
            }, connection);
        });
    }

    static async listForSite(siteId) {
        const orders = await OrderRepository.findBySite(siteId);
        for (const order of orders) {
            order.items = await OrderRepository.findItemsWithImages(order.id);
        }
        return orders;
    }

    static async listForCustomer(userId) {
        const orders = await OrderRepository.findByCustomer(userId);
        for (const order of orders) {
            const items = await OrderRepository.findItemsWithImages(order.id);
            if (order.status !== 'paid' && order.status !== 'completed') {
                items.forEach(item => { item.digital_file_url = null; });
            }
            order.items = items;
        }
        return orders;
    }

    static async updateStatus(orderId, status) {
        await OrderRepository.updateStatus(orderId, status);
    }
}

module.exports = OrderService;
