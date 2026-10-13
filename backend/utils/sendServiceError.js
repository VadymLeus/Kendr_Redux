// backend/utils/sendServiceError.js
const { ServiceError } = require('../services/ServiceError');

const sendServiceError = (error, res, next) => {
    if (error instanceof ServiceError) {
        return res.status(error.status).json({ message: error.message });
    }
    return next(error);
};

module.exports = sendServiceError;
