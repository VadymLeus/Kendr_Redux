// backend/models/Warning.js
const db = require('../config/db');

class Warning {
    static async create(userId, siteId, reason = null) {
        await db.query(
            'INSERT INTO user_warnings (user_id, site_id, reason_note) VALUES (?, ?, ?)',
            [userId, siteId, reason]
        );
    }

    static async countForUser(userId) {
        const [rows] = await db.query('SELECT COUNT(id) as warningCount FROM user_warnings WHERE user_id = ?', [userId]);
        return rows[0].warningCount;
    }

    static async removeBySiteId(siteId) {
        await db.query('DELETE FROM user_warnings WHERE site_id = ?', [siteId]);
    }

    static async findForUser(userId) {
        const [rows] = await db.query('SELECT id, site_id, reason_note, created_at FROM user_warnings WHERE user_id = ? ORDER BY created_at ASC', [userId]);
        return rows;
    }
}

module.exports = Warning;