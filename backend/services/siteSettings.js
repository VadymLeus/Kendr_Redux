// backend/services/siteSettings.js
const { v4: uuidv4 } = require('uuid');
const { encrypt } = require('../utils/encryption');
const { ServiceError } = require('./ServiceError');
const { validateTitleText } = require('./siteValidation');

const MASKED_KEY = '********';
const LOCKED_STATUSES = ['suspended', 'probation'];

const SECTION_FIELDS = {
    editor: ['header_content', 'footer_content'],
    theme: ['site_theme_mode', 'site_theme_accent', 'theme_settings'],
    commerce: ['currency', 'liqpay_public_key', 'liqpay_private_key', 'is_online_payment_enabled', 'is_cod_enabled'],
    settings: [
        'title', 'status', 'tags', 'logo_url', 'dashboard_config', 'favicon_url', 'site_title_seo',
        'cover_image', 'cover_layout', 'cover_logo_size', 'cover_logo_radius', 'cover_title_size',
        'cookie_banner_enabled', 'cookie_banner_text', 'cookie_banner_size', 'cookie_banner_position', 'cookie_banner_blur'
    ]
};

const requiredSections = (body) => Object.keys(SECTION_FIELDS)
    .filter((section) => SECTION_FIELDS[section].some((field) => body[field] !== undefined));

const safeParse = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data === 'object') return data;
    try { return JSON.parse(data); } catch (e) { return fallback; }
};

const pick = (incoming, current) => (incoming !== undefined ? incoming : current);
const pickInt = (incoming, current) => (incoming !== undefined ? parseInt(incoming) : current);

const assertStatusChangeAllowed = (site, requestedStatus) => {
    if (requestedStatus && requestedStatus !== site.status && LOCKED_STATUSES.includes(site.status)) {
        throw new ServiceError(403, 'Ви не можете змінювати статус сайту, поки він заблокований або на модерації.');
    }
};

const resolveHeader = (site, body) => {
    const { title, header_content, logo_url } = body;
    const incomingHeaderContent = safeParse(header_content, null);
    let headerContent = incomingHeaderContent || safeParse(site.header_content, []);
    let finalLogoUrl = pick(logo_url, site.logo_url);
    let finalTitle = site.title;
    if (title !== undefined) {
        const trimmedTitle = title.trim();
        const titleError = validateTitleText(trimmedTitle);
        if (titleError) throw new ServiceError(400, titleError);
        finalTitle = trimmedTitle;
    }
    if (incomingHeaderContent && Array.isArray(incomingHeaderContent)) {
        const incomingHeaderBlock = incomingHeaderContent.find(b => b.type === 'header');
        if (incomingHeaderBlock && incomingHeaderBlock.data) {
            if (incomingHeaderBlock.data.logo_src !== undefined) finalLogoUrl = incomingHeaderBlock.data.logo_src;
            if (incomingHeaderBlock.data.site_title !== undefined) {
                const blockTitle = incomingHeaderBlock.data.site_title.trim();
                if (/[<>]/.test(blockTitle)) throw new ServiceError(400, 'Назва містить недопустимі символи');
                finalTitle = blockTitle;
            }
        }
    }
    if (Array.isArray(headerContent)) {
        let headerFound = false;
        headerContent = headerContent.map(block => {
            if (block.type === 'header') {
                headerFound = true;
                return { ...block, data: { ...block.data, logo_src: finalLogoUrl, site_title: finalTitle } };
            }
            return block;
        });
        if (!headerFound) {
            headerContent.push({
                block_id: uuidv4(), type: 'header',
                data: { site_title: finalTitle, logo_src: finalLogoUrl, show_title: true, nav_items: [], block_theme: 'auto' }
            });
        }
    }
    return { title: finalTitle, logoUrl: finalLogoUrl, headerContent };
};

const resolvePrivateKey = (site, incoming) => {
    if (incoming === undefined || incoming === MASKED_KEY) return site.liqpay_private_key;
    if (incoming.trim() === '') return null;
    return encrypt(incoming);
};

const resolveStatus = (site, status) => {
    if (LOCKED_STATUSES.includes(site.status)) return site.status;
    return pick(status, site.status);
};

const buildSettingsUpdate = (site, body) => {
    const header = resolveHeader(site, body);
    return {
        title: header.title,
        status: resolveStatus(site, body.status),
        logo_url: header.logoUrl,
        site_theme_mode: pick(body.site_theme_mode, site.site_theme_mode),
        site_theme_accent: pick(body.site_theme_accent, site.site_theme_accent),
        theme_settings: safeParse(body.theme_settings, site.theme_settings),
        dashboard_config: safeParse(body.dashboard_config, site.dashboard_config),
        header_content: header.headerContent,
        footer_content: safeParse(body.footer_content, site.footer_content),
        favicon_url: pick(body.favicon_url, site.favicon_url),
        site_title_seo: pick(body.site_title_seo, site.site_title_seo),
        cover_image: pick(body.cover_image, site.cover_image),
        cover_layout: pick(body.cover_layout, site.cover_layout),
        cover_logo_size: pickInt(body.cover_logo_size, site.cover_logo_size),
        cover_logo_radius: pickInt(body.cover_logo_radius, site.cover_logo_radius),
        cover_title_size: pickInt(body.cover_title_size, site.cover_title_size),
        liqpay_public_key: pick(body.liqpay_public_key, site.liqpay_public_key),
        liqpay_private_key: resolvePrivateKey(site, body.liqpay_private_key),
        is_online_payment_enabled: pick(body.is_online_payment_enabled, site.is_online_payment_enabled),
        is_cod_enabled: pick(body.is_cod_enabled, site.is_cod_enabled),
        currency: pick(body.currency, site.currency),
        cookie_banner_enabled: pick(body.cookie_banner_enabled, site.cookie_banner_enabled),
        cookie_banner_text: pick(body.cookie_banner_text, site.cookie_banner_text),
        cookie_banner_size: pick(body.cookie_banner_size, site.cookie_banner_size),
        cookie_banner_position: pick(body.cookie_banner_position, site.cookie_banner_position),
        cookie_banner_blur: pick(body.cookie_banner_blur, site.cookie_banner_blur)
    };
};

module.exports = { buildSettingsUpdate, assertStatusChangeAllowed, requiredSections, SECTION_FIELDS };
