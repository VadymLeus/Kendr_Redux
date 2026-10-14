// backend/controllers/orderController.js
const OrderService = require('../services/OrderService');
const { ServiceError } = require('../services/ServiceError');

exports.processCheckout = async (req, res) => {
    const pausedError = await OrderService.getBillingPausedError();
    if (pausedError) {
        return res.status(pausedError.status).json({ message: pausedError.message });
    }
    const { siteId, items, customerData, paymentMethod } = req.body;
    const userId = req.user.id;
    try {
        const result = await OrderService.checkout(userId, { siteId, items, customerData, paymentMethod });
        res.status(200).json(result);
    } catch (error) {
        const status = error.status || 400;
        if (status >= 500 || !error.status) {
            console.error("Критична помилка при створенні замовлення:", error);
        }
        res.status(status).json({ message: error.message || 'Не вдалося створити замовлення. Можливо, товару немає в наявності.' });
    }
};

exports.generatePaymentForOrder = async (req, res) => {
    const orderId = req.params.id;
    const userId = req.user.id;
    try {
        const result = await OrderService.createPayment(orderId, userId);
        res.status(200).json(result);
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error("Помилка генерації оплати:", error);
        res.status(500).json({ message: 'Помилка сервера при створенні оплати.' });
    }
};

exports.liqpayCallback = async (req, res) => {
    const { data, signature } = req.body;
    try {
        await OrderService.handleLiqPayCallback({ data, signature });
        res.status(200).send('OK');
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).send(error.message);
        }
        console.error('Помилка в LiqPay Webhook:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.processGooglePay = async (req, res) => {
    const { orderId } = req.params;
    const { paymentData } = req.body;
    const userId = req.user.id;
    try {
        await OrderService.payWithGooglePay(orderId, userId, paymentData);
        res.json({ success: true, message: 'Оплату успішно проведено' });
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Помилка обробки Google Pay:', error);
        res.status(500).json({ message: 'Помилка на сервері при обробці платежу' });
    }
};

exports.getSiteOrders = async (req, res) => {
    const { siteId } = req.params;
    try {
        const orders = await OrderService.listForSite(siteId, req.user.id);
        res.status(200).json(orders);
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error("Помилка отримання замовлень:", error);
        res.status(500).json({ message: 'Помилка отримання замовлень' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await OrderService.updateStatus(id, req.user.id, status);
        res.status(200).json({ message: 'Статус оновлено' });
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: 'Помилка оновлення статусу' });
    }
};

exports.getMyOrders = async (req, res) => {
    const userId = req.user.id;
    try {
        const orders = await OrderService.listForCustomer(userId);
        res.status(200).json(orders);
    } catch (error) {
        console.error("Помилка отримання моїх замовлень:", error);
        res.status(500).json({ message: 'Помилка отримання замовлень' });
    }
};
