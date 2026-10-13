// backend/controllers/transactionController.js
const db = require('../config/db');
const SubscriptionService = require('../services/SubscriptionService');
const { ServiceError } = require('../services/ServiceError');

exports.processUpgrade = async (req, res) => {
    try {
        const paymentData = await SubscriptionService.startUpgrade(req.user.id);
        res.status(200).json(paymentData);
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Помилка при генерації оплати тарифу:', error);
        res.status(500).json({ message: 'Помилка сервера при створенні транзакції.' });
    }
};

exports.processGooglePayUpgrade = async (req, res) => {
    try {
        await SubscriptionService.upgradeWithGooglePay(req.user.id, req.body?.paymentData);
        res.status(200).json({ success: true, message: 'Тариф Kendr PLUS успішно активовано!' });
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Помилка при обробці Google Pay для тарифу:', error);
        res.status(500).json({ message: 'Помилка сервера при створенні транзакції.' });
    }
};

exports.liqpayWebhook = async (req, res) => {
    const { data, signature } = req.body;
    try {
        await SubscriptionService.handleLiqPayCallback({ data, signature });
        res.status(200).send('OK');
    } catch (error) {
        if (error instanceof ServiceError) {
            return res.status(error.status).send(error.message);
        }
        console.error('Помилка в LiqPay Webhook (Transactions):', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getAdminTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;
        const queryParams = [];
        let baseQuery = `
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;
        if (status && status !== 'all') {
            baseQuery += ` AND t.status = ?`;
            queryParams.push(status);
        }
        if (search) {
            baseQuery += ` AND (u.email LIKE ? OR t.id LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        if (startDate) {
            baseQuery += ` AND t.created_at >= ?`;
            queryParams.push(startDate + " 00:00:00");
        }
        if (endDate) {
            baseQuery += ` AND t.created_at <= ?`;
            queryParams.push(endDate + " 23:59:59");
        }
        const [countResult] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, queryParams);
        const total = countResult[0].total;
        const dataQuery = `
            SELECT 
                t.id, t.amount, t.currency, t.status, t.description, t.created_at, t.provider_id,
                u.id as user_id, u.email as user_email, u.username as user_name, u.slug as user_slug, u.avatar_url as user_avatar
            ${baseQuery}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...queryParams, parseInt(limit), parseInt(offset)];
        const [transactions] = await db.query(dataQuery, dataParams);
        let summaryQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN t.status = 'success' THEN t.amount ELSE 0 END), 0) AS totalEarned,
                COUNT(CASE WHEN t.status = 'success' AND t.created_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01') THEN 1 END) AS successfulThisMonth,
                COUNT(CASE WHEN t.status = 'pending' THEN 1 END) AS pendingCount
            ${baseQuery}
        `;
        const [summaryResult] = await db.query(summaryQuery, queryParams);
        const summary = {
            totalEarned: Number(summaryResult[0].totalEarned).toFixed(2),
            successfulThisMonth: summaryResult[0].successfulThisMonth,
            pendingCount: summaryResult[0].pendingCount
        };
        res.json({
            transactions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            summary
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Помилка сервера при завантаженні транзакцій' });
    }
};

exports.getAdminOrders = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;
        const queryParams = [];
        let baseQuery = `
            FROM orders o
            JOIN sites s ON o.site_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE 1=1
        `;
        if (status && status !== 'all') {
            baseQuery += ` AND o.status = ?`;
            queryParams.push(status);
        }
        if (search) {
            baseQuery += ` AND (o.id LIKE ? OR o.customer_email LIKE ? OR s.title LIKE ?)`;
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (startDate) {
            baseQuery += ` AND o.created_at >= ?`;
            queryParams.push(startDate + " 00:00:00");
        }
        if (endDate) {
            baseQuery += ` AND o.created_at <= ?`;
            queryParams.push(endDate + " 23:59:59");
        }
        const [countResult] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, queryParams);
        const total = countResult[0].total;
        const dataQuery = `
            SELECT 
                o.id, o.total_amount as amount, 'UAH' as currency, o.status, 
                o.created_at, o.customer_email, o.customer_name, o.customer_phone,
                s.title as site_title, s.site_path, s.logo_url as site_logo,
                u.id as owner_id, u.email as owner_email, u.username as owner_name, u.slug as owner_slug, u.avatar_url as owner_avatar,
                (SELECT GROUP_CONCAT(product_name SEPARATOR ', ') FROM order_items WHERE order_id = o.id) as products
            ${baseQuery}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...queryParams, parseInt(limit), parseInt(offset)];
        const [orders] = await db.query(dataQuery, dataParams);
        const summaryQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN o.status IN ('paid', 'shipped', 'completed') THEN o.total_amount ELSE 0 END), 0) AS totalVolume,
                COUNT(CASE WHEN o.status IN ('paid', 'shipped', 'completed') AND o.created_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01') THEN 1 END) AS successfulThisMonth,
                COUNT(*) AS totalOrders
            ${baseQuery}
        `;
        const [summaryResult] = await db.query(summaryQuery, queryParams);
        res.json({
            orders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            summary: {
                totalEarned: Number(summaryResult[0].totalVolume).toFixed(2),
                successfulThisMonth: summaryResult[0].successfulThisMonth,
                pendingCount: summaryResult[0].totalOrders
            }
        });
    } catch (error) {
        console.error('Error fetching admin orders:', error);
        res.status(500).json({ message: 'Помилка сервера при завантаженні замовлень' });
    }
};