// backend/tests/unit/OrderService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OrderService = require('../../services/OrderService');
const OrderRepository = require('../../repositories/OrderRepository');
const ProductRepository = require('../../repositories/ProductRepository');
const GlobalSettingsRepository = require('../../repositories/GlobalSettingsRepository');
const TransactionRepository = require('../../repositories/TransactionRepository');
const LiqPayService = require('../../services/LiqPayService');
const PaymentService = require('../../services/PaymentService');
const emailService = require('../../utils/emailService');
const { encrypt } = require('../../utils/encryption');
const { ServiceError } = require('../../services/ServiceError');

const CONN = { name: 'connection' };
const PRIVATE_KEY = 'seller-private-key';
const SITE = {
  user_id: 1, liqpay_public_key: 'pub', liqpay_private_key: null, is_online_payment_enabled: 1, is_cod_enabled: 1,
};
const PHYSICAL = { id: 10, name: 'Кава', price: '100.00', type: 'physical', digital_file_url: null, stock_quantity: 5 };
const DIGITAL = { id: 11, name: 'Книга', price: '50.00', type: 'digital', digital_file_url: 'https://f.test/b.pdf', stock_quantity: null };

async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('Очікувалася помилка');
}

async function serviceFailure(fn) {
  const error = await failure(fn);
  expect(error).toBeInstanceOf(ServiceError);
  return error;
}

let repo;
let products;
let log;

beforeEach(() => {
  log = [];
  repo = {
    transaction: vi.spyOn(OrderRepository, 'transaction').mockImplementation(async (work) => work(CONN)),
    findSiteForPayment: vi.spyOn(OrderRepository, 'findSiteForPayment').mockResolvedValue({ ...SITE }),
    findSiteForCallback: vi.spyOn(OrderRepository, 'findSiteForCallback').mockResolvedValue({ liqpay_private_key: encrypt(PRIVATE_KEY), site_theme_accent: 'green' }),
    findSiteOwnerAndAccent: vi.spyOn(OrderRepository, 'findSiteOwnerAndAccent').mockResolvedValue({ user_id: 1, site_theme_accent: 'green' }),
    isCollaborator: vi.spyOn(OrderRepository, 'isCollaborator').mockResolvedValue(false),
    findCustomer: vi.spyOn(OrderRepository, 'findCustomer').mockResolvedValue({ username: 'buyer', email: 'buyer@test.local' }),
    countPending: vi.spyOn(OrderRepository, 'countPending').mockResolvedValue(0),
    create: vi.spyOn(OrderRepository, 'create').mockResolvedValue(undefined),
    addItem: vi.spyOn(OrderRepository, 'addItem').mockResolvedValue(undefined),
    findById: vi.spyOn(OrderRepository, 'findById').mockResolvedValue(undefined),
    findByIdAndCustomer: vi.spyOn(OrderRepository, 'findByIdAndCustomer').mockResolvedValue(undefined),
    findBySite: vi.spyOn(OrderRepository, 'findBySite').mockResolvedValue([]),
    findByCustomer: vi.spyOn(OrderRepository, 'findByCustomer').mockResolvedValue([]),
    findItems: vi.spyOn(OrderRepository, 'findItems').mockResolvedValue([]),
    findItemsForPayment: vi.spyOn(OrderRepository, 'findItemsForPayment').mockResolvedValue([]),
    findItemsWithImages: vi.spyOn(OrderRepository, 'findItemsWithImages').mockResolvedValue([]),
    updateStatus: vi.spyOn(OrderRepository, 'updateStatus').mockImplementation(async () => { log.push('updateStatus'); }),
    settleIfPending: vi.spyOn(OrderRepository, 'settleIfPending').mockImplementation(async () => { log.push('settleIfPending'); return true; }),
  };
  products = {
    findForCheckout: vi.spyOn(ProductRepository, 'findForCheckout').mockImplementation(async (id) => ({ 10: PHYSICAL, 11: DIGITAL }[id])),
    findStock: vi.spyOn(ProductRepository, 'findStock').mockResolvedValue({ stock_quantity: 5, name: 'Кава' }),
    decrementStock: vi.spyOn(ProductRepository, 'decrementStock').mockImplementation(async () => { log.push('decrementStock'); }),
  };
  vi.spyOn(GlobalSettingsRepository, 'findBilling').mockResolvedValue({ billing_enabled: 1 });
  vi.spyOn(TransactionRepository, 'create').mockImplementation(async () => { log.push('transaction'); });
  vi.spyOn(emailService, 'sendDigitalGoodsEmail').mockImplementation(async () => { log.push('email'); });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('billing', () => {
  it.each([
    [{ billing_enabled: 1 }, true], [{ billing_enabled: 0 }, false], [null, true],
  ])('налаштування %j → %j', async (row, expected) => {
    GlobalSettingsRepository.findBilling.mockResolvedValue(row);
    expect(await OrderService.isBillingEnabled()).toBe(expected);
  });

  it('помилка читання налаштувань вважається ввімкненою оплатою', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    GlobalSettingsRepository.findBilling.mockImplementation(async () => { throw new Error('no table'); });
    try {
      expect(await OrderService.isBillingEnabled()).toBe(true);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('getBillingPausedError: null за ввімкненої оплати, інакше ServiceError 403', async () => {
    expect(await OrderService.getBillingPausedError()).toBeNull();
    GlobalSettingsRepository.findBilling.mockResolvedValue({ billing_enabled: 0 });
    const error = await OrderService.getBillingPausedError();
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Прийом платежів тимчасово призупинено адміністрацією платформи.');
  });
});

describe('checkout: вхідні дані', () => {
  it('без siteId — 400, транзакція не відкривається', async () => {
    const error = await serviceFailure(() => OrderService.checkout(2, { items: [{ id: 10, quantity: 1 }] }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Не вказано магазин для оформлення.');
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [[]]])('список товарів %j — 400', async (items) => {
    const error = await serviceFailure(() => OrderService.checkout(2, { siteId: 3, items }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Список товарів порожній.');
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it.each([['online', 'online'], ['cod', 'cod'], ['bitcoin', 'online'], [undefined, 'online']])(
    'спосіб оплати %j → %j',
    async (input, expected) => {
      const result = await OrderService.checkout(2, {
        siteId: 3, items: [{ id: 10, quantity: 1 }], paymentMethod: input, customerData: { address: 'Київ' },
      });
      expect(result.paymentMethod).toBe(expected);
    }
  );
});

describe('checkout: перевірки в транзакції', () => {
  const run = (overrides = {}) => OrderService.checkout(2, {
    siteId: 3, items: [{ id: 10, quantity: 1 }], paymentMethod: 'cod', customerData: { address: 'Київ' }, ...overrides,
  });

  it('магазин не знайдено — 404', async () => {
    repo.findSiteForPayment.mockResolvedValue(undefined);
    const error = await serviceFailure(run);
    expect([error.status, error.message]).toEqual([404, 'Магазин не знайдено.']);
  });

  it('власник не купує у власному магазині — 403 (порівняння як рядків)', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, user_id: '2' });
    const error = await serviceFailure(run);
    expect([error.status, error.message]).toEqual([403, 'Ви не можете купувати товари у власному магазині.']);
  });

  it('співавтор не оформлює замовлення — 403', async () => {
    repo.isCollaborator.mockResolvedValue(true);
    const error = await serviceFailure(run);
    expect([error.status, error.message]).toEqual([403, 'Співавтори не можуть оформлювати замовлення на цьому сайті.']);
  });

  it('онлайн-оплата вимкнена — 400', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, is_online_payment_enabled: 0 });
    const error = await serviceFailure(() => run({ paymentMethod: 'online' }));
    expect([error.status, error.message]).toEqual([400, 'Продавець тимчасово не приймає онлайн оплату.']);
  });

  it('післяплата вимкнена — 400', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, is_cod_enabled: 0 });
    const error = await serviceFailure(run);
    expect([error.status, error.message]).toEqual([400, 'Продавець не відправляє товари післяплатою.']);
  });

  it('D-ARC-10: відсутній користувач — звичайна помилка без статусу', async () => {
    repo.findCustomer.mockResolvedValue(undefined);
    const error = await failure(run);
    expect(error).not.toBeInstanceOf(ServiceError);
    expect(error.status).toBeUndefined();
    expect(error.message).toBe('Користувача не знайдено');
  });

  it('п\'ять неоплачених замовлень — 429', async () => {
    repo.countPending.mockResolvedValue(5);
    const error = await serviceFailure(run);
    expect(error.status).toBe(429);
    expect(error.message).toContain('ліміту неоплачених замовлень (5)');
  });

  it('чотири неоплачених замовлення ще дозволені', async () => {
    repo.countPending.mockResolvedValue(4);
    await run();
    expect(repo.create).toHaveBeenCalled();
  });

  it('антиспам-запит отримує пошту з БД і телефон з форми', async () => {
    await run({ customerData: { address: 'Київ', phone: '+380501112233', name: 'Ім\'я' } });
    expect(repo.countPending).toHaveBeenCalledWith(3, 2, 'buyer@test.local', '+380501112233', CONN);
  });

  it('ключ продавця, який не розшифровується, — 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, liqpay_private_key: 'aa:bb:cc' });
    try {
      const failed = await serviceFailure(() => run({ paymentMethod: 'online' }));
      expect([failed.status, failed.message]).toEqual([500, 'Помилка дешифрування ключа оплати.']);
    } finally {
      error.mockRestore();
    }
  });

  it('усі читання й записи виконуються на з\'єднанні транзакції', async () => {
    await run();
    expect(repo.findSiteForPayment).toHaveBeenCalledWith(3, CONN);
    expect(repo.isCollaborator).toHaveBeenCalledWith(3, 2, CONN);
    expect(repo.findCustomer).toHaveBeenCalledWith(2, CONN);
    expect(products.findForCheckout).toHaveBeenCalledWith(10, 3, CONN);
    expect(repo.create.mock.calls[0][1]).toBe(CONN);
    expect(repo.addItem.mock.calls[0][2]).toBe(CONN);
  });
});

describe('checkout: товари', () => {
  const run = (items, overrides = {}) => OrderService.checkout(2, {
    siteId: 3, items, paymentMethod: 'cod', customerData: { address: 'Київ' }, ...overrides,
  });

  it('D-ARC-10: товар недоступний або чужого магазину — звичайна помилка без статусу', async () => {
    const error = await failure(() => run([{ id: 99, quantity: 1 }]));
    expect(error).not.toBeInstanceOf(ServiceError);
    expect(error.message).toBe('Деякі товари недоступні або не належать цьому магазину.');
  });

  it('кількість більша за залишок — помилка з назвою товару', async () => {
    const error = await failure(() => run([{ id: 10, quantity: 6 }]));
    expect(error.message).toBe('Недостатньо товару "Кава" на складі.');
  });

  it('кількість, що дорівнює залишку, дозволена', async () => {
    await run([{ id: 10, quantity: 5 }]);
    expect(repo.create).toHaveBeenCalled();
  });

  it('товар без обліку залишку (NULL) не обмежується', async () => {
    products.findForCheckout.mockResolvedValue({ ...PHYSICAL, stock_quantity: null });
    await run([{ id: 10, quantity: 1000 }]);
    expect(repo.create).toHaveBeenCalled();
  });

  it('цифровий товар не перевіряється на залишок', async () => {
    products.findForCheckout.mockResolvedValue({ ...DIGITAL, stock_quantity: 0 });
    const result = await run([{ id: 11, quantity: 3 }], { paymentMethod: 'online', customerData: undefined });
    expect(result.orderId).toBeTruthy();
  });

  it('фізичний товар без адреси — помилка', async () => {
    for (const customerData of [undefined, {}, { address: '' }, { address: '   ' }]) {
      const error = await failure(() => run([{ id: 10, quantity: 1 }], { customerData }));
      expect(error.message).toBe('Адреса доставки обов\'язкова для фізичних товарів.');
    }
  });

  it('цифровий товар не можна замовити післяплатою', async () => {
    const error = await failure(() => run([{ id: 11, quantity: 1 }], { paymentMethod: 'cod' }));
    expect(error.message).toBe('Цифрові товари не можна замовити післяплатою.');
  });

  it('суто цифрове замовлення отримує адресу «Цифрова доставка» і не вимагає адреси', async () => {
    await run([{ id: 11, quantity: 1 }], { paymentMethod: 'online', customerData: undefined });
    expect(repo.create.mock.calls[0][0].deliveryAddress).toBe('Цифрова доставка');
  });

  it('змішане замовлення вважається фізичним', async () => {
    await run([{ id: 11, quantity: 1 }, { id: 10, quantity: 1 }]);
    expect(repo.create.mock.calls[0][0].deliveryAddress).toBe('Київ');
  });

  it('D-BIZ-01: сума — ціна з БД × кількість, опції та знижки не враховуються', async () => {
    const result = await run([{ id: 10, quantity: 2, options: { size: 'XL' } }, { id: 11, quantity: 1 }]);
    expect(repo.create.mock.calls[0][0].totalAmount).toBe(250);
    expect(result.orderId).toBe(repo.create.mock.calls[0][0].id);
  });

  it("D-BIZ-09: від'ємна кількість приймається, сума від'ємна", async () => {
    await run([{ id: 10, quantity: -1 }]);
    expect(repo.create.mock.calls[0][0].totalAmount).toBe(-100);
    expect(repo.addItem.mock.calls[0][1].quantity).toBe(-1);
  });

  it('D-BIZ-02: залишок при оформленні не списується', async () => {
    await run([{ id: 10, quantity: 5 }]);
    expect(products.decrementStock).not.toHaveBeenCalled();
  });

  it('D-BIZ-02: один товар у двох позиціях перевіряється на залишок окремо кожен раз', async () => {
    await run([{ id: 10, quantity: 5 }, { id: 10, quantity: 5 }]);
    expect(repo.addItem).toHaveBeenCalledTimes(2);
    expect(repo.create.mock.calls[0][0].totalAmount).toBe(1000);
  });

  it('позиції зберігаються з опціями за замовчуванням {}', async () => {
    await run([{ id: 10, quantity: 1 }]);
    const [orderId, item] = repo.addItem.mock.calls[0];
    expect(orderId).toBe(repo.create.mock.calls[0][0].id);
    expect(item).toMatchObject({ id: 10, name: 'Кава', quantity: 1, options: {} });
  });

  it('замовлення створюється з даними покупця: ім\'я з форми, інакше з акаунта; пошта з БД', async () => {
    await run([{ id: 10, quantity: 1 }], { customerData: { address: 'Київ', name: 'Іван', phone: '1' } });
    expect(repo.create.mock.calls[0][0]).toMatchObject({
      siteId: 3, customerId: 2, customerName: 'Іван', customerEmail: 'buyer@test.local', customerPhone: '1', paymentMethod: 'cod',
    });
    await run([{ id: 10, quantity: 1 }]);
    expect(repo.create.mock.calls[1][0]).toMatchObject({ customerName: 'buyer', customerPhone: '' });
  });

  it('номер замовлення — 12 символів із латиниці й цифр, різний у різних замовлень', async () => {
    const a = await run([{ id: 10, quantity: 1 }]);
    const b = await run([{ id: 10, quantity: 1 }]);
    expect(a.orderId).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(a.orderId).not.toBe(b.orderId);
  });
});

describe('checkout: відповідь', () => {
  const base = { siteId: 3, items: [{ id: 10, quantity: 1 }], customerData: { address: 'Київ' } };

  it('онлайн із ключами продавця — дані LiqPay і підпис', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, liqpay_private_key: encrypt(PRIVATE_KEY) });
    const create = vi.spyOn(LiqPayService, 'createPayment').mockReturnValue({ data: 'D', signature: 'S' });
    const result = await OrderService.checkout(2, { ...base, paymentMethod: 'online' });
    expect(result).toEqual({ liqpayData: 'D', liqpaySignature: 'S', orderId: result.orderId, paymentMethod: 'online' });
    expect(create).toHaveBeenCalledWith(result.orderId, 100, 'pub', PRIVATE_KEY);
  });

  it('онлайн без ключів продавця — лише номер і спосіб', async () => {
    const result = await OrderService.checkout(2, { ...base, paymentMethod: 'online' });
    expect(Object.keys(result).sort()).toEqual(['orderId', 'paymentMethod']);
  });

  it('післяплата — лише номер і спосіб, ключі не розшифровуються', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, liqpay_private_key: 'aa:bb:cc' });
    const result = await OrderService.checkout(2, { ...base, paymentMethod: 'cod' });
    expect(result).toEqual({ orderId: result.orderId, paymentMethod: 'cod' });
  });

  it('помилка в транзакції передається далі без змін', async () => {
    const boom = Object.assign(new Error('db down'), { code: 'ER_X' });
    repo.transaction.mockImplementation(async () => { throw boom; });
    await expect(OrderService.checkout(2, { ...base, paymentMethod: 'cod' })).rejects.toBe(boom);
  });
});

describe('createPayment', () => {
  const ORDER = { id: 'ORD1', site_id: 3, status: 'pending', payment_method: 'online', total_amount: '100.00' };

  beforeEach(() => {
    repo.findByIdAndCustomer.mockResolvedValue({ ...ORDER });
    repo.findItemsForPayment.mockResolvedValue([{ product_id: 10, quantity: 1, type: 'physical' }]);
  });

  it('оплата платформою призупинена — 403', async () => {
    GlobalSettingsRepository.findBilling.mockResolvedValue({ billing_enabled: 0 });
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect(error.status).toBe(403);
    expect(repo.findByIdAndCustomer).not.toHaveBeenCalled();
  });

  it('чуже або відсутнє замовлення — 404', async () => {
    repo.findByIdAndCustomer.mockResolvedValue(undefined);
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([404, 'Замовлення не знайдено']);
    expect(repo.findByIdAndCustomer).toHaveBeenCalledWith('ORD1', 2);
  });

  it('власник магазину не оплачує — 403', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, user_id: 2 });
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([403, 'Ви не можете оплачувати власні товари.']);
  });

  it('співавтор не оплачує — 403', async () => {
    repo.isCollaborator.mockResolvedValue(true);
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([403, 'Співавтори не можуть оплачувати товари на цьому сайті.']);
  });

  it.each([['paid'], ['cancelled'], ['completed']])('замовлення зі статусом %s — 400', async (status) => {
    repo.findByIdAndCustomer.mockResolvedValue({ ...ORDER, status });
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([400, 'Це замовлення вже оплачено або скасовано.']);
  });

  it('замовлення з післяплатою — 400', async () => {
    repo.findByIdAndCustomer.mockResolvedValue({ ...ORDER, payment_method: 'cod' });
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect(error.status).toBe(400);
    expect(error.message).toContain('оплатою при отриманні');
  });

  it('залишку стало менше за кількість — 400 з назвою товару', async () => {
    products.findStock.mockResolvedValue({ stock_quantity: 0, name: 'Кава' });
    const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([400, 'Недостатньо товару "Кава" на складі.']);
  });

  it('цифрові позиції не перевіряються на залишок, NULL-залишок не обмежує', async () => {
    repo.findItemsForPayment.mockResolvedValue([
      { product_id: 11, quantity: 9, type: 'digital' },
      { product_id: 10, quantity: 9, type: 'physical' },
    ]);
    products.findStock.mockResolvedValue({ stock_quantity: null, name: 'Кава' });
    await OrderService.createPayment('ORD1', 2);
    expect(products.findStock).toHaveBeenCalledTimes(1);
    expect(products.findStock).toHaveBeenCalledWith(10);
  });

  it('магазин без онлайн-оплати або відсутній — 400', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, is_online_payment_enabled: 0 });
    let error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect([error.status, error.message]).toEqual([400, 'Магазин тимчасово не може приймати онлайн оплату.']);
    repo.findSiteForPayment.mockResolvedValue(undefined);
    error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
    expect(error.status).toBe(400);
  });

  it('без ключів LiqPay повертає номер і суму', async () => {
    expect(await OrderService.createPayment('ORD1', 2)).toEqual({ orderId: 'ORD1', amount: '100.00' });
  });

  it('з ключами повертає дані LiqPay і підпис', async () => {
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, liqpay_private_key: encrypt(PRIVATE_KEY) });
    const create = vi.spyOn(LiqPayService, 'createPayment').mockReturnValue({ data: 'D', signature: 'S' });
    expect(await OrderService.createPayment('ORD1', 2)).toEqual({ liqpayData: 'D', liqpaySignature: 'S' });
    expect(create).toHaveBeenCalledWith('ORD1', '100.00', 'pub', PRIVATE_KEY);
  });

  it('ключ, що не розшифровується, — 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.findSiteForPayment.mockResolvedValue({ ...SITE, liqpay_private_key: 'aa:bb:cc' });
    try {
      const error = await serviceFailure(() => OrderService.createPayment('ORD1', 2));
      expect([error.status, error.message]).toEqual([500, 'Помилка конфігурації ключів оплати продавця.']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('handleLiqPayCallback', () => {
  const ORDER = { id: 'ORD1', site_id: 3, status: 'pending', total_amount: '200.00', customer_email: 'buyer@test.local', customer_name: 'Іван' };
  const payload = (overrides = {}) => {
    const data = Buffer.from(JSON.stringify({ order_id: 'ORD1_1700000000', status: 'success', amount: 200, currency: 'UAH', ...overrides })).toString('base64');
    return { data, signature: LiqPayService.sign(data, PRIVATE_KEY) };
  };

  beforeEach(() => {
    repo.findById.mockResolvedValue({ ...ORDER });
    repo.findItems.mockResolvedValue([{ product_id: 10, quantity: 2, type: 'physical', digital_file_url: null }]);
  });

  it.each([[{}], [{ data: 'x' }], [{ signature: 'x' }]])('без data або signature (%j) — 400', async (body) => {
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback(body));
    expect([error.status, error.message]).toEqual([400, 'Missing data or signature']);
  });

  it('замовлення не знайдено — 404; номер береться до першого підкреслення', async () => {
    repo.findById.mockResolvedValue(undefined);
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback(payload()));
    expect([error.status, error.message]).toEqual([404, 'Order not found']);
    expect(repo.findById).toHaveBeenCalledWith('ORD1');
  });

  it('у магазину немає ключа — 400', async () => {
    repo.findSiteForCallback.mockResolvedValue({ liqpay_private_key: null });
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback(payload()));
    expect([error.status, error.message]).toEqual([400, 'Private key missing for site']);
  });

  it('ключ не розшифровується — 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.findSiteForCallback.mockResolvedValue({ liqpay_private_key: 'aa:bb:cc' });
    try {
      const error = await serviceFailure(() => OrderService.handleLiqPayCallback(payload()));
      expect([error.status, error.message]).toEqual([500, 'Private key decryption failed']);
    } finally {
      spy.mockRestore();
    }
  });

  it('невірний підпис — 403, замовлення не змінюється', async () => {
    const { data } = payload();
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback({ data, signature: 'bad' }));
    expect([error.status, error.message]).toEqual([403, 'Invalid signature']);
    expect(repo.settleIfPending).not.toHaveBeenCalled();
  });

  it.each([
    ['не JSON', Buffer.from('не json').toString('base64')],
    ['JSON-масив', Buffer.from('[]').toString('base64')],
    ['JSON-значення null', Buffer.from('null').toString('base64')],
    ['об\'єкт без order_id', Buffer.from('{"status":"success"}').toString('base64')],
  ])('D-SEC-07: пошкоджені дані (%s) — 400', async (_title, data) => {
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback({ data, signature: 'x' }));
    expect([error.status, error.message]).toEqual([400, 'Invalid payload']);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('фізичне замовлення стає paid, залишок списується в транзакції', async () => {
    await OrderService.handleLiqPayCallback(payload());
    expect(repo.transaction).toHaveBeenCalledTimes(1);
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
    expect(repo.findItems).toHaveBeenCalledWith('ORD1', CONN);
    expect(products.decrementStock).toHaveBeenCalledWith(10, 2, CONN);
    expect(emailService.sendDigitalGoodsEmail).not.toHaveBeenCalled();
  });

  it.each([['success'], ['wait_accept']])('статус %s приймається як успішна оплата', async (status) => {
    await OrderService.handleLiqPayCallback(payload({ status }));
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
  });

  it('D-CFG-01: статус sandbox не приймається, поки LIQPAY_SANDBOX не ввімкнено', async () => {
    await OrderService.handleLiqPayCallback(payload({ status: 'sandbox' }));
    expect(repo.settleIfPending).not.toHaveBeenCalled();
  });

  it('D-CFG-01: статус sandbox приймається, коли LIQPAY_SANDBOX=1', async () => {
    vi.stubEnv('LIQPAY_SANDBOX', '1');
    await OrderService.handleLiqPayCallback(payload({ status: 'sandbox' }));
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
  });

  it.each([['failure'], ['error'], ['reversed'], [undefined]])('статус %s замовлення не змінює', async (status) => {
    await OrderService.handleLiqPayCallback(payload({ status }));
    expect(repo.settleIfPending).not.toHaveBeenCalled();
    expect(repo.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['сума менша', { amount: 0.01 }],
    ['сума більша', { amount: 200.01 }],
    ['валюта інша', { currency: 'USD' }],
    ['сума й валюта інші', { amount: 0.01, currency: 'USD' }],
    ['суми немає', { amount: undefined }],
    ['валюти немає', { currency: undefined }],
    ['сума не число', { amount: 'багато' }],
    ['сума порожній рядок', { amount: '' }],
    ['сума null', { amount: null }],
  ])('D-SEC-07: %s — 400, замовлення не змінюється', async (_title, overrides) => {
    const error = await serviceFailure(() => OrderService.handleLiqPayCallback(payload(overrides)));
    expect([error.status, error.message]).toEqual([400, 'Amount or currency mismatch']);
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(products.decrementStock).not.toHaveBeenCalled();
  });

  it.each([
    ['число', { amount: 200 }],
    ['рядок', { amount: '200.00' }],
    ['рядок без копійок', { amount: '200' }],
    ['валюта в нижньому регістрі', { currency: 'uah' }],
  ])('D-SEC-07: збіжна сума й валюта (%s) приймаються', async (_title, overrides) => {
    await OrderService.handleLiqPayCallback(payload(overrides));
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
  });

  it.each([['paid'], ['completed'], ['cancelled'], ['shipped']])('замовлення зі статусом %s повторно не обробляється', async (status) => {
    repo.findById.mockResolvedValue({ ...ORDER, status });
    await OrderService.handleLiqPayCallback(payload());
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(repo.settleIfPending).not.toHaveBeenCalled();
  });

  it('якщо паралельний callback уже закрив замовлення, залишок і лист не повторюються', async () => {
    repo.settleIfPending.mockResolvedValue(false);
    repo.findItems.mockResolvedValue([
      { product_id: 10, quantity: 2, type: 'physical', digital_file_url: null },
      { product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'https://f.test/b.pdf' },
    ]);
    await OrderService.handleLiqPayCallback(payload());
    expect(products.decrementStock).not.toHaveBeenCalled();
    expect(emailService.sendDigitalGoodsEmail).not.toHaveBeenCalled();
  });

  it('суто цифрове замовлення стає completed, лист з файлами надсилається, залишок не списується', async () => {
    repo.findItems.mockResolvedValue([
      { product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'https://f.test/b.pdf' },
      { product_id: 12, quantity: 1, type: 'digital', digital_file_url: null },
    ]);
    await OrderService.handleLiqPayCallback(payload());
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'completed', CONN);
    expect(products.decrementStock).not.toHaveBeenCalled();
    expect(emailService.sendDigitalGoodsEmail).toHaveBeenCalledWith(
      'buyer@test.local', 'Іван', [{ product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'https://f.test/b.pdf' }], 'green'
    );
  });

  it('замовлення без позицій стає paid', async () => {
    repo.findItems.mockResolvedValue([]);
    await OrderService.handleLiqPayCallback(payload());
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
  });

  it('змішане замовлення: paid, списання залишку лише для фізичних, лист із цифровими файлами', async () => {
    repo.findItems.mockResolvedValue([
      { product_id: 10, quantity: 2, type: 'physical', digital_file_url: null },
      { product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'https://f.test/b.pdf' },
    ]);
    await OrderService.handleLiqPayCallback(payload());
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
    expect(products.decrementStock).toHaveBeenCalledTimes(1);
    expect(emailService.sendDigitalGoodsEmail).toHaveBeenCalledTimes(1);
  });

  it('порядок: статус → списання залишку → лист після завершення транзакції', async () => {
    repo.findItems.mockResolvedValue([
      { product_id: 10, quantity: 1, type: 'physical', digital_file_url: null },
      { product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'https://f.test/b.pdf' },
    ]);
    repo.transaction.mockImplementation(async (work) => {
      const result = await work(CONN);
      log.push('commit');
      return result;
    });
    await OrderService.handleLiqPayCallback(payload());
    expect(log).toEqual(['settleIfPending', 'decrementStock', 'commit', 'email']);
  });

  it('колір акценту за замовчуванням — blue', async () => {
    repo.findSiteForCallback.mockResolvedValue({ liqpay_private_key: encrypt(PRIVATE_KEY), site_theme_accent: null });
    repo.findItems.mockResolvedValue([{ product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'u' }]);
    await OrderService.handleLiqPayCallback(payload());
    expect(emailService.sendDigitalGoodsEmail.mock.calls[0][3]).toBe('blue');
  });
});

describe('payWithGooglePay', () => {
  const ORDER = { id: 'ORD1', site_id: 3, customer_id: 2, status: 'pending', payment_method: 'online', total_amount: '100.00', customer_email: 'b@test.local', customer_name: 'Іван' };
  const PAYMENT = { paymentMethodData: { tokenizationData: { token: 'abcdefghijklmnopqrstuvwxyz' } } };
  let verify;

  beforeEach(() => {
    repo.findById.mockResolvedValue({ ...ORDER });
    repo.findItems.mockResolvedValue([{ product_id: 10, quantity: 2, type: 'physical', digital_file_url: null }]);
    verify = vi.spyOn(PaymentService, 'verifyGooglePay').mockImplementation(async () => {
      log.push('verify');
      return { providerId: 'gpay_verified_1' };
    });
  });

  it('замовлення не знайдено — 404', async () => {
    repo.findById.mockResolvedValue(undefined);
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, {}));
    expect([error.status, error.message]).toEqual([404, 'Замовлення не знайдено']);
  });

  it('чуже замовлення — 403', async () => {
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 99, {}));
    expect([error.status, error.message]).toEqual([403, 'Доступ заборонено']);
    expect(verify).not.toHaveBeenCalled();
  });

  it('власник порівнюється як рядок', async () => {
    await OrderService.payWithGooglePay('ORD1', '2', {});
    expect(repo.settleIfPending).toHaveBeenCalled();
  });

  it.each([['paid'], ['completed']])('уже %s — 400', async (status) => {
    repo.findById.mockResolvedValue({ ...ORDER, status });
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, {}));
    expect([error.status, error.message]).toEqual([400, 'Замовлення вже оплачено']);
    expect(verify).not.toHaveBeenCalled();
    expect(repo.settleIfPending).not.toHaveBeenCalled();
  });

  it.each([['cancelled'], ['shipped']])('D-BIZ-08: замовлення зі статусом %s не оплачується — 400', async (status) => {
    repo.findById.mockResolvedValue({ ...ORDER, status });
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, {}));
    expect([error.status, error.message]).toEqual([400, 'Це замовлення вже оплачено або скасовано.']);
    expect(verify).not.toHaveBeenCalled();
    expect(repo.settleIfPending).not.toHaveBeenCalled();
  });

  it('D-BIZ-08: замовлення з післяплатою не оплачується — 400', async () => {
    repo.findById.mockResolvedValue({ ...ORDER, payment_method: 'cod' });
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, {}));
    expect([error.status, error.message]).toEqual([400, 'Це замовлення оформлено з оплатою при отриманні. Онлайн оплата недоступна.']);
    expect(verify).not.toHaveBeenCalled();
  });

  it('D-SEC-02: без підтвердження платежу сервером замовлення не змінюється (за замовчуванням — 501)', async () => {
    verify.mockRestore();
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, undefined));
    expect(error.status).toBe(501);
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(repo.settleIfPending).not.toHaveBeenCalled();
    expect(TransactionRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendDigitalGoodsEmail).not.toHaveBeenCalled();
  });

  it('D-SEC-02: відмова перевірки передається як є, нічого не записується', async () => {
    verify.mockRejectedValue(new ServiceError(402, 'declined'));
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, PAYMENT));
    expect([error.status, error.message]).toEqual([402, 'declined']);
    expect(repo.settleIfPending).not.toHaveBeenCalled();
    expect(TransactionRepository.create).not.toHaveBeenCalled();
  });

  it('перевірці передаються токен, сума, валюта й номер замовлення', async () => {
    await OrderService.payWithGooglePay('ORD1', 2, PAYMENT);
    expect(verify).toHaveBeenCalledWith(PAYMENT, { amount: '100.00', currency: 'UAH', reference: 'ORD1' });
  });

  it('усе виконується в одній транзакції на її з\'єднанні', async () => {
    await OrderService.payWithGooglePay('ORD1', 2, PAYMENT);
    expect(repo.transaction).toHaveBeenCalledTimes(1);
    expect(repo.findItems).toHaveBeenCalledWith('ORD1', CONN);
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'paid', CONN);
    expect(products.decrementStock).toHaveBeenCalledWith(10, 2, CONN);
    expect(repo.findSiteOwnerAndAccent).toHaveBeenCalledWith(3, CONN);
    expect(TransactionRepository.create.mock.calls[0][1]).toBe(CONN);
  });

  it('транзакція платформи записується власнику магазину з ідентифікатором від перевірки', async () => {
    await OrderService.payWithGooglePay('ORD1', 2, PAYMENT);
    const [row] = TransactionRepository.create.mock.calls[0];
    expect(row).toMatchObject({
      userId: 1, amount: '100.00', currency: 'UAH', status: 'success',
      providerId: 'gpay_verified_1', description: 'Оплата замовлення #ORD1 через Google Pay',
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('якщо паралельна оплата вже закрила замовлення — 400, залишок і транзакція не повторюються', async () => {
    repo.settleIfPending.mockResolvedValue(false);
    const error = await serviceFailure(() => OrderService.payWithGooglePay('ORD1', 2, PAYMENT));
    expect([error.status, error.message]).toEqual([400, 'Замовлення вже оплачено']);
    expect(products.decrementStock).not.toHaveBeenCalled();
    expect(TransactionRepository.create).not.toHaveBeenCalled();
  });

  it('цифрове замовлення: completed, лист з файлами, залишок не списується', async () => {
    repo.findItems.mockResolvedValue([{ product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'u' }]);
    await OrderService.payWithGooglePay('ORD1', 2, PAYMENT);
    expect(repo.settleIfPending).toHaveBeenCalledWith('ORD1', 'completed', CONN);
    expect(products.decrementStock).not.toHaveBeenCalled();
    expect(emailService.sendDigitalGoodsEmail).toHaveBeenCalledWith('b@test.local', 'Іван', [{ product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'u' }], 'green');
  });

  it('порядок: перевірка → статус → залишок → запис транзакції → лист після завершення транзакції', async () => {
    repo.findItems.mockResolvedValue([
      { product_id: 10, quantity: 1, type: 'physical', digital_file_url: null },
      { product_id: 11, quantity: 1, type: 'digital', digital_file_url: 'u' },
    ]);
    repo.transaction.mockImplementation(async (work) => {
      const result = await work(CONN);
      log.push('commit');
      return result;
    });
    await OrderService.payWithGooglePay('ORD1', 2, PAYMENT);
    expect(log).toEqual(['verify', 'settleIfPending', 'decrementStock', 'transaction', 'commit', 'email']);
  });
});

describe('списки замовлень', () => {
  it('listForSite: D-SEC-03 — без перевірки власника, до кожного замовлення додаються позиції', async () => {
    repo.findBySite.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);
    repo.findItemsWithImages.mockImplementation(async (id) => [{ order_id: id }]);
    const orders = await OrderService.listForSite(3);
    expect(orders).toEqual([{ id: 'A', items: [{ order_id: 'A' }] }, { id: 'B', items: [{ order_id: 'B' }] }]);
    expect(repo.findBySite).toHaveBeenCalledWith(3);
  });

  it('listForCustomer: посилання на цифровий файл приховано, доки замовлення не paid або completed', async () => {
    repo.findByCustomer.mockResolvedValue([
      { id: 'A', status: 'pending' }, { id: 'B', status: 'paid' }, { id: 'C', status: 'completed' }, { id: 'D', status: 'shipped' },
    ]);
    repo.findItemsWithImages.mockImplementation(async () => [{ digital_file_url: 'https://f.test/b.pdf' }]);
    const orders = await OrderService.listForCustomer(2);
    expect(orders.map((order) => order.items[0].digital_file_url)).toEqual([null, 'https://f.test/b.pdf', 'https://f.test/b.pdf', null]);
    expect(repo.findByCustomer).toHaveBeenCalledWith(2);
  });
});

describe('updateStatus', () => {
  it('D-SEC-03: будь-який статус записується без перевірки власника й значення', async () => {
    await OrderService.updateStatus('ORD1', 'whatever');
    expect(repo.updateStatus).toHaveBeenCalledWith('ORD1', 'whatever');
  });
});
