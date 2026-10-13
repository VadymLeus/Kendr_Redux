// backend/repositories/GlobalSettingsRepository.js
const db = require('../config/db');

class GlobalSettingsRepository {
    static async findBilling() {
        const [rows] = await db.query('SELECT billing_enabled FROM global_settings LIMIT 1');
        return rows && rows.length > 0 ? rows[0] : null;
    }

    static async findSiteCreation() {
        const [rows] = await db.query('SELECT site_creation_enabled FROM global_settings LIMIT 1');
        return rows && rows.length > 0 ? rows[0] : null;
    }
}

module.exports = GlobalSettingsRepository;
