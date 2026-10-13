// backend/utils/sendServiceError.js
const { ServiceError } = require('../services/ServiceError');

const sendServiceError = (error, res, next) => {
    if (error instanceof ServiceError) {
        const body = error.extra ? { message: error.message, ...error.extra } : { message: error.message };
        return res.status(error.status).json(body);
    }
    return next(error);
};

module.exports = sendServiceError;
