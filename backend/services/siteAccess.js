// backend/services/siteAccess.js
const SiteRepository = require('../repositories/SiteRepository');
const { ServiceError } = require('./ServiceError');

const hasSiteAccess = async (siteId, userId) => {
    const site = await SiteRepository.findByIdAndUserId(siteId, userId);
    return !!site;
};

const requireSiteAccess = async (siteId, userId, forbiddenMessage, status = 403) => {
    const site = await SiteRepository.findByIdAndUserId(siteId, userId);
    if (!site) {
        throw new ServiceError(status, forbiddenMessage);
    }
    return site;
};

module.exports = { requireSiteAccess, hasSiteAccess };
