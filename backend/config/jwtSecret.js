// backend/config/jwtSecret.js
// Єдине місце, де читається секрет підпису JWT (D-SEC-09). Запасного значення немає:
// без JWT_SECRET сервер не стартує (server.js), а підпис і перевірка токена завершуються помилкою.
const MISSING_CODE = 'JWT_SECRET_MISSING';
const MISSING_MESSAGE = 'JWT_SECRET не задано. Додайте змінну середовища JWT_SECRET (див. backend/.env.example).';

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (typeof secret !== 'string' || secret.trim() === '') {
        const error = new Error(MISSING_MESSAGE);
        error.code = MISSING_CODE;
        throw error;
    }
    return secret;
};

const isMissingSecretError = (error) => !!error && error.code === MISSING_CODE;

module.exports = { getJwtSecret, isMissingSecretError, MISSING_CODE, MISSING_MESSAGE };
