// backend/middleware/trackVisit.js
const crypto = require('crypto');
const db = require('../config/db');
const { verifyAccessToken } = require('../utils/authTokens');

const trackVisit = async (req, res, next) => {
    try {
        const { site_path } = req.params;
        const [sites] = await db.query('SELECT id, user_id FROM sites WHERE site_path = ?', [site_path]);
        if (!sites.length) {
            return next();
        }

        const site = sites[0];
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                if (token) {
                    const decoded = verifyAccessToken(token);
                    if (decoded.id === site.user_id) {
                        return next(); 
                    }
                }
            } catch (e) { 
            }
        }

        const ip = req.ip || req.connection.remoteAddress;
        const ua = req.headers['user-agent'] || '';
        const visitorHash = crypto.createHash('sha256').update(ip + ua).digest('hex');
        const [existing] = await db.query(
            `SELECT id FROM site_visits 
             WHERE site_id = ? AND visitor_hash = ? 
             AND visited_at > NOW() - INTERVAL 24 HOUR`,
            [site.id, visitorHash]
        );

        if (existing.length === 0) {
            await db.query(
                `INSERT INTO site_visits (site_id, visitor_hash) VALUES (?, ?)`,
                [site.id, visitorHash]
            );
            
            await db.query(
                `UPDATE sites SET view_count = view_count + 1 WHERE id = ?`,
                [site.id]
            );
        }
        next();
    } catch (error) {
        console.error("Analytics Error:", error);
        next();
    }
};

module.exports = trackVisit;