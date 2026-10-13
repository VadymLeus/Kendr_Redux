// backend/repositories/TransactionRepository.js
const db = require('../config/db');

const executor = (connection) => connection || db;

class TransactionRepository {
    static transaction(work) {
        return db.withTransaction(work);
    }

    static async create({ id, userId, amount, currency, status, providerId, description }, connection) {
        await executor(connection).query(
            `INSERT INTO transactions (id, user_id, amount, currency, status, provider_id, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, amount, currency, status, providerId, description]
        );
    }

    static async findById(id, connection) {
        const [rows] = await executor(connection).query('SELECT * FROM transactions WHERE id = ?', [id]);
        return rows[0];
    }

    static async markSuccessIfPending(id, providerId, connection) {
        const [result] = await executor(connection).query(
            "UPDATE transactions SET status = 'success', provider_id = ? WHERE id = ? AND status = 'pending'",
            [providerId, id]
        );
        return result.affectedRows === 1;
    }
}

module.exports = TransactionRepository;
