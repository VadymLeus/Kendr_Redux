// backend/controllers/userTemplateController.js
const SiteRepository = require('../repositories/SiteRepository');
const { requireSiteAccess, OWNER } = require('../services/siteAccess');
const sendServiceError = require('../utils/sendServiceError');
const PageRepository = require('../repositories/PageRepository');
const db = require('../config/db');

exports.saveAsTemplate = async (req, res, next) => {
    try {
        const { siteId, templateName, description, icon, category, thumbnail_url } = req.body;
        const userId = req.user.id;
        
        if (!siteId || !templateName) {
            return res.status(400).json({ message: 'Необхідно вказати ID сайту та назву шаблону.' });
        }
        const site = await requireSiteAccess(siteId, userId, OWNER, 'Сайт не знайдено або у вас немає прав.');
        const siteDetails = await SiteRepository.findByPath(site.site_path);
        if (!siteDetails) return res.status(404).json({ message: 'Деталі сайту не знайдено.' });
        const pages = await PageRepository.findBySiteId(siteId);
        const pagesWithContent = await Promise.all(pages.map(async (p) => {
            const pageData = await PageRepository.findById(p.id);
            if (!pageData) return null;
            return {
                title: pageData.name,
                slug: pageData.slug,
                blocks: pageData.block_content || [],
                is_homepage: pageData.is_homepage,
                seo_title: pageData.seo_title,
                seo_description: pageData.seo_description
            };
        }));
        const validPages = pagesWithContent.filter(p => p !== null);
        const snapshot = {
            theme_settings: {
                ...(siteDetails.theme_settings || {}),
                mode: siteDetails.site_theme_mode || 'light',
                accent: siteDetails.site_theme_accent || 'blue'
            },
            header_content: siteDetails.header_content || [],
            footer_content: siteDetails.footer_content || [],
            pages: validPages
        };
        const jsonSnapshot = JSON.stringify(snapshot);
        await db.query(
            `INSERT INTO templates (user_id, name, description, icon, category, thumbnail_url, default_block_content, type, access_level, is_ready) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'personal', 'private', 0)`,
            [userId, templateName, description || '', icon || 'Layout', category || 'General', thumbnail_url || null, jsonSnapshot]
        );
        res.status(201).json({ message: 'Шаблон успішно створено!' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getMyTemplates = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT id, name, description, icon, category, thumbnail_url, default_block_content, type, is_ready, access_level 
            FROM templates 
            WHERE user_id = ? 
            AND (
                type = 'personal' 
                OR (type = 'system' AND is_ready = 0)
            )
            ORDER BY created_at DESC
        `;
        const [rows] = await db.query(query, [userId]);
        const processedTemplates = rows.map(t => {
            const rawContent = t.default_block_content;
            let parsedContent = {};
            try {
                parsedContent = (typeof rawContent === 'string') ? JSON.parse(rawContent) : rawContent;
            } catch (e) {
                console.error(`Error parsing template content for id ${t.id}`, e);
            }
            return {
                ...t,
                icon: t.icon || 'Layout',
                category: t.category || 'General',
                full_site_snapshot: parsedContent,
                default_block_content: parsedContent
            };
        });
        res.json(processedTemplates);
    } catch (error) {
        next(error);
    }
};

exports.deleteTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const [result] = await db.query(
            `DELETE FROM templates WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Шаблон не знайдено або у вас немає прав на його видалення.' });
        }
        res.json({ message: 'Шаблон успішно видалено.' });
    } catch (error) {
        next(error);
    }
};

exports.updateTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { siteId, templateName, description, icon, category, thumbnail_url } = req.body;
        const userId = req.user.id;
        
        if (!siteId) {
            const [result] = await db.query(
                `UPDATE templates SET name = ?, description = ?, icon = ?, category = ?, thumbnail_url = ? WHERE id = ? AND user_id = ?`,
                [templateName, description, icon || 'Layout', category || 'General', thumbnail_url || null, id, userId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Шаблон не знайдено або у вас немає прав.' });
            }
            return res.json({ message: 'Інформацію про шаблон оновлено!' });
        }
        const site = await requireSiteAccess(siteId, userId, OWNER, 'Сайт для оновлення шаблону не знайдено.');
        const siteDetails = await SiteRepository.findByPath(site.site_path);
        if (!siteDetails) return res.status(404).json({ message: 'Деталі сайту не знайдено.' });
        const pages = await PageRepository.findBySiteId(siteId);
        const pagesWithContent = await Promise.all(pages.map(async (p) => {
            const pageData = await PageRepository.findById(p.id);
            if (!pageData) return null;
            return {
                title: pageData.name,
                slug: pageData.slug,
                blocks: pageData.block_content || [],
                is_homepage: pageData.is_homepage,
                seo_title: pageData.seo_title,
                seo_description: pageData.seo_description
            };
        }));
        const validPages = pagesWithContent.filter(p => p !== null);
        const snapshot = {
            theme_settings: {
                ...(siteDetails.theme_settings || {}),
                mode: siteDetails.site_theme_mode || 'light',
                accent: siteDetails.site_theme_accent || 'blue'
            },
            header_content: siteDetails.header_content || [],
            footer_content: siteDetails.footer_content || [],
            pages: validPages
        };
        const jsonSnapshot = JSON.stringify(snapshot);
        const [result] = await db.query(
            `UPDATE templates SET name = ?, description = ?, icon = ?, category = ?, thumbnail_url = ?, default_block_content = ? WHERE id = ? AND user_id = ?`,
            [templateName, description || '', icon || 'Layout', category || 'General', thumbnail_url || null, jsonSnapshot, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Шаблон не знайдено або у вас немає прав.' });
        }
        res.json({ message: 'Шаблон та його структуру успішно оновлено!' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};