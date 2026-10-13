// backend/repositories/TemplateRepository.js
const db = require('../config/db');

const executor = (connection) => connection || db;

class TemplateRepository {
    static async findPublicSystem(includeDrafts) {
        let query = "SELECT id, name, description, icon, thumbnail_url, default_block_content, is_ready, access_level FROM templates WHERE type = 'system' AND is_ready = 1";
        if (includeDrafts) {
            query += " AND access_level IN ('public', 'admin_only')";
        } else {
            query += " AND access_level = 'public'";
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await db.query(query);
        return rows;
    }

    static async findById(templateId, connection) {
        const [templates] = await executor(connection).query('SELECT * FROM templates WHERE id = ?', [templateId]);
        return templates[0];
    }
}

module.exports = TemplateRepository;
