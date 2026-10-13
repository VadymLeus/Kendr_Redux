// backend/repositories/OrderRepository.js
const db = require('../config/db');

const executor = (connection) => connection || db;

class OrderRepository {
    static transaction(work) {
        return db.withTransaction(work);
    }

    static async findSiteForPayment(siteId, connection) {
        const [sites] = await executor(connection).query(
            'SELECT user_id, liqpay_public_key, liqpay_private_key, is_online_payment_enabled, is_cod_enabled FROM sites WHERE id = ?',
            [siteId]
        );
        return sites[0];
    }

    static async findSiteForCallback(siteId) {
        const [sites] = await db.query('SELECT liqpay_private_key, site_theme_accent FROM sites WHERE id = ?', [siteId]);
        return sites[0];
    }

    static async findSiteOwnerAndAccent(siteId, connection) {
        const [sites] = await executor(connection).query('SELECT user_id, site_theme_accent FROM sites WHERE id = ?', [siteId]);
        return sites[0];
    }

    static async isCollaborator(siteId, userId, connection) {
        const [collaborators] = await executor(connection).query(
            'SELECT site_id FROM site_collaborators WHERE site_id = ? AND user_id = ?',
            [siteId, userId]
        );
        return collaborators.length > 0;
    }

    static async findCustomer(userId, connection) {
        const [users] = await executor(connection).query('SELECT username, email FROM users WHERE id = ?', [userId]);
        return users[0];
    }

    static async countPending(siteId, userId, email, phone, connection) {
        let spamQuery = `SELECT COUNT(*) as count FROM orders WHERE site_id = ? AND status = 'pending' AND (customer_id = ? OR customer_email = ?`;
        let spamParams = [siteId, userId, email];
        if (phone && phone.trim() !== '') {
            spamQuery += ` OR customer_phone = ?`;
            spamParams.push(phone);
        }
        spamQuery += `)`;
        const [pendingOrders] = await executor(connection).query(spamQuery, spamParams);
        return pendingOrders[0].count;
    }

    static async create(order, connection) {
        const { id, siteId, customerId, customerName, customerEmail, customerPhone, deliveryAddress, totalAmount, paymentMethod } = order;
        await executor(connection).query(
            `INSERT INTO orders (id, site_id, customer_id, customer_name, customer_email, customer_phone, delivery_address, total_amount, status, payment_method) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [id, siteId, customerId, customerName, customerEmail, customerPhone, deliveryAddress, totalAmount, paymentMethod]
        );
    }

    static async addItem(orderId, item, connection) {
        await executor(connection).query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, type, digital_file_url, options) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [orderId, item.id, item.name, item.quantity, item.price, item.type || 'physical', item.digital_file_url || null, JSON.stringify(item.options)]
        );
    }

    static async findById(orderId, connection) {
        const [orders] = await executor(connection).query('SELECT * FROM orders WHERE id = ?', [orderId]);
        return orders[0];
    }

    static async findByIdAndCustomer(orderId, customerId) {
        const [orders] = await db.query('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, customerId]);
        return orders[0];
    }

    static async findStatsBySite(siteId) {
        const [orderStats] = await db.query(`
            SELECT 
                COUNT(id) as totalOrders,
                SUM(CASE WHEN status IN ('completed', 'paid', 'shipped') THEN 1 ELSE 0 END) as completedOrders,
                SUM(CASE WHEN status IN ('completed', 'paid', 'shipped') THEN total_amount ELSE 0 END) as revenue
            FROM orders 
            WHERE site_id = ?
        `, [siteId]);
        return orderStats[0];
    }

    static async findRecentBySite(siteId, limit) {
        const [recentOrders] = await db.query(`
            SELECT id, customer_name, total_amount, status, created_at
            FROM orders
            WHERE site_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [siteId, limit]);
        return recentOrders;
    }

    static async findBySite(siteId) {
        const [orders] = await db.query('SELECT * FROM orders WHERE site_id = ? ORDER BY created_at DESC', [siteId]);
        return orders;
    }

    static async findByCustomer(customerId) {
        const [orders] = await db.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
        return orders;
    }

    static async findItems(orderId, connection) {
        const [items] = await executor(connection).query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        return items;
    }

    static async findItemsForPayment(orderId) {
        const [items] = await db.query('SELECT product_id, quantity, type FROM order_items WHERE order_id = ?', [orderId]);
        return items;
    }

    static async findItemsWithImages(orderId) {
        const [items] = await db.query(`
                SELECT oi.*, p.image_gallery 
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?
            `, [orderId]);
        return items;
    }

    static async hasPurchased(userId, productId) {
        const [orders] = await db.query(`
            SELECT o.id 
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.customer_id = ? AND oi.product_id = ? AND o.status IN ('paid', 'shipped', 'completed')
            LIMIT 1
        `, [userId, productId]);
        return orders.length > 0;
    }

    static async updateStatus(orderId, status, connection) {
        await executor(connection).query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    }

    static async updateStatusAndTouch(orderId, status, connection) {
        await executor(connection).query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, orderId]);
    }
}

module.exports = OrderRepository;
