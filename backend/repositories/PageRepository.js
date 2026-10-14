// backend/repositories/PageRepository.js
const db = require('../config/db');

const executor = (connection) => connection || db;

class PageRepository {
    static async create(pageData) {
        const { site_id, name, slug, block_content, is_homepage = 0 } = pageData;
        const [result] = await db.query(
            'INSERT INTO pages (site_id, name, slug, block_content, is_homepage) VALUES (?, ?, ?, ?, ?)',
            [site_id, name, slug, JSON.stringify(block_content), is_homepage]
        );
        return { id: result.insertId, ...pageData };
    }

    static async createFromTemplate(page, connection) {
        const { site_id, name, slug, block_content, is_homepage, seo_title, seo_description } = page;
        await executor(connection).query(
            'INSERT INTO pages (site_id, name, slug, block_content, is_homepage, seo_title, seo_description) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [site_id, name, slug, JSON.stringify(block_content), is_homepage, seo_title, seo_description]
        );
    }

    static async deleteBySiteId(siteId, connection) {
        await executor(connection).query('DELETE FROM pages WHERE site_id = ?', [siteId]);
    }

    static async findById(pageId) {
        const [rows] = await db.query('SELECT * FROM pages WHERE id = ?', [pageId]);
        if (rows[0] && typeof rows[0].block_content === 'string') {
            rows[0].block_content = JSON.parse(rows[0].block_content);
        }
        return rows[0];
    }

    static async findBySiteId(siteId) {
        const [rows] = await db.query(
            'SELECT id, name, slug, is_homepage, created_at FROM pages WHERE site_id = ? ORDER BY created_at ASC',
            [siteId]
        );
        return rows;
    }

    static async findBySiteIdAndSlug(siteId, slug) {
        const [rows] = await db.query(
            'SELECT * FROM pages WHERE site_id = ? AND slug = ?',
            [siteId, slug]
        );
        if (rows[0] && typeof rows[0].block_content === 'string') {
            rows[0].block_content = JSON.parse(rows[0].block_content);
        }
        return rows[0];
    }

    static async findHomepageBySiteId(siteId) {
        const [rows] = await db.query(
            'SELECT * FROM pages WHERE site_id = ? AND is_homepage = 1',
            [siteId]
        );
        if (rows[0] && typeof rows[0].block_content === 'string') {
            rows[0].block_content = JSON.parse(rows[0].block_content);
        }
        return rows[0];
    }
    
    static async updateContent(pageId, blockContent) {
        const [result] = await db.query(
            'UPDATE pages SET block_content = ? WHERE id = ?',
            [JSON.stringify(blockContent), pageId]
        );
        return result;
    }

    static async updateSettings(pageId, { name, slug, seo_title, seo_description, seo_keywords }) {
        const [result] = await db.query(
            'UPDATE pages SET name = ?, slug = ?, seo_title = ?, seo_description = ?, seo_keywords = ? WHERE id = ?',
            [name, slug, seo_title || null, seo_description || null, seo_keywords || null, pageId]
        );
        return result;
    }

    static async delete(pageId) {
        const [result] = await db.query('DELETE FROM pages WHERE id = ?', [pageId]);
        return result;
    }

    static async setHomepage(siteId, pageId) {
        await db.withTransaction(async (connection) => {
            await connection.query(
                'UPDATE pages SET is_homepage = 0 WHERE site_id = ?',
                [siteId]
            );
            await connection.query(
                'UPDATE pages SET is_homepage = 1 WHERE id = ? AND site_id = ?',
                [pageId, siteId]
            );
        });
        return true;
    }

    static async findSiteInfo(pageId) {
        const [rows] = await db.query('SELECT site_id, is_homepage FROM pages WHERE id = ?', [pageId]);
        return rows[0] || null;
    }

    static async countBySiteId(siteId) {
        const [rows] = await db.query('SELECT COUNT(id) as count FROM pages WHERE site_id = ?', [siteId]);
        return rows[0].count;
    }
}

module.exports = PageRepository;