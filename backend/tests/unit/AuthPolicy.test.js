// backend/tests/unit/AuthPolicy.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AuthPolicy = require('../../services/AuthPolicy');

const user = (overrides = {}) => ({ id: 1, role: 'user', status: 'active', is_verified: 1, ...overrides });

describe('AuthPolicy.isStaff', () => {
  it.each(['admin', 'moderator'])('роль %s — співробітник', (role) => {
    expect(AuthPolicy.isStaff(user({ role }))).toBe(true);
  });

  it.each([['user'], ['ADMIN'], [undefined]])('роль %s — не співробітник', (role) => {
    expect(AuthPolicy.isStaff(user({ role }))).toBe(false);
  });

  it.each([[null], [undefined]])('відсутній користувач (%s) — не співробітник', (value) => {
    expect(AuthPolicy.isStaff(value)).toBe(false);
  });
});

describe('AuthPolicy.isResendPurpose', () => {
  it.each(['VERIFY_EMAIL', 'RESET_PASSWORD'])('%s дозволено', (purpose) => {
    expect(AuthPolicy.isResendPurpose(purpose)).toBe(true);
  });

  it.each([['2FA'], ['NOT_A_PURPOSE'], [''], [undefined], [null], [['2FA']], [{ purpose: '2FA' }]])('%j відхиляється', (purpose) => {
    expect(AuthPolicy.isResendPurpose(purpose)).toBe(false);
  });
});

describe('AuthPolicy.canReceiveOtp', () => {
  it('підтвердження пошти: лише непідтвердженому акаунту', () => {
    expect(AuthPolicy.canReceiveOtp(user({ is_verified: 0 }), 'VERIFY_EMAIL')).toBe(true);
    expect(AuthPolicy.canReceiveOtp(user({ is_verified: 1 }), 'VERIFY_EMAIL')).toBe(false);
  });

  it('скидання пароля: звичайному акаунту незалежно від підтвердження пошти', () => {
    expect(AuthPolicy.canReceiveOtp(user({ is_verified: 0 }), 'RESET_PASSWORD')).toBe(true);
    expect(AuthPolicy.canReceiveOtp(user({ is_verified: 1 }), 'RESET_PASSWORD')).toBe(true);
  });

  it('видалений у межах строку відновлення акаунт код отримує', () => {
    expect(AuthPolicy.canReceiveOtp(user({ status: 'deleted' }), 'RESET_PASSWORD')).toBe(true);
  });

  it.each(['VERIFY_EMAIL', 'RESET_PASSWORD'])('%s: заблокований акаунт коду не отримує', (purpose) => {
    expect(AuthPolicy.canReceiveOtp(user({ status: 'suspended', is_verified: 0 }), purpose)).toBe(false);
  });

  it.each([['admin'], ['moderator']])('%s не отримує жодного коду поштою', (role) => {
    expect(AuthPolicy.canReceiveOtp(user({ role, is_verified: 0 }), 'VERIFY_EMAIL')).toBe(false);
    expect(AuthPolicy.canReceiveOtp(user({ role }), 'RESET_PASSWORD')).toBe(false);
  });

  it('невідомий акаунт коду не отримує', () => {
    expect(AuthPolicy.canReceiveOtp(undefined, 'RESET_PASSWORD')).toBe(false);
    expect(AuthPolicy.canReceiveOtp(null, 'VERIFY_EMAIL')).toBe(false);
  });

  it.each([['2FA'], ['NOT_A_PURPOSE'], [undefined]])('призначення %s не дозволено навіть існуючому акаунту', (purpose) => {
    expect(AuthPolicy.canReceiveOtp(user({ is_verified: 0 }), purpose)).toBe(false);
  });
});

describe('AuthPolicy.canCompleteStaffLogin', () => {
  it.each(['admin', 'moderator'])('активний %s завершує вхід', (role) => {
    expect(AuthPolicy.canCompleteStaffLogin(user({ role }))).toBe(true);
  });

  it.each(['suspended', 'deleted'])('співробітник зі статусом %s вхід не завершує', (status) => {
    expect(AuthPolicy.canCompleteStaffLogin(user({ role: 'admin', status }))).toBe(false);
  });

  it('звичайний користувач вхід до панелі не завершує', () => {
    expect(AuthPolicy.canCompleteStaffLogin(user())).toBe(false);
  });

  it('відсутній користувач — ні', () => {
    expect(AuthPolicy.canCompleteStaffLogin(undefined)).toBe(false);
  });
});
