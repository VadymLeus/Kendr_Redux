// backend/controllers/siteController.js
const SiteRepository = require('../repositories/SiteRepository');
const PageRepository = require('../repositories/PageRepository');
const db = require('../config/db');
const fs = require('fs').promises;
const path = require('path');
const { deleteFile } = require('../utils/fileUtils');
const { encrypt } = require('../utils/encryption');
const { v4: uuidv4 } = require('uuid');
const regenerateBlockIds = (blocks) => {
    if (!blocks) return [];
    const mapBlock = (block) => {
        const newBlock = { ...block, block_id: uuidv4() };
        if (newBlock.data && newBlock.data.columns && Array.isArray(newBlock.data.columns)) {
            newBlock.data.columns = newBlock.data.columns.map(col => col.map(child => mapBlock(child)));
        }
        if (newBlock.data && newBlock.data.items && Array.isArray(newBlock.data.items)) {
            newBlock.data.items = newBlock.data.items.map(item => ({...item, id: uuidv4()}));
        }
        return newBlock;
    };
    return Array.isArray(blocks) ? blocks.map(mapBlock) : blocks;
};

const getGlobalSettings = async () => {
    try {
        const [rows] = await db.query('SELECT site_creation_enabled FROM global_settings LIMIT 1');
        if (rows && rows.length > 0) return rows[0];
    } catch (e) {
        console.warn('Таблиця global_settings не знайдена або порожня.');
    }
    return { site_creation_enabled: 1 };
};

const RESERVED_SLUGS = [
    'admin', 'api', 'login', 'register', 'support', 'test', 'www', 
    'billing', 'orders', 'dashboard', 'sites', 'media', 'settings', 
    'auth', 'user', 'users', 'system', 'root', 'static', 'assets', 'create'
];
const BAD_SEQUENCES = ['12345', 'qwerty', 'asdfgh', 'zxcvbn', 'password', '123123', 'qweqwe', 'йцукен'];
const validateSlugOnly = (slug) => {
    if (!slug || typeof slug !== 'string') return 'URL сайту обов\'язковий';
    const trimmedSlug = slug.toLowerCase().trim();
    if (trimmedSlug.length < 3 || trimmedSlug.length > 40) return 'URL сайту має бути від 3 до 40 символів';
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) return 'URL може містити лише малі латинські літери, цифри та дефіс';
    if (trimmedSlug.startsWith('-') || trimmedSlug.endsWith('-')) return 'URL не може починатися або закінчуватися дефісом';
    if (trimmedSlug.includes('--')) return 'URL не може містити два дефіси підряд';
    if (RESERVED_SLUGS.includes(trimmedSlug)) return 'Цей URL зарезервовано системою';
    const isRepetitive = /(.)\1{4,}/.test(trimmedSlug);
    if (isRepetitive || BAD_SEQUENCES.some(seq => trimmedSlug.includes(seq))) {
        return 'Ця адреса містить заборонену або занадто просту послідовність символів';
    }
    return null;
};

const validateSiteCreation = (title, slug) => {
    if (!title || typeof title !== 'string') return 'Назва сайту обов\'язкова';
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 60) return 'Назва сайту має бути від 2 до 60 символів';
    if (/[<>]/.test(trimmedTitle)) return 'Назва сайту містить недопустимі символи (<, >)';
    return validateSlugOnly(slug);
};

exports.getSiteInfoById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [sites] = await db.query(`
            SELECT s.site_path, s.title, s.is_online_payment_enabled, s.is_cod_enabled,
                   u.username as author, u.email as author_email, u.avatar_url as author_avatar
            FROM sites s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [id]);
        if (sites.length === 0) {
            return res.status(404).json({ message: 'Сайт не знайдено' });
        }
        res.json({ 
            site_path: sites[0].site_path, 
            title: sites[0].title,
            is_online_payment_enabled: sites[0].is_online_payment_enabled,
            is_cod_enabled: sites[0].is_cod_enabled,
            author: sites[0].author,
            author_email: sites[0].author_email,
            author_avatar: sites[0].author_avatar
        });
    } catch (error) {
        console.error('Помилка в getSiteInfoById:', error);
        next(error);
    }
};

exports.getTemplates = async (req, res, next) => {
    try {
        const { include_drafts } = req.query;
        let query = "SELECT id, name, description, icon, thumbnail_url, default_block_content, is_ready, access_level FROM templates WHERE type = 'system' AND is_ready = 1";
        if (include_drafts === 'true') {
            query += " AND access_level IN ('public', 'admin_only')";
        } else {
            query += " AND access_level = 'public'";
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await db.query(query);
        const processedRows = rows.map(row => ({
            ...row,
            default_block_content: (typeof row.default_block_content === 'string') 
                ? JSON.parse(row.default_block_content) 
                : row.default_block_content
        }));
        res.json(processedRows);
    } catch (error) { next(error); }
};

exports.createSite = async (req, res, next) => {
    const settings = await getGlobalSettings();
    if (!settings.site_creation_enabled) {
        if (req.file) await deleteFile(req.file.path).catch(() => {});
        return res.status(403).json({ message: 'Створення нових сайтів тимічасово призупинено адміністрацією.' });
    }
    const { templateId, sitePath, title, selected_logo_url, isBlank } = req.body;
    const validationError = validateSiteCreation(title, sitePath);
    if (validationError) {
        if (req.file) await deleteFile(req.file.path).catch(() => {});
        return res.status(400).json({ message: validationError });
    }
    const cleanTitle = title.trim();
    const cleanSitePath = sitePath.toLowerCase().trim();
    const userId = req.user.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!templateId && !isBlank) throw new Error('ID шаблону не було надано.');
        const [existing] = await connection.query('SELECT id FROM sites WHERE site_path = ?', [cleanSitePath]);
        if (existing.length > 0) throw new Error('Ця адреса сайту вже зайнята.');
        let siteThemeConfig = { theme_settings: {}, site_theme_mode: 'light', site_theme_accent: 'blue' };
        let pagesToCreate = [];
        let footerToSave = [];
        let headerToSave = [];
        if (!isBlank) {
            const [templates] = await connection.query('SELECT * FROM templates WHERE id = ?', [templateId]);
            if (templates.length === 0) throw new Error('Шаблон не знайдено.');
            const template = templates[0];
            if (template.type === 'personal') {
                if (template.user_id !== userId) throw new Error('У вас немає доступу до цього приватного шаблону.');
            }
            const rawContent = template.default_block_content;
            const templateData = (typeof rawContent === 'string') ? JSON.parse(rawContent) : rawContent;
            siteThemeConfig = {
                theme_settings: templateData.theme_settings || {},
                site_theme_mode: templateData.site_theme_mode || templateData.theme_settings?.mode || 'light',
                site_theme_accent: templateData.site_theme_accent || templateData.theme_settings?.accent || 'blue'
            };
            pagesToCreate = templateData.pages || [];
            footerToSave = regenerateBlockIds(templateData.footer_content || []);
            headerToSave = regenerateBlockIds(templateData.header_content || []);
            
            if (!templateData.pages && Array.isArray(templateData)) {
                pagesToCreate = [{ title: 'Головна', slug: 'home', blocks: templateData }];
            }
        }
        let logoUrl = selected_logo_url || '/logos/logo1.png'; 
        const relativeLogoUrl = logoUrl.replace(/^http:\/\/localhost:5000/, '');
        if (headerToSave.length > 0) {
            headerToSave = headerToSave.map(b => b.type === 'header' ? ({
                ...b, data: { ...b.data, site_title: cleanTitle, logo_src: relativeLogoUrl, show_title: true }
            }) : b);
        } else {
             headerToSave = [{
                block_id: uuidv4(), type: 'header',
                data: { site_title: cleanTitle, logo_src: relativeLogoUrl, show_title: true, nav_items: [{ id: uuidv4(), label: 'Головна', link: '/' }], show_profile_icon: true, show_cart_icon: true, block_theme: 'auto' }
            }];
        }
        const [siteResult] = await connection.query(
            `INSERT INTO sites (user_id, site_path, title, logo_url, status, currency) VALUES (?, ?, ?, ?, 'private', 'UAH')`,
            [userId, cleanSitePath, cleanTitle, relativeLogoUrl]
        );
        const newSiteId = siteResult.insertId;
        await connection.query(
            `UPDATE sites SET header_content = ?, footer_content = ?, theme_settings = ?, site_theme_mode = ?, site_theme_accent = ? WHERE id = ?`,
            [JSON.stringify(headerToSave), JSON.stringify(footerToSave), JSON.stringify(siteThemeConfig.theme_settings), siteThemeConfig.site_theme_mode, siteThemeConfig.site_theme_accent, newSiteId]
        );
        if (pagesToCreate.length > 0) {
            for (const pageData of pagesToCreate) {
                const pageBlocks = regenerateBlockIds(pageData.blocks || []);
                const pageSlug = pageData.slug || `page-${Date.now()}`;
                const isHome = (pageSlug === 'home' || pageData.is_homepage) ? 1 : 0;
                await connection.query(
                    `INSERT INTO pages (site_id, name, slug, block_content, is_homepage, seo_title, seo_description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [newSiteId, pageData.title || 'Нова сторінка', pageSlug, JSON.stringify(pageBlocks), isHome, pageData.seo_title || null, pageData.seo_description || null]
                );
            }
        } else {
            await connection.query(
                `INSERT INTO pages (site_id, name, slug, block_content, is_homepage) VALUES (?, ?, ?, ?, ?)`,
                [newSiteId, 'Головна', 'home', JSON.stringify([]), 1]
            );
        }
        await connection.commit();
        res.status(201).json({ message: 'Сайт успішно створено!', site: { id: newSiteId, site_path: cleanSitePath } });
    } catch (error) {
        await connection.rollback();
        if (req.file) await deleteFile(req.file.path).catch(() => {});
        const status = (error.message.includes('не знайдено') || error.message.includes('вже зайнята') || error.message.includes('доступу')) ? 400 : 500;
        res.status(status).json({ message: error.message || 'Не вдалося створити сайт.' });
    } finally {
        connection.release();
    }
};

exports.getSites = async (req, res, next) => {
    try {
        const { search, scope, tag, sort, onlyFavorites, userId, username } = req.query; 
        let targetUserId = null;
        let includeAllStatuses = false;
        let isStaff = false;
        if (req.user) {
            const [currentUser] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (currentUser[0]?.role === 'admin' || currentUser[0]?.role === 'moderator') {
                isStaff = true;
            }
        }
        if (scope === 'my' && req.user) {
            targetUserId = req.user.id;
            includeAllStatuses = true;
        } else if (userId) {
            targetUserId = userId;
        } else if (username) {
            const [users] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
            if (users.length > 0) targetUserId = users[0].id;
        }
        if (isStaff && targetUserId) includeAllStatuses = true;
        const sites = await SiteRepository.getPublic({ 
            searchTerm: search, 
            userId: targetUserId, 
            tag, 
            sort,
            onlyFavorites: onlyFavorites === 'true',
            currentUserId: req.user ? req.user.id : null,
            includeAllStatuses: includeAllStatuses
        });
        res.json(sites);
    } catch (error) { next(error); }
};

exports.getDefaultLogos = async (req, res, next) => {
    try { res.json(['/logos/logo1.png', '/logos/logo2.png', '/logos/logo3.png']); } 
    catch (error) { next(error); }
};

exports.getSiteByPath = async (req, res, next) => {
    try {
        const { site_path, slug } = req.params;
        const site = await SiteRepository.findByPath(site_path);
        if (!site) return res.status(200).json(null);
        const [ownerInfo] = await db.query('SELECT username, email, avatar_url FROM users WHERE id = ?', [site.user_id]);
        if (ownerInfo.length > 0) {
            site.author = ownerInfo[0].username;
            site.author_email = ownerInfo[0].email;
            site.author_avatar = ownerInfo[0].avatar_url;
        }
        let isStaff = false;
        let isCollaborator = false;
        let myPermissions = [];
        if (req.user) {
            const [currentUser] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (currentUser[0]?.role === 'admin' || currentUser[0]?.role === 'moderator') isStaff = true;
            const [collabs] = await db.query('SELECT role, permissions FROM site_collaborators WHERE site_id = ? AND user_id = ?', [site.id, req.user.id]);
            if (collabs.length > 0) {
                isCollaborator = true;
                let perms = collabs[0].permissions;
                myPermissions = typeof perms === 'string' ? JSON.parse(perms) : (perms || []);
            }
        }
        const isOwner = req.user && req.user.id === site.user_id;
        if (site.status === 'suspended') {
            if (!isStaff) return res.status(403).json({ message: 'Цей сайт заблоковано за порушення правил платформи.', isSuspended: true });
        }
        if (site.status === 'probation') {
            if (!isOwner && !isStaff && !isCollaborator) return res.status(403).json({ message: 'Сайт знаходиться на модерації.' });
        }
        if (site.status === 'private') {
            if (!isOwner && !isStaff && !isCollaborator) return res.status(200).json(null);
        }
        let page;
        if (slug) page = await PageRepository.findBySiteIdAndSlug(site.id, slug);
        else page = await PageRepository.findHomepageBySiteId(site.id);
        if (!page) return res.status(200).json(null);
        const [tags] = await db.query(`SELECT t.id, t.name FROM tags t JOIN site_tags st ON t.id = st.tag_id WHERE st.site_id = ?`, [site.id]);
        if (site.liqpay_private_key) {
            site.liqpay_private_key = '********';
        } else {
            site.liqpay_private_key = '';
        }

        res.json({ 
            ...site, 
            is_collaborator: isCollaborator,
            my_permissions: myPermissions,
            page_content: page.block_content, 
            page_id: page.id, 
            page: page, 
            tags: tags 
        });
    } catch (error) {
        console.error('Помилка в getSiteByPath:', error);
        next(error);
    }
};

exports.updateSiteSettings = async (req, res, next) => {
    try {
        const { site_path } = req.params;
        const userId = req.user.id;
        const site = await SiteRepository.findByPath(site_path);
        if (!site) return res.status(404).json({ message: 'Сайт не знайдено.' });
        const isOwner = site.user_id === userId;
        const [collabs] = await db.query('SELECT role FROM site_collaborators WHERE site_id = ? AND user_id = ?', [site.id, userId]);
        const isEditor = collabs.length > 0 && collabs[0].role === 'editor';
        if (!isOwner && !isEditor) {
            return res.status(403).json({ message: 'У вас немає прав редагувати цей сайт.' });
        }
        const [lockCheck] = await db.query('SELECT locked_by_user_id, locked_until FROM sites WHERE id = ?', [site.id]);
        const currentLock = lockCheck[0];
        if (currentLock.locked_by_user_id && currentLock.locked_by_user_id !== userId && new Date(currentLock.locked_until) > new Date()) {
             return res.status(423).json({ message: 'Сайт зараз редагується іншим користувачем. Зміни не збережено для уникнення конфліктів.' });
        }
        const { status: requestedStatus } = req.body;
        if (requestedStatus && requestedStatus !== site.status) {
            if (site.status === 'suspended' || site.status === 'probation') {
                return res.status(403).json({ message: 'Ви не можете змінювати статус сайту, поки він заблокований або на модерації.' });
            }
        }
        
        const { 
            title, status, tags, site_theme_mode, site_theme_accent, theme_settings, dashboard_config,
            header_content, footer_content, favicon_url, site_title_seo, 
            cover_image, cover_layout, logo_url,
            cover_logo_size, cover_logo_radius, cover_title_size,
            liqpay_public_key, liqpay_private_key, currency,
            is_online_payment_enabled, is_cod_enabled,
            cookie_banner_enabled, cookie_banner_text,
            cookie_banner_size, cookie_banner_position, cookie_banner_blur
        } = req.body;
        const safeParse = (data, fallback) => {
            if (!data) return fallback;
            if (typeof data === 'object') return data;
            try { return JSON.parse(data); } catch (e) { return fallback; }
        };
        let processingHeaderContent = safeParse(header_content, null);
        let currentHeaderContent = processingHeaderContent || safeParse(site.header_content, []);
        let finalLogoUrl = logo_url !== undefined ? logo_url : site.logo_url;
        let finalTitle = site.title;
        if (title !== undefined) {
            const trimmedTitle = title.trim();
            if (trimmedTitle.length < 2 || trimmedTitle.length > 60) return res.status(400).json({ message: 'Назва сайту має бути від 2 до 60 символів' });
            if (/[<>]/.test(trimmedTitle)) return res.status(400).json({ message: 'Назва сайту містить недопустимі символи (<, >)' });
            finalTitle = trimmedTitle;
        }
        if (processingHeaderContent && Array.isArray(processingHeaderContent)) {
            const incomingHeaderBlock = processingHeaderContent.find(b => b.type === 'header');
            if (incomingHeaderBlock && incomingHeaderBlock.data) {
                if (incomingHeaderBlock.data.logo_src !== undefined) finalLogoUrl = incomingHeaderBlock.data.logo_src;
                if (incomingHeaderBlock.data.site_title !== undefined) {
                    const blockTitle = incomingHeaderBlock.data.site_title.trim();
                    if (/[<>]/.test(blockTitle)) return res.status(400).json({ message: 'Назва містить недопустимі символи' });
                    finalTitle = blockTitle;
                }
            }
        }
        if (Array.isArray(currentHeaderContent)) {
            let headerFound = false;
            currentHeaderContent = currentHeaderContent.map(block => {
                if (block.type === 'header') {
                    headerFound = true;
                    return { ...block, data: { ...block.data, logo_src: finalLogoUrl, site_title: finalTitle } };
                }
                return block;
            });
            if (!headerFound) {
                currentHeaderContent.push({
                    block_id: uuidv4(), type: 'header',
                    data: { site_title: finalTitle, logo_src: finalLogoUrl, show_title: true, nav_items: [], block_theme: 'auto' }
                });
            }
        }

        let finalPrivateKey = site.liqpay_private_key;
        if (liqpay_private_key !== undefined) {
            if (liqpay_private_key === '********') {
                finalPrivateKey = site.liqpay_private_key;
            } else if (liqpay_private_key.trim() === '') {
                finalPrivateKey = null;
            } else {
                finalPrivateKey = encrypt(liqpay_private_key);
            }
        }

        let finalStatus = (status !== undefined) ? status : site.status;
        if (site.status === 'suspended' || site.status === 'probation') finalStatus = site.status;
        const updateData = { 
            title: finalTitle, status: finalStatus, logo_url: finalLogoUrl,
            site_theme_mode: site_theme_mode !== undefined ? site_theme_mode : site.site_theme_mode,
            site_theme_accent: site_theme_accent !== undefined ? site_theme_accent : site.site_theme_accent,
            theme_settings: safeParse(theme_settings, site.theme_settings),
            dashboard_config: safeParse(dashboard_config, site.dashboard_config),
            header_content: currentHeaderContent,
            footer_content: safeParse(footer_content, site.footer_content),
            favicon_url: favicon_url !== undefined ? favicon_url : site.favicon_url,
            site_title_seo: site_title_seo !== undefined ? site_title_seo : site.site_title_seo,
            cover_image: cover_image !== undefined ? cover_image : site.cover_image,
            cover_layout: cover_layout !== undefined ? cover_layout : site.cover_layout,
            cover_logo_size: cover_logo_size !== undefined ? parseInt(cover_logo_size) : site.cover_logo_size,
            cover_logo_radius: cover_logo_radius !== undefined ? parseInt(cover_logo_radius) : site.cover_logo_radius,
            cover_title_size: cover_title_size !== undefined ? parseInt(cover_title_size) : site.cover_title_size,
            liqpay_public_key: liqpay_public_key !== undefined ? liqpay_public_key : site.liqpay_public_key,
            liqpay_private_key: finalPrivateKey,
            is_online_payment_enabled: is_online_payment_enabled !== undefined ? is_online_payment_enabled : site.is_online_payment_enabled,
            is_cod_enabled: is_cod_enabled !== undefined ? is_cod_enabled : site.is_cod_enabled,
            currency: currency !== undefined ? currency : site.currency,
            cookie_banner_enabled: cookie_banner_enabled !== undefined ? cookie_banner_enabled : site.cookie_banner_enabled,
            cookie_banner_text: cookie_banner_text !== undefined ? cookie_banner_text : site.cookie_banner_text,
            cookie_banner_size: cookie_banner_size !== undefined ? cookie_banner_size : site.cookie_banner_size,
            cookie_banner_position: cookie_banner_position !== undefined ? cookie_banner_position : site.cookie_banner_position,
            cookie_banner_blur: cookie_banner_blur !== undefined ? cookie_banner_blur : site.cookie_banner_blur
        };
        await SiteRepository.updateSettings(site.id, updateData);
        if (Array.isArray(tags)) await SiteRepository.updateTags(site.id, tags);
        res.json({ 
            message: 'Налаштування оновлено',
            updated: { logo_url: finalLogoUrl, title: finalTitle, header_content: currentHeaderContent, status: finalStatus, currency: updateData.currency }
        });
    } catch (error) {
        console.error('Помилка updateSiteSettings:', error);
        next(error);
    }
};

exports.renameSite = async (req, res, next) => { 
    try { 
        const { site_path: oldPath } = req.params; 
        const { newPath } = req.body; 
        const userId = req.user.id;
        const slugError = validateSlugOnly(newPath);
        if (slugError) return res.status(400).json({ message: slugError });
        const sanitizedNewPath = newPath.toLowerCase().trim();
        const existingSite = await SiteRepository.findByPath(sanitizedNewPath); 
        if (existingSite) return res.status(409).json({ message: 'Ця адреса вже зайнята. Спробуйте іншу.' });
        const currentSite = await SiteRepository.findByPath(oldPath); 
        if (!currentSite || currentSite.user_id !== userId) return res.status(404).json({ message: 'Сайт не знайдено або недостатньо прав (тільки власник).' });
        const [result] = await db.query('UPDATE sites SET site_path = ? WHERE site_path = ? AND user_id = ?', [sanitizedNewPath, oldPath, userId]); 
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Сайт не знайдено або недостатньо прав.' });
        res.status(200).json({ message: 'Адресу сайту успішно змінено.', newPath: sanitizedNewPath }); 
    } catch (error) { 
        next(error); 
    } 
};

exports.getMySuspendedSites = async (req, res, next) => { 
    try { 
        const userId = req.user.id;
        const query = `
            SELECT s.id, s.site_path, s.title, s.logo_url, s.deletion_scheduled_for,
                   sa.status as appeal_status, sa.ticket_id, st.status as ticket_status,
                   (SELECT reason_note FROM user_warnings WHERE site_id = s.id ORDER BY created_at DESC LIMIT 1) as suspension_reason
            FROM sites s
            LEFT JOIN site_appeals sa ON s.id = sa.site_id
            LEFT JOIN support_tickets st ON sa.ticket_id = st.id
            WHERE s.user_id = ? AND s.status = 'suspended'
        `;
        const [sites] = await db.query(query, [userId]);
        res.json(sites); 
    } catch (error) { next(error); } 
};

exports.deleteSite = async (req, res, next) => { 
    try { 
        const { site_path } = req.params; 
        const userId = req.user.id; 
        const result = await SiteRepository.deleteByPathAndUserId(site_path, userId); 
        if (!result) return res.status(404).json({ message: 'Сайт не знайдено або у вас немає прав на його видалення.' }); 
        res.json({ message: 'Сайт успішно видалено.' }); 
    } catch (error) { next(error); } 
};

exports.resetSiteToTemplate = async (req, res, next) => { 
    const { siteId } = req.params; 
    const { templateId } = req.body; 
    const userId = req.user.id; 
    const isBlank = req.body.isBlank || templateId === 'blank';
    const connection = await db.getConnection();
    try { 
        const site = await SiteRepository.findByIdAndUserId(siteId, userId); 
        if (!site) return res.status(403).json({ message: 'Сайт не знайдено або у вас немає прав (тільки власник).' });
        let headerToSave = [], footerToSave = [], pagesToCreate = [];
        let siteThemeMode = 'light', siteThemeAccent = 'blue', themeSettings = {};
        if (!isBlank) {
            const [templates] = await connection.query('SELECT * FROM templates WHERE id = ?', [templateId]); 
            if (!templates[0]) throw new Error('Шаблон не знайдено.'); 
            const template = templates[0];
            if (template.type === 'personal' && template.user_id !== userId) throw new Error('У вас немає доступу до цього шаблону.');
            const rawContent = template.default_block_content; 
            const templateData = (typeof rawContent === 'string') ? JSON.parse(rawContent) : rawContent; 
            headerToSave = regenerateBlockIds(templateData.header_content || []); 
            footerToSave = regenerateBlockIds(templateData.footer_content || []); 
            pagesToCreate = templateData.pages || []; 
            if (!templateData.pages && Array.isArray(templateData)) pagesToCreate = [{ title: 'Головна', slug: 'home', blocks: templateData }]; 
            themeSettings = templateData.theme_settings || {};
            siteThemeMode = templateData.site_theme_mode || templateData.theme_settings?.mode || 'light'; 
            siteThemeAccent = templateData.site_theme_accent || templateData.theme_settings?.accent || 'orange'; 
        } else {
            pagesToCreate = [{ title: 'Головна', slug: 'home', blocks: [] }];
            headerToSave = [{
                block_id: uuidv4(), type: 'header',
                data: { site_title: site.title, logo_src: site.logo_url || '/logos/logo1.png', show_title: true, nav_items: [{ id: uuidv4(), label: 'Головна', link: '/' }], show_profile_icon: true, show_cart_icon: true, block_theme: 'auto' }
            }];
        }
        await connection.beginTransaction(); 
        await connection.query('DELETE FROM pages WHERE site_id = ?', [siteId]); 
        const updateQuery = `UPDATE sites SET header_content = ?, footer_content = ?, site_theme_mode = ?, site_theme_accent = ?, theme_settings = ? WHERE id = ?`; 
        await connection.query(updateQuery, [JSON.stringify(headerToSave), JSON.stringify(footerToSave), siteThemeMode, siteThemeAccent, JSON.stringify(themeSettings), siteId]); 
        for (const pageData of pagesToCreate) { 
            const blocks = regenerateBlockIds(pageData.blocks || pageData.block_content || []); 
            await connection.query(
                'INSERT INTO pages (site_id, name, slug, block_content, is_homepage, seo_title, seo_description) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [siteId, pageData.title || 'Нова сторінка', pageData.slug || `page-${uuidv4()}`, JSON.stringify(blocks), (pageData.slug === 'home' || pageData.is_homepage) ? 1 : 0, pageData.seo_title || null, pageData.seo_description || null]
            ); 
        } 
        await connection.commit(); 
        res.json({ message: 'Сайт успішно скинуто до шаблону.' }); 
    } catch (error) { 
        await connection.rollback(); 
        console.error('Помилка при зміні шаблону:', error); 
        next(error); 
    } finally { connection.release(); } 
};

exports.getUserSites = async (req, res, next) => { 
    try { 
        const userId = req.user.id;
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
        res.json(sites); 
    } catch (error) { next(error); } 
};

exports.toggleSitePin = async (req, res, next) => { 
    try { 
        const { siteId } = req.params; 
        const userId = req.user.id; 
        const site = await SiteRepository.findByIdAndUserId(siteId, userId); 
        if (!site) return res.status(404).json({ message: 'Сайт не знайдено або у вас немає прав (тільки власник).' }); 
        const newState = await SiteRepository.togglePin(siteId); 
        res.json({ message: newState ? 'Сайт закріплено' : 'Сайт відкріплено', is_pinned: newState }); 
    } catch (error) { next(error); } 
};

exports.checkSlug = async (req, res, next) => {
    try {
        const { slug } = req.query;
        const slugError = validateSlugOnly(slug);
        if (slugError) return res.json({ isAvailable: false, message: slugError });
        const sanitizedSlug = slug.toLowerCase().trim();
        const existingSite = await SiteRepository.findByPath(sanitizedSlug);
        if (existingSite) return res.json({ isAvailable: false, message: 'Ця адреса вже зайнята.' });
        res.json({ isAvailable: true });
    } catch (error) { next(error); }
};

exports.getSiteAnalytics = async (req, res, next) => {
    try {
        const siteId = req.params.id;
        const userId = req.user.id;
        const [sites] = await db.query('SELECT user_id, view_count, currency FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Сайт не знайдено' });
        const isOwner = sites[0].user_id === userId;
        const [collabs] = await db.query('SELECT role FROM site_collaborators WHERE site_id = ? AND user_id = ?', [siteId, userId]);
        if (!isOwner && collabs.length === 0) {
            return res.status(403).json({ message: 'У вас немає прав доступу до аналітики цього сайту' });
        }
        const { view_count: views, currency } = sites[0];
        const [orderStats] = await db.query(`
            SELECT 
                COUNT(id) as totalOrders,
                SUM(CASE WHEN status IN ('completed', 'paid', 'shipped') THEN 1 ELSE 0 END) as completedOrders,
                SUM(CASE WHEN status IN ('completed', 'paid', 'shipped') THEN total_amount ELSE 0 END) as revenue
            FROM orders 
            WHERE site_id = ?
        `, [siteId]);
        const stats = orderStats[0] || {};
        const [recentOrders] = await db.query(`
            SELECT id, customer_name, total_amount, status, created_at
            FROM orders
            WHERE site_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [siteId]);
        res.json({
            views: views || 0,
            totalOrders: stats.totalOrders || 0,
            completedOrders: stats.completedOrders || 0,
            revenue: Number(stats.revenue || 0),
            currency: currency || 'UAH',
            recentOrders
        });
    } catch (error) {
        console.error('Помилка в getSiteAnalytics:', error);
        next(error);
    }
};