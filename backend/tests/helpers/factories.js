// backend/tests/helpers/factories.js
// Створення тестових даних прямими SQL-запитами (не через API, щоб не залежати від тестованого коду).
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { query } from './testDb.js';

const require = createRequire(import.meta.url);
const { encrypt, decrypt } = require('../../utils/encryption');
const bcrypt = require('bcrypt');

let counter = 0;
const next = () => ++counter;

// overrides.password: якщо задано, зберігається bcrypt-хеш (потрібен для передачі сайту); інакше хеш-заглушка.
export async function createUser(overrides = {}) {
  const i = next();
  const { password, ...rest } = overrides;
  const user = {
    username: `user_${i}`,
    email: `user${i}@test.local`,
    role: 'user',
    plan: 'FREE',
    status: 'active',
    ...rest,
  };
  const passwordHash = password ? bcrypt.hashSync(password, 4) : 'not-a-real-hash';
  const result = await query(
    `INSERT INTO users (username, email, password_hash, role, plan, status, is_verified, token_version)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
    [user.username, user.email, passwordHash, user.role, user.plan, user.status]
  );
  return { id: result.insertId, token_version: 0, password, ...user };
}

// overrides.liqpay = { publicKey, privateKey }: приватний ключ шифрується так само, як при збереженні в застосунку.
export async function createSite(owner, overrides = {}) {
  const i = next();
  const site = {
    title: `Магазин ${i}`,
    site_path: `shop-${i}`,
    status: 'published',
    is_online_payment_enabled: 1,
    is_cod_enabled: 1,
    liqpay: null,
    ...overrides,
  };
  const result = await query(
    `INSERT INTO sites (user_id, site_path, title, status, is_online_payment_enabled, is_cod_enabled,
                        liqpay_public_key, liqpay_private_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      owner.id, site.site_path, site.title, site.status,
      site.is_online_payment_enabled, site.is_cod_enabled,
      site.liqpay ? site.liqpay.publicKey : null,
      site.liqpay ? encrypt(site.liqpay.privateKey) : null,
    ]
  );
  return { id: result.insertId, user_id: owner.id, ...site };
}

export async function createProduct(site, overrides = {}) {
  const i = next();
  const product = {
    name: `Товар ${i}`,
    type: 'physical',
    price: 100,
    stock_quantity: null,
    is_available: 1,
    sale_percentage: 0,
    digital_file_url: null,
    ...overrides,
  };
  const result = await query(
    `INSERT INTO products (site_id, name, type, price, stock_quantity, is_available, sale_percentage, digital_file_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      site.id, product.name, product.type, product.price, product.stock_quantity,
      product.is_available, product.sale_percentage, product.digital_file_url,
    ]
  );
  return { id: result.insertId, site_id: site.id, ...product };
}

// permissions за замовчуванням порожній об'єкт: застосунок їх не перевіряє (D-SEC-06), тест передає значення явно.
export async function addCollaborator(site, user, role = 'editor', permissions = {}) {
  await query(
    `INSERT INTO site_collaborators (site_id, user_id, role, permissions) VALUES (?, ?, ?, ?)`,
    [site.id, user.id, role, JSON.stringify(permissions)]
  );
}

export async function createPage(site, overrides = {}) {
  const i = next();
  const page = {
    name: `Сторінка ${i}`,
    slug: `page-${i}`,
    block_content: [],
    is_homepage: 0,
    seo_title: null,
    ...overrides,
  };
  const result = await query(
    `INSERT INTO pages (site_id, name, slug, block_content, is_homepage, seo_title) VALUES (?, ?, ?, ?, ?, ?)`,
    [site.id, page.name, page.slug, JSON.stringify(page.block_content), page.is_homepage, page.seo_title]
  );
  return { id: result.insertId, site_id: site.id, ...page };
}

export async function createCategory(site, overrides = {}) {
  const i = next();
  const category = { name: `Категорія ${i}`, discount_percentage: 0, icon: 'folder', ...overrides };
  const result = await query(
    `INSERT INTO categories (site_id, name, discount_percentage, icon) VALUES (?, ?, ?, ?)`,
    [site.id, category.name, category.discount_percentage, category.icon]
  );
  return { id: result.insertId, site_id: site.id, ...category };
}

// owner = null для системного шаблону. content — значення default_block_content (об'єкт або масив).
export async function createTemplate(owner, overrides = {}) {
  const i = next();
  const template = {
    name: `Шаблон ${i}`,
    type: 'system',
    is_ready: 1,
    access_level: 'public',
    content: { pages: [{ title: 'Головна', slug: 'home', blocks: [] }] },
    ...overrides,
  };
  const result = await query(
    `INSERT INTO templates (user_id, name, default_block_content, type, is_ready, access_level)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [owner ? owner.id : null, template.name, JSON.stringify(template.content), template.type, template.is_ready, template.access_level]
  );
  return { id: result.insertId, ...template };
}

// overrides.hours: через скільки годин спливає запрошення (від'ємне значення — вже спливло).
export async function createInvite(site, creator, overrides = {}) {
  const invite = { token: crypto.randomBytes(16).toString('hex'), role: 'editor', hours: 48, ...overrides };
  const expiresAt = new Date(Date.now() + invite.hours * 3600 * 1000);
  await query(
    `INSERT INTO site_invites (token, site_id, created_by, role, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [invite.token, site.id, creator.id, invite.role, expiresAt]
  );
  return invite;
}

// Блокування редагування сайту користувачем на ms мілісекунд від зараз (від'ємне значення — блокування вже спливло).
// Час передається з Node (а не через NOW()), щоб результат не залежав від часового поясу сервера БД.
export async function setSiteLock(site, user, ms) {
  await query('UPDATE sites SET locked_by_user_id = ?, locked_until = ? WHERE id = ?', [
    user.id, new Date(Date.now() + ms), site.id,
  ]);
}

// overrides.items = [{ product, quantity }]; сума замовлення — за каталожними цінами товарів.
export async function createOrder(site, customer, overrides = {}) {
  const order = {
    id: crypto.randomBytes(6).toString('hex'),
    status: 'pending',
    payment_method: 'online',
    customer_name: customer.username,
    customer_phone: '+380501234567',
    delivery_address: 'Київ, вул. Хрещатик, 1',
    items: [],
    ...overrides,
  };
  const total = order.items.reduce((sum, { product, quantity }) => sum + Number(product.price) * quantity, 0);
  await query(
    `INSERT INTO orders (id, site_id, customer_id, customer_name, customer_email, customer_phone,
                         delivery_address, total_amount, status, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.id, site.id, customer.id, order.customer_name, customer.email, order.customer_phone,
      order.delivery_address, total, order.status, order.payment_method,
    ]
  );
  for (const { product, quantity } of order.items) {
    await query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, type, digital_file_url, options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, product.id, product.name, quantity, product.price, product.type, product.digital_file_url, JSON.stringify({})]
    );
  }
  return { ...order, total_amount: total };
}

export async function setGlobalSetting(name, value) {
  await query(`UPDATE global_settings SET \`${name}\` = ? WHERE id = 1`, [value]);
}

// Змінює стовпці користувача, яких не задає createUser: slug, google_id, password_hash (null — акаунт лише через Google),
// is_verified, otp_*, token_version, deleted_at, профіль. Дати передаються з Node (не через NOW()), як у setSiteLock.
const PATCHABLE_USER_COLUMNS = new Set([
  'slug', 'google_id', 'password_hash', 'is_verified', 'otp_code', 'otp_expires', 'otp_purpose', 'token_version',
  'status', 'role', 'plan', 'deleted_at', 'last_login_at', 'avatar_url', 'bio', 'phone_number', 'is_profile_public',
  'social_telegram', 'social_instagram', 'social_website',
]);

export async function patchUser(user, fields) {
  const columns = Object.keys(fields);
  for (const column of columns) {
    if (!PATCHABLE_USER_COLUMNS.has(column)) throw new Error(`patchUser: стовпець ${column} не підтримується`);
  }
  await query(
    `UPDATE users SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => fields[column]), user.id]
  );
}

// Очікує код підтвердження в БД: purpose — призначення коду, minutes — через скільки хвилин він спливає (від'ємне — уже сплив).
export async function setOtp(user, { code = '123456', purpose = 'VERIFY_EMAIL', minutes = 15 } = {}) {
  await patchUser(user, { otp_code: code, otp_purpose: purpose, otp_expires: new Date(Date.now() + minutes * 60 * 1000) });
  return code;
}

// Звернення до підтримки напряму в БД. minutesAgo — вік звернення (для обмеження «раз на 20 хвилин» і сортування).
export async function createTicket(user, overrides = {}) {
  const i = next();
  const ticket = {
    subject: `Тема ${i}`,
    body: `Текст звернення ${i}`,
    type: 'general',
    status: 'open',
    closed_by: null,
    minutesAgo: 60,
    ...overrides,
  };
  const createdAt = new Date(Date.now() - ticket.minutesAgo * 60 * 1000);
  const result = await query(
    `INSERT INTO support_tickets (user_id, subject, body, attachments, type, status, closed_by, created_at, updated_at)
     VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
    [user.id, ticket.subject, ticket.body, ticket.type, ticket.status, ticket.closed_by, createdAt, createdAt]
  );
  return { id: result.insertId, user_id: user.id, ...ticket };
}

export async function addTicketReply(ticket, author, overrides = {}) {
  const i = next();
  const reply = { body: `Відповідь ${i}`, minutesAgo: 30, ...overrides };
  const createdAt = new Date(Date.now() - reply.minutesAgo * 60 * 1000);
  const result = await query(
    `INSERT INTO ticket_replies (ticket_id, user_id, body, attachments, created_at) VALUES (?, ?, ?, '[]', ?)`,
    [ticket.id, author.id, reply.body, createdAt]
  );
  return { id: result.insertId, ticket_id: ticket.id, user_id: author.id, ...reply };
}

// Попередження користувачу (страйк) через сайт.
export async function createWarning(user, site, reason = null) {
  const result = await query('INSERT INTO user_warnings (user_id, site_id, reason_note) VALUES (?, ?, ?)', [
    user.id, site ? site.id : null, reason,
  ]);
  return { id: result.insertId };
}

// ---- Читання стану БД для перевірок ----
export async function getOrder(id) {
  const rows = await query('SELECT * FROM orders WHERE id = ?', [id]);
  return rows[0];
}

export async function getOrderItems(orderId) {
  return query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
}

export async function countOrders() {
  const rows = await query('SELECT COUNT(*) AS count FROM orders');
  return rows[0].count;
}

// Кількість рядків таблиці (за потреби з умовою): countRows('pages', 'site_id = ?', [site.id]).
export async function countRows(table, where = '1 = 1', params = []) {
  const rows = await query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${where}`, params);
  return rows[0].count;
}

export async function getProduct(id) {
  const rows = await query('SELECT * FROM products WHERE id = ?', [id]);
  return rows[0];
}

export async function getUser(id) {
  const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}

export async function getUserByEmail(email) {
  const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}

export async function getTicket(id) {
  const rows = await query('SELECT * FROM support_tickets WHERE id = ?', [id]);
  return rows[0];
}

export async function getTicketReplies(ticketId) {
  return query('SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at, id', [ticketId]);
}

export async function getSite(id) {
  const rows = await query('SELECT * FROM sites WHERE id = ?', [id]);
  return rows[0];
}

export async function getPage(id) {
  const rows = await query('SELECT * FROM pages WHERE id = ?', [id]);
  return rows[0];
}

export async function getPages(siteId) {
  return query('SELECT * FROM pages WHERE site_id = ? ORDER BY id', [siteId]);
}

export async function getCategory(id) {
  const rows = await query('SELECT * FROM categories WHERE id = ?', [id]);
  return rows[0];
}

export async function getCollaboratorRows(siteId) {
  return query('SELECT * FROM site_collaborators WHERE site_id = ? ORDER BY user_id', [siteId]);
}

export async function getReview(id) {
  const rows = await query('SELECT * FROM product_reviews WHERE id = ?', [id]);
  return rows[0];
}

export async function getTransactions() {
  return query('SELECT * FROM transactions ORDER BY created_at, id');
}

// Розшифрований приватний ключ LiqPay із рядка sites.liqpay_private_key.
export function decryptKey(value) {
  return decrypt(value);
}
