// backend/repositories/SiteRepository.js
const db = require('../config/db');
const { deleteFile } = require('../utils/fileUtils');
const executor = (connection) => connection || db;
const safeParseCategories = (catsData) => {
    if (!catsData) return [];
    if (typeof catsData === 'string') {
        try { return JSON.parse(catsData) || []; } catch (e) { return []; }
    }
    return Array.isArray(catsData) ? catsData : [];
};

class SiteRepository {
  static async getPublic({ searchTerm = '', userId = null, tag = null, sort = 'new', onlyFavorites = false, currentUserId = null, includeAllStatuses = false }) {
    let query = `
        SELECT DISTINCT
            s.id, s.site_path, s.title, s.logo_url, s.status, s.view_count, s.created_at,
            s.cover_image, s.cover_layout, s.site_theme_accent, s.site_theme_mode,
            s.cover_logo_size, s.cover_logo_radius, s.cover_title_size,
            s.is_pinned, s.currency, 
            s.is_online_payment_enabled, s.is_cod_enabled,
            s.cookie_banner_enabled, s.cookie_banner_text,
            s.cookie_banner_size, s.cookie_banner_position, s.cookie_banner_blur,
            s.user_id,
            u.username AS author, u.slug AS author_slug, u.avatar_url AS author_avatar
        FROM sites s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN site_tags st ON s.id = st.site_id 
        LEFT JOIN site_collaborators sc ON s.id = sc.site_id
    `;
    
    if (onlyFavorites && currentUserId) {
        query += ` JOIN user_favorites uf ON s.id = uf.site_id AND uf.user_id = ${db.escape(currentUserId)} `;
    }
    const params = [];
    const conditions = [];
    if (!includeAllStatuses) {
        conditions.push("s.status IN ('published', 'public', 'maintenance')");
    }

    if (userId) {
        conditions.push('(s.user_id = ? OR sc.user_id = ?)');
        params.push(userId, userId);
    }

    if (searchTerm) {
        conditions.push('s.title LIKE ?');
        params.push(`%${searchTerm}%`);
    }

    if (tag) {
        conditions.push('st.tag_id = ?');
        params.push(tag);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    let orderByClause = 'ORDER BY s.is_pinned DESC, s.created_at DESC';
    if (sort) {
        if (sort === 'popular') {
            orderByClause = 'ORDER BY s.is_pinned DESC, s.view_count DESC, s.created_at DESC';
        } else {
            const parts = sort.split(':');
            if (parts.length === 2) {
                const field = parts[0];
                const dir = parts[1].toUpperCase();
                const allowedFields = {
                    'created_at': 's.created_at',
                    'view_count': 's.view_count',
                    'title': 's.title',
                    'author': 'u.username',
                    'popularity': 's.view_count'
                };
                const validDir = (dir === 'ASC' || dir === 'DESC') ? dir : 'DESC';
                if (allowedFields[field]) {
                    orderByClause = `ORDER BY s.is_pinned DESC, ${allowedFields[field]} ${validDir}`;
                }
            }
        }
    }
    query += ` ${orderByClause}`;
    const [rows] = await db.query(query, params);
    for (let site of rows) {
        site.tags = await SiteRepository.findTags(site.id);
    }
    return rows;
  }

  static async findAllForAdmin() {
    const [rows] = await db.query(`
        SELECT
             s.id, s.site_path, s.title, s.logo_url, s.status, s.deletion_scheduled_for, s.currency,
             u.username AS author, u.slug AS author_slug
        FROM sites s
        JOIN users u ON s.user_id = u.id
        ORDER BY s.updated_at DESC
    `);
    return rows;
  }

  static async findByPath(sitePath) {
    const [sites] = await db.query(`
        SELECT
            s.id, s.user_id, s.title, s.logo_url, s.status,
            s.view_count, s.site_theme_mode, s.site_theme_accent,
            s.site_path, s.theme_settings, s.dashboard_config, s.header_content, s.footer_content, s.footer_layout,
            s.favicon_url, s.site_title_seo,
            s.cover_image, s.cover_layout,
            s.cover_logo_size,
            s.cover_logo_radius,
            s.cover_title_size,
            s.liqpay_public_key, s.liqpay_private_key, s.currency,
            s.is_online_payment_enabled, s.is_cod_enabled,
            s.cookie_banner_enabled, s.cookie_banner_text,
            s.cookie_banner_size, s.cookie_banner_position, s.cookie_banner_blur
        FROM sites s
        WHERE s.site_path = ?
    `, [sitePath]);
    
    if (!sites[0]) return null;
    const site = sites[0];
    try {
        if (typeof site.theme_settings === 'string') site.theme_settings = JSON.parse(site.theme_settings);
        if (typeof site.dashboard_config === 'string') site.dashboard_config = JSON.parse(site.dashboard_config);
        if (typeof site.header_content === 'string') site.header_content = JSON.parse(site.header_content);
        if (typeof site.footer_content === 'string') site.footer_content = JSON.parse(site.footer_content);
    } catch (error) {
        console.error('Error parsing JSON fields for site:', sitePath, error);
        site.theme_settings = site.theme_settings || {};
        site.dashboard_config = site.dashboard_config || { hiddenTabs: [] };
        site.header_content = site.header_content || [];
        site.footer_content = site.footer_content || [];
    }
    const [productRows] = await db.query(`
        SELECT p.*,
            IF(c.id IS NOT NULL,
                JSON_ARRAY(
                    JSON_OBJECT('id', c.id, 'name', c.name, 'discount_percentage', c.discount_percentage)
                ),
                '[]'
            ) AS categories
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.site_id = ?
        ORDER BY p.created_at DESC
    `, [site.id]);
    productRows.forEach(product => {
        product.categories = safeParseCategories(product.categories);
    });
    return { ...site, products: productRows };
  }

  static async findWithCollaborator(siteId, userId) {
    const [rows] = await db.query(`
        SELECT s.*, sc.role AS collaborator_role, sc.permissions AS collaborator_permissions
        FROM sites s
        LEFT JOIN site_collaborators sc ON sc.site_id = s.id AND sc.user_id = ?
        WHERE s.id = ?
    `, [userId, siteId]);
    return rows[0] || null;
  }

  static async findAllByUserId(userId) {
    const [rows] = await db.query('SELECT * FROM sites WHERE user_id = ?', [userId]);
    return rows;
  }

  static async countByOwner(userId, connection) {
    const [rows] = await executor(connection).query('SELECT COUNT(*) AS count FROM sites WHERE user_id = ?', [userId]);
    return rows[0].count;
  }
  
  static async create(userId, sitePath, title, logoUrl, connection) {
    const [result] = await executor(connection).query(
      'INSERT INTO sites (user_id, site_path, title, logo_url, status, currency) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, sitePath, title, logoUrl, 'private', 'UAH']
    );
    return { 
      id: result.insertId, 
      user_id: userId, 
      site_path: sitePath, 
      title: title, 
      logo_url: logoUrl, 
      status: 'private',
      currency: 'UAH'
    };
  }

  static async updateSettings(siteId, data) {
    const { 
      title, status, site_theme_mode, site_theme_accent, theme_settings, dashboard_config,
      header_content, footer_content, favicon_url, site_title_seo, 
      cover_image, cover_layout, logo_url,
      cover_logo_size, cover_logo_radius, cover_title_size,
      liqpay_public_key, liqpay_private_key, currency,
      is_online_payment_enabled, is_cod_enabled,
      cookie_banner_enabled, cookie_banner_text,
      cookie_banner_size, cookie_banner_position, cookie_banner_blur
    } = data;
    
    const safeStringify = (obj) => {
      if (!obj) return null;
      try { return JSON.stringify(obj); } 
      catch (error) { return null; }
    };
    let safeFaviconUrl = null;
    if (typeof favicon_url === 'string') safeFaviconUrl = favicon_url;
    const params = [
        title, 
        status, 
        site_theme_mode || 'light',
        site_theme_accent || 'orange',
        safeStringify(theme_settings),
        safeStringify(dashboard_config),
        safeStringify(header_content),
        safeStringify(footer_content),
        safeFaviconUrl,
        site_title_seo || null,
        cover_image || null,
        cover_layout || 'centered',
        logo_url,
        cover_logo_size !== undefined ? cover_logo_size : 80,
        cover_logo_radius !== undefined ? cover_logo_radius : 0,
        cover_title_size !== undefined ? cover_title_size : 24,
        liqpay_public_key || null,
        liqpay_private_key || null,
        is_online_payment_enabled !== undefined ? is_online_payment_enabled : 1,
        is_cod_enabled !== undefined ? is_cod_enabled : 1,
        currency || 'UAH',
        cookie_banner_enabled ? 1 : 0,
        cookie_banner_text || null,
        cookie_banner_size || 'medium',
        cookie_banner_position || 'bottom-center',
        cookie_banner_blur ? 1 : 0,
        siteId
    ];

    const query = `
        UPDATE sites 
        SET 
            title = ?, 
            status = ?, 
            site_theme_mode = ?, 
            site_theme_accent = ?,
            theme_settings = ?,
            dashboard_config = ?,
            header_content = ?,
            footer_content = ?,
            favicon_url = ?, 
            site_title_seo = ?,
            cover_image = ?, 
            cover_layout = ?,
            logo_url = ?,
            cover_logo_size = ?,
            cover_logo_radius = ?,
            cover_title_size = ?,
            liqpay_public_key = ?,
            liqpay_private_key = ?,
            is_online_payment_enabled = ?,
            is_cod_enabled = ?,
            currency = ?,
            cookie_banner_enabled = ?,
            cookie_banner_text = ?,
            cookie_banner_size = ?,
            cookie_banner_position = ?,
            cookie_banner_blur = ?
        WHERE id = ?
    `;
    const [result] = await db.query(query, params);
    return result;
  }

  static async updateStatus(siteId, status, deletionDate = null) {
    const [result] = await db.query(
          'UPDATE sites SET status = ?, deletion_scheduled_for = ? WHERE id = ?',
        [status, deletionDate, siteId]
    );
    return result;
  }

  static async incrementViewCount(siteId) {
    await db.query('UPDATE sites SET view_count = view_count + 1 WHERE id = ?', [siteId]);
  }

  static async updateTags(siteId, tagIds = []) {
    await db.withTransaction(async (connection) => {
        await connection.query('DELETE FROM site_tags WHERE site_id = ?', [siteId]);
        if (tagIds.length > 0) {
            const values = tagIds.map(tagId => [siteId, tagId]);
            await connection.query('INSERT INTO site_tags (site_id, tag_id) VALUES ?', [values]);
        }
    });
  }

  static async delete(siteId) {
    const [result] = await db.query('DELETE FROM sites WHERE id = ?', [siteId]);
    return result;
  }

  static async deleteAllByUserId(userId) {
    const [result] = await db.query('DELETE FROM sites WHERE user_id = ?', [userId]);
    return result;
  }

  static async deleteByPathAndUserId(sitePath, userId) {
    const [sites] = await db.query(
      'SELECT id, logo_url FROM sites WHERE site_path = ? AND user_id = ?',
      [sitePath, userId]
    );
    if (sites.length === 0) return null;
    const siteToDelete = sites[0];
    const { id: siteId, logo_url: logoUrl } = siteToDelete;
    const result = await this.delete(siteId);
    if (logoUrl && !logoUrl.includes('/default/')) {
      await deleteFile(logoUrl);
    }
    return result;
  }

  static async getUserSites(userId) {
    const [rows] = await db.query(`
      SELECT s.id, s.site_path, s.title, s.logo_url, s.status, s.currency,
             s.cover_image, s.cover_layout, s.site_theme_accent, s.site_theme_mode,
             s.cover_logo_size, s.cover_logo_radius, s.cover_title_size,
             s.is_pinned, s.view_count, s.created_at, 
             s.is_online_payment_enabled, s.is_cod_enabled,
             s.cookie_banner_enabled, s.cookie_banner_text,
             s.cookie_banner_size, s.cookie_banner_position, s.cookie_banner_blur
      FROM sites s 
      WHERE s.user_id = ? 
      ORDER BY s.is_pinned DESC, s.updated_at DESC
    `, [userId]);
    for (let site of rows) {
        site.tags = await SiteRepository.findTags(site.id);
    }
    return rows;
  }
  static async findSuspendedForUser(userId) {
    const [rows] = await db.query(
      "SELECT id, site_path, title, deletion_scheduled_for FROM sites WHERE user_id = ? AND status = 'suspended'",
      [userId]
    );
    return rows;
  }
  static transaction(work) {
    return db.withTransaction(work);
  }

  static async existsByPath(sitePath, connection) {
    const [rows] = await executor(connection).query('SELECT id FROM sites WHERE site_path = ?', [sitePath]);
    return rows.length > 0;
  }

  static async findInfoById(siteId) {
    const [sites] = await db.query(`
        SELECT s.site_path, s.title, s.is_online_payment_enabled, s.is_cod_enabled,
               u.username as author, u.email as author_email, u.avatar_url as author_avatar
        FROM sites s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
    `, [siteId]);
    return sites[0] || null;
  }

  static async findLock(siteId) {
    const [rows] = await db.query('SELECT locked_by_user_id, locked_until FROM sites WHERE id = ?', [siteId]);
    return rows[0];
  }

  static async findOwnerAndStats(siteId) {
    const [rows] = await db.query('SELECT user_id, view_count, currency FROM sites WHERE id = ?', [siteId]);
    return rows[0] || null;
  }

  static async findTags(siteId) {
    const [tags] = await db.query(`
        SELECT t.id, t.name 
        FROM tags t
        JOIN site_tags st ON t.id = st.tag_id
        WHERE st.site_id = ?
    `, [siteId]);
    return tags;
  }

  static async applyContent(siteId, { header, footer, themeSettings, mode, accent }, connection) {
    await executor(connection).query(
      'UPDATE sites SET header_content = ?, footer_content = ?, theme_settings = ?, site_theme_mode = ?, site_theme_accent = ? WHERE id = ?',
      [JSON.stringify(header), JSON.stringify(footer), JSON.stringify(themeSettings), mode, accent, siteId]
    );
  }

  static async rename(oldPath, newPath, userId) {
    const [result] = await db.query('UPDATE sites SET site_path = ? WHERE site_path = ? AND user_id = ?', [newPath, oldPath, userId]);
    return result;
  }

  static async findSuspendedWithAppeals(userId) {
    const [sites] = await db.query(`
        SELECT s.id, s.site_path, s.title, s.logo_url, s.deletion_scheduled_for,
               sa.status as appeal_status, sa.ticket_id, st.status as ticket_status,
               (SELECT reason_note FROM user_warnings WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1) as suspension_reason
        FROM sites s
        LEFT JOIN site_appeals sa ON s.id = sa.site_id
        LEFT JOIN support_tickets st ON sa.ticket_id = st.id
        WHERE s.user_id = ? AND s.status = 'suspended'
    `, [userId]);
    return sites;
  }

  static async findAllAccessible(userId) {
    const [sites] = await db.query(`
        SELECT DISTINCT s.*, 
               u.username as author, u.email as author_email, u.avatar_url as author_avatar,
               IF(s.user_id = ?, 'owner', sc.role) as user_access_role
        FROM sites s
        LEFT JOIN site_collaborators sc ON s.id = sc.site_id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.user_id = ? OR sc.user_id = ?
        ORDER BY s.created_at DESC
    `, [userId, userId, userId]);
    return sites;
  }

  static async togglePin(siteId) {
    await db.query('UPDATE sites SET is_pinned = NOT is_pinned WHERE id = ?', [siteId]);
    const [rows] = await db.query('SELECT is_pinned FROM sites WHERE id = ?', [siteId]);
    return rows[0] ? !!rows[0].is_pinned : false;
  }
  static async setAllUserSitesToMaintenance(userId) {
      const [result] = await db.query("UPDATE sites SET status = 'maintenance' WHERE user_id = ?", [userId]);
      return result;
  }
}

module.exports = SiteRepository;