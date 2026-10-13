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

    static async findPlan(userId) {
        const [rows] = await db.query('SELECT plan FROM users WHERE id = ?', [userId]);
        return rows[0] ? rows[0].plan : null;
    }

    static async findPlanForUpdate(userId, connection) {
        const [rows] = await connection.query('SELECT plan FROM users WHERE id = ? FOR UPDATE', [userId]);
        return rows[0] ? rows[0].plan : null;
    }

    static async setPlan(userId, plan, connection) {
        await (connection || db).query('UPDATE users SET plan = ? WHERE id = ?', [plan, userId]);
    }

    static async findAuthor(userId) {
        const [rows] = await db.query('SELECT username, email, avatar_url FROM users WHERE id = ?', [userId]);
        return rows[0] || null;
    }
}

module.exports = UserRepository;
