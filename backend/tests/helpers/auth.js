// backend/tests/helpers/auth.js
import jwt from 'jsonwebtoken';

// Токен має той самий склад, що й у authController.login: { id, role, plan, token_version }.
export function tokenFor(user, options = {}) {
  return jwt.sign(
    { id: user.id, role: user.role || 'user', plan: user.plan || 'FREE', token_version: user.token_version ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h', ...options }
  );
}

export function authHeader(user, options) {
  return { Authorization: `Bearer ${tokenFor(user, options)}` };
}
