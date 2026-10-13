// Характеризаційні тести v0: сторінка товару (ProductDetailPage) — друге з трьох місць, де клієнт рахує ціну (D-BIZ-01).
// Сторінка додає надбавки вибраних варіантів і застосовує одну знижку за пріоритетом
// «знижка варіанта || знижка товару || найбільша знижка категорії»; результат кладе в кошик як price.
// Усе, що не стосується ціни й кнопки покупки (відгуки, масштабування зображення, рекомендації), заглушено або не перевіряється.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { toast } from 'react-toastify';
import apiClient from '../../src/shared/api/api';
import { AuthContext } from '../../src/app/providers/AuthContext';
import { CartContext } from '../../src/app/providers/CartContext';
import ProductDetailPage from '../../src/modules/shop/ProductDetailPage';

const navigate = vi.hoisted(() => vi.fn());
const outlet = vi.hoisted(() => ({ value: {} }));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useParams: () => ({ productId: '1' }),
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: '/site/shop/product/1', search: '?ref=card' }),
    useOutletContext: () => outlet.value,
}));
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/shared/config', () => ({ BASE_URL: 'http://api.test' }));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../src/modules/editor/core/BlockRenderer', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/modules/editor/ui/components/ProductCard', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('related-card') }));
vi.mock('../../src/pages/MaintenancePage', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('maintenance') }));
vi.mock('../../src/pages/NotFoundPage', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('not-found') }));
vi.mock('../../src/modules/renderer/components/CookieBanner', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/modules/renderer/components/FontLoader', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/modules/renderer/components/SiteControls', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/shared/ui/complex/ReportModal', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/shared/ui/complex/LoadingState', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('loading') }));

const shop = { id: 10, site_path: 'shop', title: 'Магазин', user_id: 99, currency: 'UAH', status: 'published', page: { block_content: [] } };
const base = { id: 1, site_id: 10, name: 'Футболка', price: 100, sale_percentage: 0, stock_quantity: 5, type: 'physical', categories: [], variants: null, image_gallery: null };
const buyer = { id: 5, role: 'user' };

const sizes = {
    name: 'Розмір',
    values: [
        { label: 'S', priceModifier: 0 },
        { label: 'L', priceModifier: 30 },
        { label: 'XL', priceModifier: '50', salePercentage: 50 },
    ],
};

const setupApi = (product) => {
    apiClient.get.mockImplementation(async (url) => {
        if (url === '/products/1') return { data: JSON.parse(JSON.stringify(product)) };
        if (url === '/products/1/reviews') return { data: [] };
        if (url === '/products/1/purchase-status') return { data: { hasPurchased: false, hasReviewed: false } };
        if (url.startsWith('/products/site/')) return { data: [] };
        throw new Error(`unexpected request ${url}`);
    });
};

const renderPage = ({ product = base, siteData = shop, user = null, cartItems = [], addToCart = vi.fn(), isSiteLoading = false } = {}) => {
    outlet.value = { siteData, isSiteLoading };
    setupApi(product);
    render(
        <AuthContext.Provider value={{ user }}>
            <CartContext.Provider value={{ addToCart, cartItems }}>
                <ProductDetailPage />
            </CartContext.Provider>
        </AuthContext.Provider>
    );
    return { addToCart };
};

const ready = () => screen.findByRole('heading', { level: 1, name: 'Футболка' });

describe('ProductDetailPage: підсумкова ціна', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        ['без знижки', { price: 100 }, '100 ₴', null],
        ['рядкова ціна DECIMAL', { price: '100.00' }, '100 ₴', null],
        ['знижка товару 20 %', { price: 100, sale_percentage: 20 }, '80 ₴', '100 ₴'],
        ['округлення: 99.99 і 15 %', { price: 99.99, sale_percentage: 15 }, '85 ₴', '99.99 ₴'],
        ['знижка категорії 30 %', { price: 100, categories: [{ id: 1, name: 'Одяг', discount_percentage: 30 }] }, '70 ₴', '100 ₴'],
        [
            'із кількох категорій береться найбільша знижка',
            { price: 100, categories: [{ id: 1, name: 'А', discount_percentage: 5 }, { id: 2, name: 'Б', discount_percentage: 30 }] },
            '70 ₴', '100 ₴',
        ],
        [
            'знижка товару має пріоритет над більшою знижкою категорії (не максимум)',
            { price: 100, sale_percentage: 10, categories: [{ id: 1, name: 'А', discount_percentage: 30 }] },
            '90 ₴', '100 ₴',
        ],
    ])('%s', async (_, patch, final, original) => {
        renderPage({ product: { ...base, ...patch } });
        await ready();
        expect(await screen.findByText(final)).toBeInTheDocument();
        if (original) {
            expect(screen.getByText(original)).toBeInTheDocument();
        } else {
            expect(screen.queryByText(/ ₴$/, { selector: '.line-through' })).toBeNull();
        }
    });

    it('значок «-N %» на зображенні показує лише знижку самого товару, а не знижку категорії', async () => {
        renderPage({ product: { ...base, price: 100, categories: [{ id: 1, name: 'Одяг', discount_percentage: 30 }] } });
        await ready();
        await screen.findByText('70 ₴');
        expect(screen.queryByText(/^-\d+%$/)).toBeNull();
    });

    it('значок «-N %» для знижки товару', async () => {
        renderPage({ product: { ...base, sale_percentage: 20 } });
        await ready();
        expect(await screen.findByText('-20%')).toBeInTheDocument();
    });

    it.each([
        ['USD', '$'], ['EUR', '€'], ['UAH', '₴'], ['PLN', '₴'],
    ])('валюта сайту %s -> символ %s', async (currency, symbol) => {
        renderPage({ siteData: { ...shop, currency } });
        await ready();
        expect(await screen.findByText(`100 ${symbol}`)).toBeInTheDocument();
    });
});

describe('ProductDetailPage: варіанти товару', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const withSizes = (patch = {}) => ({ ...base, variants: [sizes], ...patch });

    it('перше значення кожного варіанта вибране за замовчуванням', async () => {
        renderPage({ product: withSizes() });
        await ready();
        expect(await screen.findByText('100 ₴')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'L' })).toBeInTheDocument();
    });

    it('надбавка вибраного значення додається до ціни товару', async () => {
        renderPage({ product: withSizes() });
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'L' }));
        expect(await screen.findByText('130 ₴')).toBeInTheDocument();
    });

    it('знижка значення варіанта перекриває знижку товару й застосовується до ціни з надбавкою', async () => {
        renderPage({ product: withSizes({ sale_percentage: 20 }) });
        await ready();
        expect(await screen.findByText('80 ₴')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'XL' }));
        // база 100 + 50 = 150, знижка 50 % (замість 20 %) -> 75
        expect(await screen.findByText('75 ₴')).toBeInTheDocument();
        expect(screen.getByText('150 ₴')).toBeInTheDocument();
    });

    it('надбавки кількох варіантів складаються', async () => {
        const color = { name: 'Колір', values: [{ label: 'Білий', priceModifier: 0 }, { label: 'Чорний', priceModifier: 15 }] };
        renderPage({ product: withSizes({ variants: [sizes, color] }) });
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'L' }));
        fireEvent.click(screen.getByRole('button', { name: 'Чорний' }));
        expect(await screen.findByText('145 ₴')).toBeInTheDocument();
    });

    it('варіанти, збережені рядком JSON, розбираються', async () => {
        renderPage({ product: { ...base, variants: JSON.stringify([sizes]) } });
        await ready();
        expect(await screen.findByRole('button', { name: 'L' })).toBeInTheDocument();
    });
});

describe('ProductDetailPage: кнопка покупки', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('кладе в кошик товар із даними сайту, вибраними параметрами та підсумковою ціною', async () => {
        const { addToCart } = renderPage({ product: { ...base, variants: [sizes], sale_percentage: 20 }, user: buyer });
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'L' }));
        await screen.findByText('104 ₴');
        fireEvent.click(screen.getByRole('button', { name: 'Додати в кошик' }));
        expect(addToCart).toHaveBeenCalledTimes(1);
        const [product, options, priceInfo] = addToCart.mock.calls[0];
        expect(product).toMatchObject({ id: 1, name: 'Футболка', site_path: 'shop', site_name: 'Магазин', currency: 'UAH' });
        expect(options).toEqual({ 'Розмір': 'L' });
        expect(priceInfo).toEqual({ finalPrice: 104, originalPrice: 130, discount: 20 });
    });

    it('гість: після підтвердження вікна веде на /login із поверненням на цю сторінку', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { addToCart } = renderPage();
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'Додати в кошик' }));
        expect(confirm).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/login', { state: { from: '/site/shop/product/1?ref=card' } });
        expect(addToCart).not.toHaveBeenCalled();
        confirm.mockRestore();
    });

    it('якщо позиція з такими параметрами вже в кошику, кнопка веде до кошика', async () => {
        const { addToCart } = renderPage({ user: buyer, cartItems: [{ cartItemId: '1-{}' }] });
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'Перейти до кошику' }));
        expect(navigate).toHaveBeenCalledWith('/cart');
        expect(addToCart).not.toHaveBeenCalled();
    });

    it.each([
        ['власник сайту', { id: 99, role: 'user' }],
        ['адміністратор', { id: 1, role: 'admin' }],
    ])('%s не може купувати', async (_, user) => {
        const { addToCart } = renderPage({ user });
        await ready();
        fireEvent.click(await screen.findByRole('button', { name: 'Додати в кошик' }));
        expect(toast.error).toHaveBeenCalledWith('Не можна додавати власні товари в кошик.');
        expect(addToCart).not.toHaveBeenCalled();
    });

    it('товар без залишку: кнопка вимкнена, статус «Закінчився»', async () => {
        renderPage({ product: { ...base, stock_quantity: 0 }, user: buyer });
        await ready();
        expect(await screen.findByRole('button', { name: 'Немає в наявності' })).toBeDisabled();
        expect(screen.getByText('Закінчився')).toBeInTheDocument();
    });

    it('особливість: цифровий товар із нульовим залишком тут «закінчився», а на картці вважається доступним', async () => {
        renderPage({ product: { ...base, type: 'digital', stock_quantity: 0 }, user: buyer });
        await ready();
        expect(await screen.findByRole('button', { name: 'Немає в наявності' })).toBeDisabled();
    });
});

describe('ProductDetailPage: стани сторінки', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('поки сайт завантажується, показується індикатор і запиту товару немає', () => {
        renderPage({ isSiteLoading: true });
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        expect(apiClient.get).not.toHaveBeenCalledWith('/products/1');
    });

    it('невідомий товар (помилка запиту) показує сторінку «не знайдено»', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        outlet.value = { siteData: shop, isSiteLoading: false };
        apiClient.get.mockRejectedValue({ response: { status: 404 } });
        render(
            <AuthContext.Provider value={{ user: null }}>
                <CartContext.Provider value={{ addToCart: vi.fn(), cartItems: [] }}>
                    <ProductDetailPage />
                </CartContext.Provider>
            </AuthContext.Provider>
        );
        expect(await screen.findByTestId('not-found')).toBeInTheDocument();
        error.mockRestore();
    });

    it('відповідь 403 показує сторінку обслуговування', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        outlet.value = { siteData: shop, isSiteLoading: false };
        apiClient.get.mockRejectedValue({ response: { status: 403, data: { code: 'SITE_MAINTENANCE_MODE' } } });
        render(
            <AuthContext.Provider value={{ user: null }}>
                <CartContext.Provider value={{ addToCart: vi.fn(), cartItems: [] }}>
                    <ProductDetailPage />
                </CartContext.Provider>
            </AuthContext.Provider>
        );
        expect(await screen.findByTestId('maintenance')).toBeInTheDocument();
        error.mockRestore();
    });

    it('сайт у режимі обслуговування для стороннього відвідувача: сторінка обслуговування без запиту товару', async () => {
        renderPage({ siteData: { ...shop, status: 'maintenance' } });
        expect(await screen.findByTestId('maintenance')).toBeInTheDocument();
        expect(apiClient.get).not.toHaveBeenCalledWith('/products/1');
    });
});
