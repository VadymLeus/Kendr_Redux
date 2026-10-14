// backend/config/corsOrigins.js
// Перелік дозволених джерел CORS (D-CFG-02). Адреси розгортання задаються змінними середовища,
// у коді лишається тільки адреса локального сервера розробки.
const DEV_ORIGIN = 'http://localhost:5173';

const parseList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const buildAllowedOrigins = (env = process.env) => [
    ...new Set([DEV_ORIGIN, ...parseList(env.CLIENT_URL), ...parseList(env.CORS_ORIGINS)])
];

module.exports = { buildAllowedOrigins, DEV_ORIGIN };
