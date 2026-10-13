// backend/services/siteValidation.js
const RESERVED_SLUGS = [
    'admin', 'api', 'login', 'register', 'support', 'test', 'www', 
    'billing', 'orders', 'dashboard', 'sites', 'media', 'settings', 
    'auth', 'user', 'users', 'system', 'root', 'static', 'assets', 'create'
];
const BAD_SEQUENCES = ['12345', 'qwerty', 'asdfgh', 'zxcvbn', 'password', '123123', 'qweqwe', 'йцукен'];

const validateSlug = (slug) => {
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

const validateTitleText = (trimmedTitle) => {
    if (trimmedTitle.length < 2 || trimmedTitle.length > 60) return 'Назва сайту має бути від 2 до 60 символів';
    if (/[<>]/.test(trimmedTitle)) return 'Назва сайту містить недопустимі символи (<, >)';
    return null;
};

const validateSiteCreation = (title, slug) => {
    if (!title || typeof title !== 'string') return 'Назва сайту обов\'язкова';
    const titleError = validateTitleText(title.trim());
    if (titleError) return titleError;
    return validateSlug(slug);
};

module.exports = { validateSlug, validateTitleText, validateSiteCreation };
