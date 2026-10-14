// backend/tests/unit/ProductService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ProductService = require('../../services/ProductService');
const ProductRepository = require('../../repositories/ProductRepository');
const OrderRepository = require('../../repositories/OrderRepository');
const SiteRepository = require('../../repositories/SiteRepository');
const { ServiceError } = require('../../services/ServiceError');

const OWNER_SITE = { id: 3, user_id: 11, collaborator_role: null, collaborator_permissions: null };
const collaboratorSite = (role, permissions) => ({
  id: 3, user_id: 1, collaborator_role: role, collaborator_permissions: permissions,
});
const PRODUCT = { id: 7, site_id: 3, name: 'Кава', categories: [{ id: 1 }, { id: 2 }], image_gallery: ['/a.jpg'] };

async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    return error;
  }
  throw new Error('Очікувалася ServiceError');
}

let repo;
let site;

beforeEach(() => {
  repo = {
    findById: vi.spyOn(ProductRepository, 'findById').mockResolvedValue(PRODUCT),
    create: vi.spyOn(ProductRepository, 'create').mockResolvedValue({ id: 99 }),
    update: vi.spyOn(ProductRepository, 'update').mockResolvedValue(true),
    delete: vi.spyOn(ProductRepository, 'delete').mockResolvedValue(true),
    addReview: vi.spyOn(ProductRepository, 'addReview').mockResolvedValue(undefined),
    updateReviewReply: vi.spyOn(ProductRepository, 'updateReviewReply').mockResolvedValue(undefined),
    deleteReview: vi.spyOn(ProductRepository, 'deleteReview').mockResolvedValue(undefined),
    findReviewById: vi.spyOn(ProductRepository, 'findReviewById').mockResolvedValue({ user_id: 50, product_id: 7 }),
    getReviewByUser: vi.spyOn(ProductRepository, 'getReviewByUser').mockResolvedValue(null),
    hasPurchased: vi.spyOn(OrderRepository, 'hasPurchased').mockResolvedValue(true),
  };
  site = vi.spyOn(SiteRepository, 'findWithCollaborator').mockResolvedValue(OWNER_SITE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getById', () => {
  it('повертає товар', async () => {
    expect(await ProductService.getById(7)).toBe(PRODUCT);
  });

  it('404, якщо товару немає', async () => {
    repo.findById.mockResolvedValue(null);
    const error = await failure(() => ProductService.getById(7));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Товар не знайдено.');
  });
});

describe('getAccessible', () => {
  it('перевіряє доступ до сайту товару: Site.findWithCollaborator(product.site_id, userId)', async () => {
    expect(await ProductService.getAccessible(7, 11, 'нема прав')).toBe(PRODUCT);
    expect(site).toHaveBeenCalledWith(3, 11);
  });

  it('403 із переданим повідомленням, якщо доступу до сайту немає', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.getAccessible(7, 11, 'нема прав'));
    expect(error.status).toBe(403);
    expect(error.message).toBe('нема прав');
  });

  it('404 до перевірки доступу, якщо товару немає (Site не викликається)', async () => {
    repo.findById.mockResolvedValue(null);
    const error = await failure(() => ProductService.getAccessible(7, 11, 'нема прав'));
    expect(error.status).toBe(404);
    expect(site).not.toHaveBeenCalled();
  });
});

describe('create', () => {
  const body = { site_id: 3, name: 'Чай', description: 'd', price: '12.5', type: 'physical' };

  it('403 і жодного запису, якщо немає доступу до сайту', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.create(11, body));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав для додавання товарів на цей сайт.');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('галерея-масив: перше зображення стає image_path, у репозиторій іде JSON-рядок усього масиву', async () => {
    await ProductService.create(11, { ...body, image_gallery: ['/1.jpg', '/2.jpg'] });
    const data = repo.create.mock.calls[0][0];
    expect(data.image_path).toBe('/1.jpg');
    expect(data.image_gallery).toBe(JSON.stringify(['/1.jpg', '/2.jpg']));
  });

  it('галерея-рядок перетворюється на масив з одним елементом', async () => {
    await ProductService.create(11, { ...body, image_gallery: '/only.jpg' });
    const data = repo.create.mock.calls[0][0];
    expect(data.image_path).toBe('/only.jpg');
    expect(data.image_gallery).toBe('["/only.jpg"]');
  });

  it('без галереї: image_path = null, image_gallery = "[]"', async () => {
    await ProductService.create(11, body);
    const data = repo.create.mock.calls[0][0];
    expect(data.image_path).toBeNull();
    expect(data.image_gallery).toBe('[]');
  });

  it('category_ids: одне значення стає масивом, відсутнє — порожнім масивом', async () => {
    await ProductService.create(11, { ...body, category_ids: 5 });
    expect(repo.create.mock.calls[0][0].category_ids).toEqual([5]);
    await ProductService.create(11, body);
    expect(repo.create.mock.calls[1][0].category_ids).toEqual([]);
  });

  it.each([
    ['12.5', 12.5], ['', 0], [undefined, 0], [null, 0], ['abc', 0], [7, 7],
  ])('ціна %j → %j', async (input, expected) => {
    await ProductService.create(11, { ...body, price: input });
    expect(repo.create.mock.calls[0][0].price).toBe(expected);
  });

  it.each([
    ['10', 10], ['', 0], [undefined, 0],
  ])('знижка %j → %j', async (input, expected) => {
    await ProductService.create(11, { ...body, sale_percentage: input });
    expect(repo.create.mock.calls[0][0].sale_percentage).toBe(expected);
  });

  it.each([
    ['5', 5], ['0', 0], ['', null], [undefined, null], ['abc', null],
  ])('залишок %j → %j', async (input, expected) => {
    await ProductService.create(11, { ...body, stock_quantity: input });
    expect(repo.create.mock.calls[0][0].stock_quantity).toBe(expected);
  });

  it('повертає результат репозиторію', async () => {
    expect(await ProductService.create(11, body)).toEqual({ id: 99 });
  });
});

describe('update', () => {
  const body = { name: 'Нова', description: 'd', price: '20', type: 'physical' };

  it('403 і жодного запису, якщо немає доступу', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.update(7, 11, body));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав для зміни цього товару.');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('без category_ids зберігає поточні категорії товару', async () => {
    await ProductService.update(7, 11, body);
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ category_ids: [1, 2] }));
  });

  it('category_ids: одне значення стає масивом, порожній масив очищає категорії', async () => {
    await ProductService.update(7, 11, { ...body, category_ids: 9 });
    expect(repo.update.mock.calls[0][1].category_ids).toEqual([9]);
    await ProductService.update(7, 11, { ...body, category_ids: [] });
    expect(repo.update.mock.calls[1][1].category_ids).toEqual([]);
  });

  it('image_gallery не передається в репозиторій, якщо відсутня в запиті', async () => {
    await ProductService.update(7, 11, body);
    expect('image_gallery' in repo.update.mock.calls[0][1]).toBe(false);
  });

  it('image_gallery: масив і одне значення серіалізуються в JSON-рядок', async () => {
    await ProductService.update(7, 11, { ...body, image_gallery: ['/x.jpg'] });
    expect(repo.update.mock.calls[0][1].image_gallery).toBe('["/x.jpg"]');
    await ProductService.update(7, 11, { ...body, image_gallery: '/y.jpg' });
    expect(repo.update.mock.calls[1][1].image_gallery).toBe('["/y.jpg"]');
  });

  it('числові поля очищаються так само, як при створенні', async () => {
    await ProductService.update(7, 11, { ...body, price: '', sale_percentage: 'abc', stock_quantity: '' });
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ price: 0, sale_percentage: 0, stock_quantity: null }));
  });
});

describe('remove', () => {
  it('403 і без видалення, якщо немає доступу', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.remove(7, 11));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав для видалення товарів на цьому сайті.');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('видаляє товар за id', async () => {
    await ProductService.remove(7, 11);
    expect(repo.delete).toHaveBeenCalledWith(7);
  });
});

describe('галерея (D-DEAD-08)', () => {
  it('addToGallery дописує зображення й викликає update лише з image_gallery', async () => {
    const result = await ProductService.addToGallery(7, 11, '/new.jpg');
    expect(result).toEqual(['/a.jpg', '/new.jpg']);
    expect(repo.update).toHaveBeenCalledWith(7, { image_gallery: '["/a.jpg","/new.jpg"]' });
  });

  it('addToGallery для товару без галереї створює галерею з одного зображення', async () => {
    repo.findById.mockResolvedValue({ ...PRODUCT, image_gallery: null });
    expect(await ProductService.addToGallery(7, 11, '/new.jpg')).toEqual(['/new.jpg']);
  });

  it('removeFromGallery: 400 без шляху, товар навіть не читається', async () => {
    const error = await failure(() => ProductService.removeFromGallery(7, 11, ''));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Шлях до зображення не вказано.');
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('removeFromGallery прибирає зображення зі списку', async () => {
    repo.findById.mockResolvedValue({ ...PRODUCT, image_gallery: ['/a.jpg', '/b.jpg'] });
    const result = await ProductService.removeFromGallery(7, 11, '/a.jpg');
    expect(result).toEqual(['/b.jpg']);
    expect(repo.update).toHaveBeenCalledWith(7, { image_gallery: '["/b.jpg"]' });
  });

  it('403 без доступу', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.addToGallery(7, 11, '/new.jpg'));
    expect(error.status).toBe(403);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('addReview', () => {
  const review = { rating: 4, comment: 'Смачно' };

  it.each([[undefined], [0], [6], [-1]])('рейтинг %j → 400, до БД не звертається', async (rating) => {
    const error = await failure(() => ProductService.addReview(7, 11, { rating, comment: 'ok' }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Рейтинг має бути від 1 до 5.');
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it.each([[undefined], [''], ['   ']])('коментар %j → 400', async (comment) => {
    const error = await failure(() => ProductService.addReview(7, 11, { rating: 4, comment }));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Коментар не може бути порожнім.');
  });

  it('404, якщо товару немає', async () => {
    repo.findById.mockResolvedValue(null);
    const error = await failure(() => ProductService.addReview(7, 11, review));
    expect(error.status).toBe(404);
    expect(repo.addReview).not.toHaveBeenCalled();
  });

  it('403, якщо користувач не купував товар', async () => {
    repo.hasPurchased.mockResolvedValue(false);
    const error = await failure(() => ProductService.addReview(7, 11, review));
    expect(error.status).toBe(403);
    expect(error.message).toBe('Ви можете залишити відгук лише на товар, який ви придбали.');
    expect(repo.hasPurchased).toHaveBeenCalledWith(11, 7);
    expect(repo.addReview).not.toHaveBeenCalled();
  });

  it('зберігає відгук', async () => {
    await ProductService.addReview(7, 11, review);
    expect(repo.addReview).toHaveBeenCalledWith(7, 11, 4, 'Смачно');
  });
});

describe('replyToReview', () => {
  it('403 без доступу до сайту товару', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.replyToReview(7, 21, 11, 'Дякуємо'));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав відповідати на відгуки цього магазину.');
    expect(repo.updateReviewReply).not.toHaveBeenCalled();
  });

  it('зберігає відповідь; порожня відповідь записується як null', async () => {
    await ProductService.replyToReview(7, 21, 11, 'Дякуємо');
    expect(repo.updateReviewReply).toHaveBeenLastCalledWith(21, 'Дякуємо');
    await ProductService.replyToReview(7, 21, 11, '');
    expect(repo.updateReviewReply).toHaveBeenLastCalledWith(21, null);
  });

  it('D-SEC-18: відгук іншого товару → 404 і відповідь не записується', async () => {
    repo.findReviewById.mockResolvedValue({ user_id: 50, product_id: 8 });
    const error = await failure(() => ProductService.replyToReview(7, 21, 11, 'Дякуємо'));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Відгук не знайдено.');
    expect(repo.updateReviewReply).not.toHaveBeenCalled();
  });

  it('D-SEC-18: неіснуючий відгук → 404', async () => {
    repo.findReviewById.mockResolvedValue(null);
    const error = await failure(() => ProductService.replyToReview(7, 21, 11, 'Дякуємо'));
    expect(error.status).toBe(404);
    expect(repo.updateReviewReply).not.toHaveBeenCalled();
  });

  it('D-SEC-18: ідентифікатор товару порівнюється як рядок', async () => {
    repo.findReviewById.mockResolvedValue({ user_id: 50, product_id: 7 });
    await ProductService.replyToReview('7', 21, 11, 'Дякуємо');
    expect(repo.updateReviewReply).toHaveBeenCalledWith(21, 'Дякуємо');
  });
});

describe('D-SEC-06: права співавторів на товари', () => {
  const calls = [
    ['create', () => ProductService.create(11, { site_id: 3, name: 'Чай', price: '12', type: 'physical' })],
    ['getAccessible', () => ProductService.getAccessible(7, 11, 'нема прав')],
    ['replyToReview', () => ProductService.replyToReview(7, 21, 11, 'Дякуємо')],
  ];

  it.each(calls)('%s: редактор із секцією commerce дозволений', async (name, call) => {
    site.mockResolvedValue(collaboratorSite('editor', '["commerce"]'));
    await call();
  });

  it.each(calls)('%s: редактор без секції commerce отримує 403', async (name, call) => {
    site.mockResolvedValue(collaboratorSite('editor', '["editor","theme"]'));
    const error = await failure(call);
    expect(error.status).toBe(403);
  });

  it.each(calls)('%s: глядач із секцією commerce отримує 403', async (name, call) => {
    site.mockResolvedValue(collaboratorSite('viewer', '["commerce"]'));
    const error = await failure(call);
    expect(error.status).toBe(403);
  });

  it('заборонені операції нічого не записують', async () => {
    site.mockResolvedValue(collaboratorSite('viewer', '["commerce"]'));
    for (const [, call] of calls) {
      await call().catch(() => {});
    }
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateReviewReply).not.toHaveBeenCalled();
  });
});

describe('deleteReview', () => {
  const customer = { id: 11, role: 'user' };

  it('404, якщо відгуку немає', async () => {
    repo.findReviewById.mockResolvedValue(null);
    const error = await failure(() => ProductService.deleteReview(7, 21, customer));
    expect(error.status).toBe(404);
    expect(error.message).toBe('Відгук не знайдено.');
    expect(repo.deleteReview).not.toHaveBeenCalled();
  });

  it('автор видаляє свій відгук без звернення до товару й сайту', async () => {
    repo.findReviewById.mockResolvedValue({ user_id: 11, product_id: 7 });
    await ProductService.deleteReview(7, 21, customer);
    expect(repo.deleteReview).toHaveBeenCalledWith(21);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(site).not.toHaveBeenCalled();
  });

  it.each([['admin'], ['moderator']])('роль %s видаляє чужий відгук без перевірки сайту', async (role) => {
    await ProductService.deleteReview(7, 21, { id: 99, role });
    expect(repo.deleteReview).toHaveBeenCalledWith(21);
    expect(site).not.toHaveBeenCalled();
  });

  it('користувач із доступом до сайту товару видаляє чужий відгук', async () => {
    await ProductService.deleteReview(7, 21, customer);
    expect(site).toHaveBeenCalledWith(3, 11);
    expect(repo.deleteReview).toHaveBeenCalledWith(21);
  });

  it('D-SEC-18: відгук іншого товару → 404, навіть для автора', async () => {
    repo.findReviewById.mockResolvedValue({ user_id: 11, product_id: 8 });
    const error = await failure(() => ProductService.deleteReview(7, 21, customer));
    expect(error.status).toBe(404);
    expect(repo.deleteReview).not.toHaveBeenCalled();
  });

  it('D-SEC-06: співавтор-редактор із секцією commerce видаляє чужий відгук', async () => {
    site.mockResolvedValue(collaboratorSite('editor', '["commerce"]'));
    await ProductService.deleteReview(7, 21, customer);
    expect(repo.deleteReview).toHaveBeenCalledWith(21);
  });

  it.each([
    ['editor', '["theme"]'],
    ['viewer', '["commerce"]'],
  ])('D-SEC-06: співавтор %s з дозволами %s не видаляє чужий відгук', async (role, permissions) => {
    site.mockResolvedValue(collaboratorSite(role, permissions));
    const error = await failure(() => ProductService.deleteReview(7, 21, customer));
    expect(error.status).toBe(403);
    expect(repo.deleteReview).not.toHaveBeenCalled();
  });

  it('403 для стороннього користувача', async () => {
    site.mockResolvedValue(null);
    const error = await failure(() => ProductService.deleteReview(7, 21, customer));
    expect(error.status).toBe(403);
    expect(error.message).toBe('У вас немає прав для видалення цього відгуку.');
    expect(repo.deleteReview).not.toHaveBeenCalled();
  });

  it('403, якщо товару з URL немає і користувач не автор', async () => {
    repo.findById.mockResolvedValue(null);
    const error = await failure(() => ProductService.deleteReview(7, 21, customer));
    expect(error.status).toBe(403);
    expect(site).not.toHaveBeenCalled();
  });
});

describe('getPurchaseStatus', () => {
  it('без відгуку: hasReviewed = false, existingReview = null', async () => {
    expect(await ProductService.getPurchaseStatus(7, 11)).toEqual({
      hasPurchased: true, hasReviewed: false, existingReview: null,
    });
    expect(repo.getReviewByUser).toHaveBeenCalledWith(7, 11);
    expect(repo.hasPurchased).toHaveBeenCalledWith(11, 7);
  });

  it('із відгуком: hasReviewed = true, відгук повертається', async () => {
    const existing = { id: 5, rating: 3 };
    repo.getReviewByUser.mockResolvedValue(existing);
    repo.hasPurchased.mockResolvedValue(false);
    expect(await ProductService.getPurchaseStatus(7, 11)).toEqual({
      hasPurchased: false, hasReviewed: true, existingReview: existing,
    });
  });
});
