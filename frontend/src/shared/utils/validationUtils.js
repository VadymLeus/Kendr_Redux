// frontend/src/shared/utils/validationUtils.js
import { TEXT_LIMITS } from '../config/limits';

export const PASSWORD_REQUIREMENTS = {
    minLength: 8,
    hasNumber: /\d/,
    hasCapital: /[A-Z]/,
    hasLower: /[a-z]/
};

const BAD_SEQUENCES = ['12345', 'qwerty', 'asdfgh', 'zxcvbn', 'password', '123123', 'qweqwe', 'йцукен'];
export const analyzePassword = (password) => {
    if (!password) {
        return { 
            isValid: false, 
            score: 0,
            isSimple: false,
            checks: {
                isLongEnough: false,
                hasNumber: false,
                hasCapital: false,
                hasLower: false
            }
        };
    }
    const checks = {
        isLongEnough: password.length >= PASSWORD_REQUIREMENTS.minLength,
        hasNumber: PASSWORD_REQUIREMENTS.hasNumber.test(password),
        hasCapital: PASSWORD_REQUIREMENTS.hasCapital.test(password),
        hasLower: PASSWORD_REQUIREMENTS.hasLower.test(password)
    };
    const passedChecksCount = Object.values(checks).filter(Boolean).length;
    const lowerPw = password.toLowerCase();
    const isRepetitive = /(.)\1{4,}/.test(lowerPw);
    const isSimple = isRepetitive || BAD_SEQUENCES.some(seq => lowerPw.includes(seq));
    return {
        isValid: passedChecksCount === 4 && !isSimple,
        score: passedChecksCount,
        isSimple,
        checks
    };
};

export const RESERVED_SLUGS = [
    'admin', 'api', 'login', 'register', 'support', 'test', 'www', 
    'billing', 'orders', 'dashboard', 'sites', 'media', 'settings', 
    'auth', 'user', 'users', 'system', 'root', 'static', 'assets', 'create'
];

export const validateSiteSlug = (slug) => {
    if (!slug) return { isValid: false, status: 'idle', error: null };
    if (slug.length < 3) return { isValid: false, status: 'invalid', error: 'Мінімум 3 символи' };
    if (slug.length > TEXT_LIMITS.SITE_SLUG) return { isValid: false, status: 'invalid', error: `Максимум ${TEXT_LIMITS.SITE_SLUG} символів` };
    if (slug.startsWith('-') || slug.endsWith('-')) return { isValid: false, status: 'invalid', error: 'Не може починатися або закінчуватися дефісом' };
    if (slug.includes('--')) return { isValid: false, status: 'invalid', error: 'Не може містити два дефіси підряд' };
    if (RESERVED_SLUGS.includes(slug)) return { isValid: false, status: 'invalid', error: "Це ім'я зарезервовано системою. Будь ласка, оберіть інше." };
    const isRepetitive = /(.)\1{4,}/.test(slug);
    if (isRepetitive || BAD_SEQUENCES.some(seq => slug.includes(seq))) {
        return { isValid: false, status: 'invalid', error: 'Ця адреса містить заборонену або занадто просту послідовність символів' };
    }
    return { isValid: true, status: 'checking', error: null };
};

export const validateSiteTitle = (title) => {
    let val = title;
    let error = null;
    if (/[<>]/.test(val)) {
        val = val.replace(/[<>]/g, '');
        error = 'Символи < та > заборонені';
    }
    if (val.length > 60) {
        val = val.substring(0, 60);
        error = 'Максимум 60 символів';
    }
    const trimmed = val.trim();
    if (val.length > 0 && trimmed.length < 2) {
        error = 'Мінімум 2 символи (без урахування пробілів)';
    }
    return { val, error };
};