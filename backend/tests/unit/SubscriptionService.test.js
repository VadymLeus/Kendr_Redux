// backend/tests/unit/SubscriptionService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SubscriptionService = require('../../services/SubscriptionService');
const PaymentService = require('../../services/PaymentService');
const LiqPayService = require('../../services/LiqPayService');
const TransactionRepository = require('../../repositories/TransactionRepository');
const UserRepository = require('../../repositories/UserRepository');
const { ServiceError } = require('../../services/ServiceError');

const CONN = { name: 'connection' };
const KEYS = ['LIQPAY_PUBLIC_KEY', 'LIQPAY_PRIVATE_KEY', 'LIQPAY_SANDBOX'];
let saved;
let tx;
let users;
let log;

async function serviceFailure(fn) {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася помилка');
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.LIQPAY_PUBLIC_KEY = 'platform-pub';
  process.env.LIQPAY_PRIVATE_KEY = 'platform-priv';
  delete process.env.LIQPAY_SANDBOX;
  log = [];
  tx = {
    transaction: vi.spyOn(TransactionRepository, 'transaction').mockImplementation(async (work) => work(CONN)),
    create: vi.spyOn(TransactionRepository, 'create').mockImplementation(async () => { log.push('create'); }),
    findById: vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(undefined),
    markSuccessIfPending: vi.spyOn(TransactionRepository, 'markSuccessIfPending').mockImplementation(async () => { log.push('markSuccess'); return true; }),
  };
  users = {
    findPlan: vi.spyOn(UserRepository, 'findPlan').mockResolvedValue('FREE'),
    findPlanForUpdate: vi.spyOn(UserRepository, 'findPlanForUpdate').mockResolvedValue('FREE'),
    setPlan: vi.spyOn(UserRepository, 'setPlan').mockImplementation(async () => { log.push('setPlan'); }),
  };
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe('startUpgrade', () => {
  it.each([['LIQPAY_PUBLIC_KEY'], ['LIQPAY_PRIVATE_KEY']])('без %s — 500, нічого не записується', async (name) => {
    delete process.env[name];
    const error = await serviceFailure(() => SubscriptionService.startUpgrade(7));
    expect([error.status, error.message]).toEqual([500, 'Ключі LiqPay платформи не налаштовані в системі.']);
    expect(tx.create).not.toHaveBeenCalled();
  });

  it.each([['PLUS'], ['ADMIN']])('тариф %s — 400', async (plan) => {
    users.findPlan.mockResolvedValue(plan);
    const error = await serviceFailure(() => SubscriptionService.startUpgrade(7));
    expect([error.status, error.message]).toEqual([400, 'У вас вже активовано преміум тариф.']);
    expect(tx.create).not.toHaveBeenCalled();
  });

  it('створює транзакцію pending на 299 UAH і повертає підписані дані платежу', async () => {
    const payment = await SubscriptionService.startUpgrade(7);
    expect(tx.create).toHaveBeenCalledTimes(1);
    const [row] = tx.create.mock.calls[0];
    expect(row).toMatchObject({
      userId: 7, amount: 299, currency: 'UAH', status: 'pending', providerId: null,
      description: 'Оплата довічного тарифу Kendr PLUS для користувача #7',
    });
    const params = JSON.parse(Buffer.from(payment.data, 'base64').toString('utf8'));
    expect(params).toMatchObject({ public_key: 'platform-pub', order_id: row.id, amount: 299, currency: 'UAH' });
    expect(payment.signature).toBe(LiqPayService.sign(payment.data, 'platform-priv'));
  });

  it('невідомий користувач (plan = null) не блокує створення транзакції', async () => {
    users.findPlan.mockResolvedValue(null);
    await SubscriptionService.startUpgrade(7);
    expect(tx.create).toHaveBeenCalledTimes(1);
  });
});

describe('upgradeWithGooglePay', () => {
  const PAYMENT = { paymentMethodData: { tokenizationData: { token: 't' } } };
  let verify;

  beforeEach(() => {
    verify = vi.spyOn(PaymentService, 'verifyGooglePay').mockImplementation(async () => {
      log.push('verify');
      return { providerId: 'gpay_verified_1' };
    });
  });

  it.each([['PLUS'], ['ADMIN']])('тариф %s — 400 до перевірки платежу', async (plan) => {
    users.findPlan.mockResolvedValue(plan);
    const error = await serviceFailure(() => SubscriptionService.upgradeWithGooglePay(7, PAYMENT));
    expect([error.status, error.message]).toEqual([400, 'У вас вже активовано преміум тариф.']);
    expect(verify).not.toHaveBeenCalled();
  });

  it('D-SEC-01: без серверної перевірки токена тариф не видається (за замовчуванням — 501)', async () => {
    verify.mockRestore();
    const error = await serviceFailure(() => SubscriptionService.upgradeWithGooglePay(7, undefined));
    expect(error.status).toBe(501);
    expect(tx.transaction).not.toHaveBeenCalled();
    expect(tx.create).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });

  it('відмова перевірки передається як є, нічого не записується', async () => {
    verify.mockRejectedValue(new ServiceError(402, 'declined'));
    const error = await serviceFailure(() => SubscriptionService.upgradeWithGooglePay(7, PAYMENT));
    expect([error.status, error.message]).toEqual([402, 'declined']);
    expect(tx.create).not.toHaveBeenCalled();
  });

  it('перевірці передаються токен, сума, валюта й посилання на користувача', async () => {
    await SubscriptionService.upgradeWithGooglePay(7, PAYMENT);
    expect(verify).toHaveBeenCalledWith(PAYMENT, { amount: 299, currency: 'UAH', reference: 'plan:7' });
  });

  it('після підтвердження в одній транзакції: блокування користувача, запис транзакції, тариф PLUS', async () => {
    await SubscriptionService.upgradeWithGooglePay(7, PAYMENT);
    expect(users.findPlanForUpdate).toHaveBeenCalledWith(7, CONN);
    const [row, connection] = tx.create.mock.calls[0];
    expect(connection).toBe(CONN);
    expect(row).toMatchObject({
      userId: 7, amount: 299, currency: 'UAH', status: 'success', providerId: 'gpay_verified_1',
      description: 'Оплата довічного тарифу Kendr PLUS для користувача #7 (Google Pay)',
    });
    expect(users.setPlan).toHaveBeenCalledWith(7, 'PLUS', CONN);
    expect(log).toEqual(['verify', 'create', 'setPlan']);
  });

  it('якщо під блокуванням тариф уже PLUS (паралельна оплата) — 400, запис не виконується', async () => {
    users.findPlanForUpdate.mockResolvedValue('PLUS');
    const error = await serviceFailure(() => SubscriptionService.upgradeWithGooglePay(7, PAYMENT));
    expect([error.status, error.message]).toEqual([400, 'У вас вже активовано преміум тариф.']);
    expect(tx.create).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });
});

describe('handleLiqPayCallback', () => {
  const PENDING = { id: 'tx-1', user_id: 7, status: 'pending', amount: '299.00', currency: 'UAH' };
  const callback = (overrides = {}, key = 'platform-priv') => {
    const data = Buffer.from(JSON.stringify({ order_id: 'tx-1', status: 'success', amount: 299, currency: 'UAH', payment_id: 777, ...overrides })).toString('base64');
    return { data, signature: LiqPayService.sign(data, key) };
  };

  beforeEach(() => {
    tx.findById.mockResolvedValue({ ...PENDING });
  });

  it.each([[{}], [{ data: 'x' }], [{ signature: 'x' }]])('без data або signature (%j) — 400', async (body) => {
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback(body));
    expect([error.status, error.message]).toEqual([400, 'Missing data or signature']);
  });

  it.each([[undefined], ['']])('без приватного ключа платформи (%j) callback не приймається — 500', async (value) => {
    const request = callback();
    if (value === undefined) delete process.env.LIQPAY_PRIVATE_KEY;
    else process.env.LIQPAY_PRIVATE_KEY = value;
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback(request));
    expect([error.status, error.message]).toEqual([500, 'Ключі LiqPay платформи не налаштовані в системі.']);
    expect(tx.transaction).not.toHaveBeenCalled();
  });

  it('невірний підпис — 403', async () => {
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback(callback({}, 'wrong')));
    expect([error.status, error.message]).toEqual([403, 'Invalid signature']);
    expect(tx.transaction).not.toHaveBeenCalled();
  });

  it('пошкоджені дані з чинним підписом — 400', async () => {
    const data = Buffer.from('не json').toString('base64');
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback({ data, signature: LiqPayService.sign(data, 'platform-priv') }));
    expect([error.status, error.message]).toEqual([400, 'Invalid payload']);
  });

  it.each([['failure'], ['error'], ['reversed'], [undefined]])('статус %s тариф не змінює', async (status) => {
    await SubscriptionService.handleLiqPayCallback(callback({ status }));
    expect(tx.transaction).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });

  it('D-CFG-01: статус sandbox приймається лише при LIQPAY_SANDBOX=1', async () => {
    await SubscriptionService.handleLiqPayCallback(callback({ status: 'sandbox' }));
    expect(users.setPlan).not.toHaveBeenCalled();
    process.env.LIQPAY_SANDBOX = '1';
    await SubscriptionService.handleLiqPayCallback(callback({ status: 'sandbox' }));
    expect(users.setPlan).toHaveBeenCalledWith(7, 'PLUS', CONN);
  });

  it.each([['success'], ['wait_accept']])('статус %s закриває транзакцію й видає PLUS у транзакції БД', async (status) => {
    await SubscriptionService.handleLiqPayCallback(callback({ status }));
    expect(tx.findById).toHaveBeenCalledWith('tx-1', CONN);
    expect(tx.markSuccessIfPending).toHaveBeenCalledWith('tx-1', 777, CONN);
    expect(users.setPlan).toHaveBeenCalledWith(7, 'PLUS', CONN);
    expect(log).toEqual(['markSuccess', 'setPlan']);
  });

  it('номер транзакції береться до першого підкреслення', async () => {
    await SubscriptionService.handleLiqPayCallback(callback({ order_id: 'tx-1_1700000000' }));
    expect(tx.findById).toHaveBeenCalledWith('tx-1', CONN);
  });

  it('відсутній payment_id зберігається як NULL', async () => {
    await SubscriptionService.handleLiqPayCallback(callback({ payment_id: undefined }));
    expect(tx.markSuccessIfPending).toHaveBeenCalledWith('tx-1', null, CONN);
  });

  it('невідома транзакція — нічого не змінюється', async () => {
    tx.findById.mockResolvedValue(undefined);
    await SubscriptionService.handleLiqPayCallback(callback());
    expect(tx.markSuccessIfPending).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });

  it.each([['success'], ['failed'], ['refunded']])('транзакція зі статусом %s повторно не обробляється', async (status) => {
    tx.findById.mockResolvedValue({ ...PENDING, status });
    await SubscriptionService.handleLiqPayCallback(callback());
    expect(tx.markSuccessIfPending).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });

  it.each([
    ['сума', { amount: 1 }],
    ['валюта', { currency: 'USD' }],
    ['суми немає', { amount: undefined }],
    ['валюти немає', { currency: undefined }],
  ])('D-SEC-07: %s не збігається з тарифом — 400, тариф не змінюється', async (_title, overrides) => {
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback(callback(overrides)));
    expect([error.status, error.message]).toEqual([400, 'Amount or currency mismatch']);
    expect(tx.markSuccessIfPending).not.toHaveBeenCalled();
    expect(users.setPlan).not.toHaveBeenCalled();
  });

  it('сума й валюта беруться із записаної транзакції, а не з константи', async () => {
    tx.findById.mockResolvedValue({ ...PENDING, amount: '150.00', currency: 'UAH' });
    const error = await serviceFailure(() => SubscriptionService.handleLiqPayCallback(callback()));
    expect(error.status).toBe(400);
  });

  it('якщо паралельний callback уже закрив транзакцію, тариф вдруге не видається', async () => {
    tx.markSuccessIfPending.mockResolvedValue(false);
    await SubscriptionService.handleLiqPayCallback(callback());
    expect(users.setPlan).not.toHaveBeenCalled();
  });
});
