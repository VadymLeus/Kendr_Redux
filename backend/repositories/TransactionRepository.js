// backend/repositories/TransactionRepository.js
const db = require('../config/db');

class TransactionRepository {
    static async create({ id, userId, amount, currency, status, providerId, description }, connection) {
        await (connection || db).query(
            `INSERT INTO transactions (id, user_id, amount, currency, status, provider_id, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, amount, currency, status, providerId, description]
        );
    }
}

module.exports = TransactionRepository;
