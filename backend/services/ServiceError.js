// backend/services/ServiceError.js
class ServiceError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.name = 'ServiceError';
        this.status = status;
        this.extra = extra;
    }
}

module.exports = { ServiceError };
