// backend/services/siteAccess.js
const SiteRepository = require('../repositories/SiteRepository');
const { ServiceError } = require('./ServiceError');

const OWNER = { owner: true };
const read = (...sections) => ({ sections, write: false });
const write = (...sections) => ({ sections, write: true });

const parsePermissions = (value) => {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (error) {
            return [];
        }
    }
    return Array.isArray(parsed) ? parsed : [];
};

const isAllowed = (ownerId, collaborator, userId, requirement) => {
    if (String(ownerId) === String(userId)) return true;
    if (requirement.owner || !collaborator) return false;
    if (requirement.write && collaborator.role !== 'editor') return false;
    const granted = parsePermissions(collaborator.permissions);
    if (requirement.sections.length === 0) return granted.length > 0;
    return requirement.sections.some((section) => granted.includes(section));
};

const collaboratorOf = (site) => (
    site.collaborator_role ? { role: site.collaborator_role, permissions: site.collaborator_permissions } : null
);

const hasSiteAccess = async (siteId, userId, requirement) => {
    const site = await SiteRepository.findWithCollaborator(siteId, userId);
    return !!site && isAllowed(site.user_id, collaboratorOf(site), userId, requirement);
};

const requireSiteAccess = async (siteId, userId, requirement, forbiddenMessage, status = 403) => {
    const site = await SiteRepository.findWithCollaborator(siteId, userId);
    if (!site || !isAllowed(site.user_id, collaboratorOf(site), userId, requirement)) {
        throw new ServiceError(status, forbiddenMessage);
    }
    return site;
};

module.exports = { requireSiteAccess, hasSiteAccess, isAllowed, OWNER, read, write };
