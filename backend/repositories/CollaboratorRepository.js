// backend/repositories/CollaboratorRepository.js
const db = require('../config/db');

class CollaboratorRepository {
    static async findBySiteAndUser(siteId, userId) {
        const [rows] = await db.query(
            'SELECT role, permissions FROM site_collaborators WHERE site_id = ? AND user_id = ?',
            [siteId, userId]
        );
        return rows[0] || null;
    }
}

module.exports = CollaboratorRepository;
