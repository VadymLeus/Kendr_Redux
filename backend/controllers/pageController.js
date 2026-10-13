// backend/controllers/pageController.js
const PageService = require('../services/PageService');
const sendServiceError = require('../utils/sendServiceError');

exports.getPagesForSite = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const pages = await PageService.listForSite(siteId, req.user.id);
        res.json(pages);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.createPage = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const newPage = await PageService.create(siteId, req.user.id, req.body);
        res.status(201).json(newPage);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getPageById = async (req, res, next) => {
    try {
        const { pageId } = req.params;
        const page = await PageService.getById(pageId, req.user.id);
        res.json(page);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.updatePageContent = async (req, res, next) => {
    const { pageId } = req.params;
    const { block_content } = req.body;
    try {
        await PageService.updateContent(pageId, req.user.id, block_content);
        res.json({ message: 'Контент сторінки успішно оновлено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.updatePageSettings = async (req, res, next) => {
    try {
        const { pageId } = req.params;
        await PageService.updateSettings(pageId, req.user.id, req.body);
        res.json({ message: 'Налаштування сторінки оновлено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deletePage = async (req, res, next) => {
    try {
        const { pageId } = req.params;
        await PageService.remove(pageId, req.user.id);
        res.json({ message: 'Сторінку успішно видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.setHomePage = async (req, res, next) => {
    try {
        const { pageId } = req.params;
        await PageService.setHomepage(pageId, req.user.id);
        res.json({ message: 'Головну сторінку оновлено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};
