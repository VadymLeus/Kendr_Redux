// backend/services/SiteService.js
const SiteRepository = require('../repositories/SiteRepository');
const PageRepository = require('../repositories/PageRepository');
const TemplateRepository = require('../repositories/TemplateRepository');
const UserRepository = require('../repositories/UserRepository');
const CollaboratorRepository = require('../repositories/CollaboratorRepository');
const GlobalSettingsRepository = require('../repositories/GlobalSettingsRepository');
const OrderRepository = require('../repositories/OrderRepository');
const { ServiceError } = require('./ServiceError');
const PlanPolicy = require('./PlanPolicy');
const { requireSiteAccess, isAllowed, OWNER, read, write } = require('./siteAccess');
const { validateSlug, validateSiteCreation } = require('./siteValidation');
const { regenerateBlockIds, readTemplate, parseTemplateContent } = require('./siteTemplate');
const { buildSettingsUpdate, assertStatusChangeAllowed, requiredSections } = require('./siteSettings');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_LOGOS = ['/logos/logo1.png', '/logos/logo2.png', '/logos/logo3.png'];
const DEFAULT_LOGO = DEFAULT_LOGOS[0];
const LOCAL_ORIGIN = /^http:\/\/localhost:5000/;
const RECENT_ORDERS_LIMIT = 5;

const isStaffRole = (role) => role === 'admin' || role === 'moderator';

const defaultHeaderBlock = (data) => ({ block_id: uuidv4(), type: 'header', data });

const toPageRow = (siteId, pageData, slug, isHomepage, blocks) => ({
    site_id: siteId,
    name: pageData.title || 'Нова сторінка',
    slug,
    block_content: blocks,
    is_homepage: isHomepage,
    seo_title: pageData.seo_title || null,
    seo_description: pageData.seo_description || null
});

class SiteService {
    static getDefaultLogos() {
        return [...DEFAULT_LOGOS];
    }

    static async isStaff(userId) {
        return isStaffRole(await UserRepository.findRole(userId));
    }

    static async getInfoById(siteId) {
        const site = await SiteRepository.findInfoById(siteId);
        if (!site) {
            throw new ServiceError(404, 'Сайт не знайдено');
        }
        return {
            site_path: site.site_path,
            title: site.title,
            is_online_payment_enabled: site.is_online_payment_enabled,
            is_cod_enabled: site.is_cod_enabled,
            author: site.author,
            author_email: site.author_email,
            author_avatar: site.author_avatar
        };
    }

    static async listTemplates(includeDrafts) {
        const rows = await TemplateRepository.findPublicSystem(includeDrafts);
        return rows.map(row => ({
            ...row,
            default_block_content: parseTemplateContent(row.default_block_content)
        }));
    }

    static async isSiteCreationEnabled() {
        try {
            const settings = await GlobalSettingsRepository.findSiteCreation();
            if (settings) return Boolean(settings.site_creation_enabled);
        } catch (e) {
            console.warn('Таблиця global_settings не знайдена або порожня.');
        }
        return true;
    }

    static async createSite(userId, body) {
        if (!(await SiteService.isSiteCreationEnabled())) {
            throw new ServiceError(403, 'Створення нових сайтів тимічасово призупинено адміністрацією.');
        }
        const { templateId, sitePath, title, selected_logo_url, isBlank } = body;
        const validationError = validateSiteCreation(title, sitePath);
        if (validationError) {
            throw new ServiceError(400, validationError);
        }
        const cleanTitle = title.trim();
        const cleanSitePath = sitePath.toLowerCase().trim();
        return SiteRepository.transaction(async (connection) => {
            PlanPolicy.assertWithinLimit(
                await UserRepository.findPlanForUpdate(userId, connection),
                'sites',
                await SiteRepository.countByOwner(userId, connection)
            );
            if (!templateId && !isBlank) {
                throw new ServiceError(500, 'ID шаблону не було надано.');
            }
            if (await SiteRepository.existsByPath(cleanSitePath, connection)) {
                throw new ServiceError(400, 'Ця адреса сайту вже зайнята.');
            }
            let content = { header: [], footer: [], pages: [], themeSettings: {}, mode: 'light', accent: 'blue' };
            if (!isBlank) {
                const template = await TemplateRepository.findById(templateId, connection);
                if (!template) {
                    throw new ServiceError(400, 'Шаблон не знайдено.');
                }
                if (template.type === 'personal' && template.user_id !== userId) {
                    throw new ServiceError(400, 'У вас немає доступу до цього приватного шаблону.');
                }
                content = readTemplate(template, 'blue');
            }
            const logoUrl = (selected_logo_url || DEFAULT_LOGO).replace(LOCAL_ORIGIN, '');
            const header = content.header.length > 0
                ? content.header.map(b => b.type === 'header'
                    ? { ...b, data: { ...b.data, site_title: cleanTitle, logo_src: logoUrl, show_title: true } }
                    : b)
                : [defaultHeaderBlock({
                    site_title: cleanTitle, logo_src: logoUrl, show_title: true,
                    nav_items: [{ id: uuidv4(), label: 'Головна', link: '/' }],
                    show_profile_icon: true, show_cart_icon: true, block_theme: 'auto'
                })];
            const site = await SiteRepository.create(userId, cleanSitePath, cleanTitle, logoUrl, connection);
            await SiteRepository.applyContent(site.id, {
                header,
                footer: content.footer,
                themeSettings: content.themeSettings,
                mode: content.mode,
                accent: content.accent
            }, connection);
            if (content.pages.length > 0) {
                for (const pageData of content.pages) {
                    const blocks = regenerateBlockIds(pageData.blocks || []);
                    const slug = pageData.slug || `page-${Date.now()}`;
                    const isHomepage = (slug === 'home' || pageData.is_homepage) ? 1 : 0;
                    await PageRepository.createFromTemplate(toPageRow(site.id, pageData, slug, isHomepage, blocks), connection);
                }
            } else {
                await PageRepository.createFromTemplate(
                    toPageRow(site.id, { title: 'Головна' }, 'home', 1, []),
                    connection
                );
            }
            return { id: site.id, site_path: cleanSitePath };
        });
    }

    static async listCatalog(query, currentUser) {
        const { search, scope, tag, sort, onlyFavorites, userId, username } = query;
        let targetUserId = null;
        let includeAllStatuses = false;
        const isStaff = currentUser ? await SiteService.isStaff(currentUser.id) : false;
        if (scope === 'my' && currentUser) {
            targetUserId = currentUser.id;
            includeAllStatuses = true;
        } else if (userId) {
            targetUserId = userId;
        } else if (username) {
            const foundId = await UserRepository.findIdByUsername(username);
            if (foundId !== null) targetUserId = foundId;
        }
        if (isStaff && targetUserId) includeAllStatuses = true;
        return SiteRepository.getPublic({
            searchTerm: search,
            userId: targetUserId,
            tag,
            sort,
            onlyFavorites: onlyFavorites === 'true',
            currentUserId: currentUser ? currentUser.id : null,
            includeAllStatuses
        });
    }

    static async getByPath(sitePath, slug, currentUser) {
        const site = await SiteRepository.findByPath(sitePath);
        if (!site) return null;
        const author = await UserRepository.findAuthor(site.user_id);
        if (author) {
            site.author = author.username;
            site.author_email = author.email;
            site.author_avatar = author.avatar_url;
        }
        let isStaff = false;
        let isCollaborator = false;
        let myPermissions = [];
        if (currentUser) {
            isStaff = await SiteService.isStaff(currentUser.id);
            const collaborator = await CollaboratorRepository.findBySiteAndUser(site.id, currentUser.id);
            if (collaborator) {
                isCollaborator = true;
                const permissions = collaborator.permissions;
                myPermissions = typeof permissions === 'string' ? JSON.parse(permissions) : (permissions || []);
            }
        }
        const isOwner = Boolean(currentUser && currentUser.id === site.user_id);
        if (site.status === 'suspended' && !isStaff) {
            throw new ServiceError(403, 'Цей сайт заблоковано за порушення правил платформи.', { isSuspended: true });
        }
        if (site.status === 'probation' && !isOwner && !isStaff && !isCollaborator) {
            throw new ServiceError(403, 'Сайт знаходиться на модерації.');
        }
        if (site.status === 'private' && !isOwner && !isStaff && !isCollaborator) {
            return null;
        }
        const page = slug
            ? await PageRepository.findBySiteIdAndSlug(site.id, slug)
            : await PageRepository.findHomepageBySiteId(site.id);
        if (!page) return null;
        const tags = await SiteRepository.findTags(site.id);
        site.liqpay_private_key = site.liqpay_private_key ? '********' : '';
        return {
            ...site,
            is_collaborator: isCollaborator,
            my_permissions: myPermissions,
            page_content: page.block_content,
            page_id: page.id,
            page,
            tags
        };
    }

    static async updateSettings(sitePath, userId, body) {
        const site = await SiteRepository.findByPath(sitePath);
        if (!site) {
            throw new ServiceError(404, 'Сайт не знайдено.');
        }
        const collaborator = await CollaboratorRepository.findBySiteAndUser(site.id, userId);
        const sections = requiredSections(body);
        const requirements = sections.length > 0 ? sections.map((section) => write(section)) : [write()];
        if (!requirements.every((requirement) => isAllowed(site.user_id, collaborator, userId, requirement))) {
            throw new ServiceError(403, 'У вас немає прав редагувати цей сайт.');
        }
        const lock = await SiteRepository.findLock(site.id);
        if (lock.locked_by_user_id && lock.locked_by_user_id !== userId && new Date(lock.locked_until) > new Date()) {
            throw new ServiceError(423, 'Сайт зараз редагується іншим користувачем. Зміни не збережено для уникнення конфліктів.');
        }
        assertStatusChangeAllowed(site, body.status);
        const updateData = buildSettingsUpdate(site, body);
        await SiteRepository.updateSettings(site.id, updateData);
        if (Array.isArray(body.tags)) {
            await SiteRepository.updateTags(site.id, body.tags);
        }
        return {
            logo_url: updateData.logo_url,
            title: updateData.title,
            header_content: updateData.header_content,
            status: updateData.status,
            currency: updateData.currency
        };
    }

    static async renameSite(oldPath, newPath, userId) {
        const slugError = validateSlug(newPath);
        if (slugError) {
            throw new ServiceError(400, slugError);
        }
        const sanitizedNewPath = newPath.toLowerCase().trim();
        if (await SiteRepository.existsByPath(sanitizedNewPath)) {
            throw new ServiceError(409, 'Ця адреса вже зайнята. Спробуйте іншу.');
        }
        const currentSite = await SiteRepository.findByPath(oldPath);
        if (!currentSite || currentSite.user_id !== userId) {
            throw new ServiceError(404, 'Сайт не знайдено або недостатньо прав (тільки власник).');
        }
        const result = await SiteRepository.rename(oldPath, sanitizedNewPath, userId);
        if (result.affectedRows === 0) {
            throw new ServiceError(404, 'Сайт не знайдено або недостатньо прав.');
        }
        return sanitizedNewPath;
    }

    static listMySuspended(userId) {
        return SiteRepository.findSuspendedWithAppeals(userId);
    }

    static async deleteSite(sitePath, userId) {
        const result = await SiteRepository.deleteByPathAndUserId(sitePath, userId);
        if (!result) {
            throw new ServiceError(404, 'Сайт не знайдено або у вас немає прав на його видалення.');
        }
    }

    static async resetToTemplate(siteId, userId, body) {
        const { templateId } = body;
        const isBlank = body.isBlank || templateId === 'blank';
        const site = await requireSiteAccess(siteId, userId, OWNER, 'Сайт не знайдено або у вас немає прав (тільки власник).');
        let content;
        if (!isBlank) {
            const template = await TemplateRepository.findById(templateId);
            if (!template) throw new Error('Шаблон не знайдено.');
            if (template.type === 'personal' && template.user_id !== userId) {
                throw new Error('У вас немає доступу до цього шаблону.');
            }
            content = readTemplate(template, 'orange');
        } else {
            content = {
                header: [defaultHeaderBlock({
                    site_title: site.title, logo_src: site.logo_url || DEFAULT_LOGO, show_title: true,
                    nav_items: [{ id: uuidv4(), label: 'Головна', link: '/' }],
                    show_profile_icon: true, show_cart_icon: true, block_theme: 'auto'
                })],
                footer: [],
                pages: [{ title: 'Головна', slug: 'home', blocks: [] }],
                themeSettings: {},
                mode: 'light',
                accent: 'blue'
            };
        }
        await SiteRepository.transaction(async (connection) => {
            await PageRepository.deleteBySiteId(siteId, connection);
            await SiteRepository.applyContent(siteId, {
                header: content.header,
                footer: content.footer,
                themeSettings: content.themeSettings,
                mode: content.mode,
                accent: content.accent
            }, connection);
            for (const pageData of content.pages) {
                const blocks = regenerateBlockIds(pageData.blocks || pageData.block_content || []);
                const slug = pageData.slug || `page-${uuidv4()}`;
                const isHomepage = (pageData.slug === 'home' || pageData.is_homepage) ? 1 : 0;
                await PageRepository.createFromTemplate(toPageRow(siteId, pageData, slug, isHomepage, blocks), connection);
            }
        });
    }

    static getUserSites(userId) {
        return SiteRepository.findAllAccessible(userId);
    }

    static async togglePin(siteId, userId) {
        await requireSiteAccess(siteId, userId, OWNER, 'Сайт не знайдено або у вас немає прав (тільки власник).', 404);
        return SiteRepository.togglePin(siteId);
    }

    static async checkSlug(slug) {
        const slugError = validateSlug(slug);
        if (slugError) return { isAvailable: false, message: slugError };
        if (await SiteRepository.existsByPath(slug.toLowerCase().trim())) {
            return { isAvailable: false, message: 'Ця адреса вже зайнята.' };
        }
        return { isAvailable: true };
    }

    static async getAnalytics(siteId, userId) {
        const site = await SiteRepository.findOwnerAndStats(siteId);
        if (!site) {
            throw new ServiceError(404, 'Сайт не знайдено');
        }
        const collaborator = await CollaboratorRepository.findBySiteAndUser(siteId, userId);
        if (!isAllowed(site.user_id, collaborator, userId, read('overview'))) {
            throw new ServiceError(403, 'У вас немає прав доступу до аналітики цього сайту');
        }
        const stats = (await OrderRepository.findStatsBySite(siteId)) || {};
        const recentOrders = await OrderRepository.findRecentBySite(siteId, RECENT_ORDERS_LIMIT);
        return {
            views: site.view_count || 0,
            totalOrders: stats.totalOrders || 0,
            completedOrders: stats.completedOrders || 0,
            revenue: Number(stats.revenue || 0),
            currency: site.currency || 'UAH',
            recentOrders
        };
    }
}

module.exports = SiteService;
