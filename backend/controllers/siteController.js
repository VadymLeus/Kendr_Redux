// backend/controllers/siteController.js
const SiteService = require('../services/SiteService');
const { ServiceError } = require('../services/ServiceError');
const sendServiceError = require('../utils/sendServiceError');
const { deleteFile } = require('../utils/fileUtils');

const logAndSend = (label, error, res, next) => {
    if (!(error instanceof ServiceError)) console.error(label, error);
    sendServiceError(error, res, next);
};

exports.getSiteInfoById = async (req, res, next) => {
    try {
        res.json(await SiteService.getInfoById(req.params.id));
    } catch (error) {
        logAndSend('Помилка в getSiteInfoById:', error, res, next);
    }
};

exports.getTemplates = async (req, res, next) => {
    try {
        res.json(await SiteService.listTemplates(req.query.include_drafts === 'true'));
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.createSite = async (req, res, next) => {
    try {
        const site = await SiteService.createSite(req.user.id, req.body);
        res.status(201).json({ message: 'Сайт успішно створено!', site });
    } catch (error) {
        if (req.file) await deleteFile(req.file.path).catch(() => {});
        if (error instanceof ServiceError) return sendServiceError(error, res, next);
        res.status(500).json({ message: error.message || 'Не вдалося створити сайт.' });
    }
};

exports.getSites = async (req, res, next) => {
    try {
        res.json(await SiteService.listCatalog(req.query, req.user));
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getDefaultLogos = async (req, res, next) => {
    try {
        res.json(SiteService.getDefaultLogos());
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getSiteByPath = async (req, res, next) => {
    try {
        const { site_path, slug } = req.params;
        res.json(await SiteService.getByPath(site_path, slug, req.user));
    } catch (error) {
        logAndSend('Помилка в getSiteByPath:', error, res, next);
    }
};

exports.updateSiteSettings = async (req, res, next) => {
    try {
        const updated = await SiteService.updateSettings(req.params.site_path, req.user.id, req.body);
        res.json({ message: 'Налаштування оновлено', updated });
    } catch (error) {
        logAndSend('Помилка updateSiteSettings:', error, res, next);
    }
};

exports.renameSite = async (req, res, next) => {
    try {
        const newPath = await SiteService.renameSite(req.params.site_path, req.body.newPath, req.user.id);
        res.status(200).json({ message: 'Адресу сайту успішно змінено.', newPath });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getMySuspendedSites = async (req, res, next) => {
    try {
        res.json(await SiteService.listMySuspended(req.user.id));
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deleteSite = async (req, res, next) => {
    try {
        await SiteService.deleteSite(req.params.site_path, req.user.id);
        res.json({ message: 'Сайт успішно видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.resetSiteToTemplate = async (req, res, next) => {
    try {
        await SiteService.resetToTemplate(req.params.siteId, req.user.id, req.body);
        res.json({ message: 'Сайт успішно скинуто до шаблону.' });
    } catch (error) {
        logAndSend('Помилка при зміні шаблону:', error, res, next);
    }
};

exports.getUserSites = async (req, res, next) => {
    try {
        res.json(await SiteService.getUserSites(req.user.id));
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.toggleSitePin = async (req, res, next) => {
    try {
        const isPinned = await SiteService.togglePin(req.params.siteId, req.user.id);
        res.json({ message: isPinned ? 'Сайт закріплено' : 'Сайт відкріплено', is_pinned: isPinned });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.checkSlug = async (req, res, next) => {
    try {
        res.json(await SiteService.checkSlug(req.query.slug));
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getSiteAnalytics = async (req, res, next) => {
    try {
        res.json(await SiteService.getAnalytics(req.params.id, req.user.id));
    } catch (error) {
        logAndSend('Помилка в getSiteAnalytics:', error, res, next);
    }
};
