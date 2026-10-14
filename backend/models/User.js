// backend/models/User.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
class User {
    static async generateSlug(text) {
        const cyrillicToLatin = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ie', 'ж': 'zh', 'з': 'z',
            'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
            'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
            'ь': '', 'ю': 'iu', 'я': 'ia', 'ы': 'y', 'э': 'e', 'ъ': '', 'ё': 'io'
        };
        let baseSlug = text.toLowerCase().split('').map(char => cyrillicToLatin[char] || char).join('');
        baseSlug = baseSlug.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        if (!baseSlug) baseSlug = 'user';
        let slug = baseSlug;
        let counter = 1;
        while (await this.findBySlug(slug)) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }
        return slug;
    }

    static async create({ username, slug, email, password, avatar_url, is_verified, google_id }) {
        let password_hash = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            password_hash = await bcrypt.hash(password, salt);
        }
        const [result] = await db.query(
            'INSERT INTO users (username, slug, email, password_hash, avatar_url, is_verified, google_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, slug, email, password_hash, avatar_url, is_verified || 0, google_id || null]
        );
        return { id: result.insertId, username, slug, email, avatar_url };
    }

    static async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.query(
            `SELECT id, username, slug, email, phone_number, role, status, plan, deleted_at, token_version,
            platform_theme_mode, platform_theme_accent, 
            bio, social_telegram, social_instagram, social_website, is_profile_public,
            created_at, avatar_url, last_login_at 
            FROM users WHERE id = ?`,
            [id]
        );
        return rows[0];
    }
    
    static async findByUsername(username) {
        const [rows] = await db.query(
            `SELECT id, username, slug, email, role, status, plan, deleted_at,
            platform_theme_mode, platform_theme_accent, 
            bio, social_telegram, social_instagram, social_website, is_profile_public,
            created_at, avatar_url 
            FROM users WHERE username = ?`,
            [username]
        );
        return rows[0];
    }

    static async findBySlug(slug) {
        const [rows] = await db.query(
            `SELECT id, username, slug, email, role, status, plan, deleted_at,
            platform_theme_mode, platform_theme_accent, 
            bio, social_telegram, social_instagram, social_website, is_profile_public,
            created_at, avatar_url 
            FROM users WHERE slug = ?`,
            [slug]
        );
        return rows[0];
    }
    
    static async getSiteCount(userId) {
        const [rows] = await db.query("SELECT COUNT(id) as siteCount FROM sites WHERE user_id = ? AND status = 'published'", [userId]);
        return rows[0].siteCount;
    }

    static async getTotalSiteViews(userId) {
        const [rows] = await db.query(
            "SELECT COALESCE(SUM(view_count), 0) as totalViews FROM sites WHERE user_id = ? AND status = 'published'", 
            [userId]
        );
        return rows[0].totalViews; 
    }

    static async update(userId, data) {
        const { 
            username, slug, password, password_hash,
            avatar_url, phone_number,
            platform_theme_mode, platform_theme_accent,
            bio, social_telegram, social_instagram, social_website, is_profile_public
        } = data;
        let queryParts = [];
        const params = [];
        if (username !== undefined) { queryParts.push('username = ?'); params.push(username); }
        if (slug !== undefined) { queryParts.push('slug = ?'); params.push(slug); }
        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(password, salt);
            queryParts.push('password_hash = ?'); params.push(hashed);
        } 
        else if (password_hash !== undefined) {
            queryParts.push('password_hash = ?'); params.push(password_hash);
        }
        if (avatar_url !== undefined) { queryParts.push('avatar_url = ?'); params.push(avatar_url); }
        if (phone_number !== undefined) { queryParts.push('phone_number = ?'); params.push(phone_number); }
        if (platform_theme_mode !== undefined) { queryParts.push('platform_theme_mode = ?'); params.push(platform_theme_mode); }
        if (platform_theme_accent !== undefined) { queryParts.push('platform_theme_accent = ?'); params.push(platform_theme_accent); }
        if (bio !== undefined) { queryParts.push('bio = ?'); params.push(bio); }
        if (social_telegram !== undefined) { queryParts.push('social_telegram = ?'); params.push(social_telegram); }
        if (social_instagram !== undefined) { queryParts.push('social_instagram = ?'); params.push(social_instagram); }
        if (social_website !== undefined) { queryParts.push('social_website = ?'); params.push(social_website); }
        if (is_profile_public !== undefined) { queryParts.push('is_profile_public = ?'); params.push(is_profile_public); }
        if (queryParts.length === 0) {
            return this.findById(userId);
        }
        let query = `UPDATE users SET ${queryParts.join(', ')} WHERE id = ?`;
        params.push(userId);
        await db.query(query, params);
        return this.findById(userId);
    }

    static async changePassword(userId, passwordHash) {
        await db.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [passwordHash, userId]);
    }

    static async updateLastLogin(userId) {
        await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    }
    
    static async deleteById(userId) {
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [userId]);
        return result;
    }

    static async softDeleteUser(userId) {
        const [result] = await db.query(`UPDATE users SET status = 'deleted', deleted_at = NOW() WHERE id = ?`, [userId]);
        return result;
    }

    static async restoreFromSoftDelete(userId) {
        const [result] = await db.query(`UPDATE users SET status = 'active', deleted_at = NULL WHERE id = ?`, [userId]);
        return result;
    }

    static async suspendUser(userId) {
        const query = `
            UPDATE users 
            SET status = 'suspended',
                password_hash = NULL,
                avatar_url = NULL,
                bio = NULL,
                social_telegram = NULL,
                social_instagram = NULL,
                social_website = NULL,
                is_verified = 0,
                otp_code = NULL,
                otp_expires = NULL,
                otp_purpose = NULL,
                google_id = NULL
            WHERE id = ?
        `;
        const [result] = await db.query(query, [userId]);
        return result;
    }

    static async restoreUser(userId) {
        const query = `UPDATE users SET status = 'active' WHERE id = ?`;
        const [result] = await db.query(query, [userId]);
        return result;
    }
    
    static async findByLoginInput(loginInput) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ? OR username = ? OR slug = ?', [loginInput, loginInput, loginInput]);
        return rows[0];
    }

    static async hasPassword(id) {
        const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [id]);
        return rows[0] && rows[0].password_hash !== null && rows[0].password_hash !== '';
    }
}

module.exports = User;