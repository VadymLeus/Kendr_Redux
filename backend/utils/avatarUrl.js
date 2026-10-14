// backend/utils/avatarUrl.js
const DEFAULT_AVATAR = /^\/uploads\/avatars\/default\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

const isCloudinaryAsset = (value) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.hostname === 'res.cloudinary.com'
            && url.pathname.startsWith(`/${cloudName}/`)
            && !url.pathname.includes('..');
    } catch (error) {
        return false;
    }
};

const isAllowedAvatarUrl = (value) => (
    typeof value === 'string' && !value.includes('..') && (DEFAULT_AVATAR.test(value) || isCloudinaryAsset(value))
);

module.exports = { isAllowedAvatarUrl };
