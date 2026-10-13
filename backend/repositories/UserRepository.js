// backend/repositories/UserRepository.js
const db = require('../config/db');

class UserRepository {
    static async findRole(userId) {
        const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        return rows[0] ? rows[0].role : null;
    }

    static async findIdByUsername(username) {
        const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        return rows.length > 0 ? rows[0].id : null;
    }

    static async findAuthor(userId) {
        const [rows] = await db.query('SELECT username, email, avatar_url FROM users WHERE id = ?', [userId]);
        return rows[0] || null;
    }
}

module.exports = UserRepository;
