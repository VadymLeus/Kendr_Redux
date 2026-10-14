// backend/services/PageService.js
const PageRepository = require('../repositories/PageRepository');
const { requireSiteAccess, read, write } = require('./siteAccess');
const { ServiceError } = require('./ServiceError');
const { validateBlockContent } = require('./blockContentValidation');

const ACCESS_DENIED = 'Доступ заборонено.';
const EDIT_DENIED = 'У вас немає прав на редагування цієї сторінки.';
const FIELDS_REQUIRED = 'Назва (name) та шлях (slug) є обов\'язковими.';
const DUPLICATE_SLUG = 'Сторінка з таким slug вже існує на цьому сайті.';

const translateDuplicate = (error) => {
    if (error.code === 'ER_DUP_ENTRY') {
        return new ServiceError(400, DUPLICATE_SLUG);
    }
    return error;
};

class PageService {
    static async getAccessible(pageId, userId, forbiddenMessage, requirement) {
        const page = await PageRepository.findSiteInfo(pageId);
        if (!page) {
            throw new ServiceError(403, forbiddenMessage);
        }
        await requireSiteAccess(page.site_id, userId, requirement, forbiddenMessage);
        return page;
    }

    static async listForSite(siteId, userId) {
        await requireSiteAccess(siteId, userId, read(), ACCESS_DENIED);
        return PageRepository.findBySiteId(siteId);
    }

    static async create(siteId, userId, body) {
        const { name, slug } = body;
        if (!name || !slug) {
            throw new ServiceError(400, FIELDS_REQUIRED);
        }
        await requireSiteAccess(siteId, userId, write('editor'), ACCESS_DENIED);
        try {
            return await PageRepository.create({
                site_id: siteId,
                name,
                slug,
                block_content: [],
                is_homepage: 0
            });
        } catch (error) {
            throw translateDuplicate(error);
        }
    }

    static async getById(pageId, userId) {
        await PageService.getAccessible(pageId, userId, EDIT_DENIED, read());
        const page = await PageRepository.findById(pageId);
        if (!page) {
            throw new ServiceError(404, 'Сторінку не знайдено.');
        }
        return page;
    }

    static async updateContent(pageId, userId, blockContent) {
        await PageService.getAccessible(pageId, userId, EDIT_DENIED, write('editor'));
        validateBlockContent(blockContent);
        await PageRepository.updateContent(pageId, blockContent);
    }

    static async updateSettings(pageId, userId, body) {
        const { name, slug, seo_title, seo_description, seo_keywords } = body;
        if (!name || !slug) {
            throw new ServiceError(400, FIELDS_REQUIRED);
        }
        await PageService.getAccessible(pageId, userId, ACCESS_DENIED, write('editor'));
        try {
            await PageRepository.updateSettings(pageId, { name, slug, seo_title, seo_description, seo_keywords });
        } catch (error) {
            throw translateDuplicate(error);
        }
    }

    static async remove(pageId, userId) {
        const { is_homepage, site_id } = await PageService.getAccessible(pageId, userId, ACCESS_DENIED, write('editor'));
        if (is_homepage) {
            throw new ServiceError(400, 'Неможливо видалити головну сторінку.');
        }
        const count = await PageRepository.countBySiteId(site_id);
        if (count <= 1) {
            throw new ServiceError(400, 'Неможливо видалити останню сторінку сайту.');
        }
        await PageRepository.delete(pageId);
    }

    static async setHomepage(pageId, userId) {
        const { site_id } = await PageService.getAccessible(pageId, userId, ACCESS_DENIED, write('editor'));
        await PageRepository.setHomepage(site_id, pageId);
    }
}

module.exports = PageService;
