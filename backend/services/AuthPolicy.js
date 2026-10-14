// backend/services/AuthPolicy.js
const STAFF_ROLES = ['admin', 'moderator'];
const RESEND_PURPOSES = ['VERIFY_EMAIL', 'RESET_PASSWORD'];

class AuthPolicy {
    static isStaff(user) {
        return !!user && STAFF_ROLES.includes(user.role);
    }

    static isResendPurpose(purpose) {
        return RESEND_PURPOSES.includes(purpose);
    }

    static canReceiveOtp(user, purpose) {
        if (!user || user.status === 'suspended' || AuthPolicy.isStaff(user)) return false;
        if (purpose === 'VERIFY_EMAIL') return Number(user.is_verified) === 0;
        return purpose === 'RESET_PASSWORD';
    }

    static canCompleteStaffLogin(user) {
        return AuthPolicy.isStaff(user) && user.status === 'active';
    }
}

module.exports = AuthPolicy;
