// backend/middleware/verifyTokenOptional.js
const { verifyAccessToken } = require('../utils/authTokens');
const { isMissingSecretError } = require('../config/jwtSecret');

function verifyTokenOptional(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        req.user = null;
        return next();
    }

    try {
        req.user = verifyAccessToken(token);
    } catch (error) {
        if (isMissingSecretError(error)) {
            return next(error);
        }
        req.user = null;
    }
    next();
}

module.exports = verifyTokenOptional;
