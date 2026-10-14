// backend/utils/authTokens.js
const jwt = require('jsonwebtoken');

const signAccessToken = (user, { role = user.role, expiresIn = '24h' } = {}) => {
    if (user.token_version === undefined || user.token_version === null) {
        throw new Error('Токен без token_version не можна видати: його не вдасться відкликати.');
    }
    return jwt.sign(
        { id: user.id, role, plan: user.plan || 'FREE', token_version: user.token_version },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn }
    );
};

module.exports = { signAccessToken };
