// Картка товару (ProductCard) — перше з трьох місць, де клієнт рахує ціну (D-BIZ-01).
// Картка враховує знижку самого товару (sale_percentage), а якщо її немає, найбільшу знижку категорій; надбавок варіантів
// вона не додає: їх обирає покупець на сторінці товару. Ціну замовлення сервер рахує сам (backend: orders.checkout.test.js).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AuthContext } from '../../src/app/providers/AuthContext';
import { CartContext } from '../../src/app/providers/CartContext';
import ProductCard from '../../src/modules/editor/ui/components/ProductCard';

const navigate = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));
vi.mock('../../src/shared/hooks/useConfirm', () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/shared/config', () => ({ BASE_URL: 'http://api.test' }));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const base = { id: 5, name: 'Футболка', price: 100, sale_percentage: 0, stock_quantity: 10, type: 'physical' };
const shop = { site_path: 'shop', title: 'Магазин', user_id: 99, currency: 'UAH' };

const renderCard = ({ product = base, siteData = shop, user = null, isEditorPreview = false, addToCart = vi.fn(), path = '/site/shop' } = {}) => {
    const utils = render(
        <MemoryRouter initialEntries={[path]}>
            <AuthContext.Provider value={{ user }}>
                <CartContext.Provider value={{ addToCart }}>
                    <ProductCard product={product} siteData={siteData} isEditorPreview={isEditorPreview} />
                </CartContext.Provider>
            </AuthContext.Provider>
        </MemoryRouter>
    );
    return { ...utils, addToCart };
};

describe('ProductCard: ціна', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('без знижки показує ціну товару й символ валюти сайту', () => {
        renderCard();
        expect(screen.getByText('100 ₴')).toBeInTheDocument();
        expect(screen.queryByText(/^-\d+%$/)).toBeNull();
    });

    it('знижка товару: підсумкова ціна, закреслена початкова й значок із відсотком', () => {
        renderCard({ product: { ...base, sale_percentage: 20 } });
        expect(screen.getByText('80 ₴')).toBeInTheDocument();
        expect(screen.getByText('100 ₴')).toBeInTheDocument();
        expect(screen.getByText('-20%')).toBeInTheDocument();
    });

    it('підсумкова ціна округлюється до цілого: 99.99 з -15 % -> 85', () => {
        renderCard({ product: { ...base, price: 99.99, sale_percentage: 15 } });
        expect(screen.getByText('85 ₴')).toBeInTheDocument();
        expect(screen.getByText('99.99 ₴')).toBeInTheDocument();
    });

    it('особливість: ціна без знижки показується так, як прийшла з API (рядок DECIMAL лишається "100.00")', () => {
        renderCard({ product: { ...base, price: '100.00' } });
        expect(screen.getByText('100.00 ₴')).toBeInTheDocument();
    });

    it('рядкова ціна зі знижкою обчислюється числом: "100.00" і -20 % -> 80', () => {
        renderCard({ product: { ...base, price: '100.00', sale_percentage: 20 } });
        expect(screen.getByText('80 ₴')).toBeInTheDocument();
        expect(screen.getByText('100.00 ₴')).toBeInTheDocument();
    });

    it('D-BIZ-01: знижка категорії враховується: підсумкова ціна, закреслена початкова й значок із відсотком', () => {
        renderCard({ product: { ...base, categories: [{ id: 1, name: 'Одяг', discount_percentage: 30 }] } });
        expect(screen.getByText('70 ₴')).toBeInTheDocument();
        expect(screen.getByText('100 ₴')).toBeInTheDocument();
        expect(screen.getByText('-30%')).toBeInTheDocument();
    });

    it('D-BIZ-01: з кількох категорій береться найбільша знижка, DECIMAL-рядок читається числом', () => {
        renderCard({
            product: {
                ...base,
                categories: [
                    { id: 1, name: 'А', discount_percentage: '10.00' },
                    { id: 2, name: 'Б', discount_percentage: '25.00' },
                    { id: 3, name: 'В', discount_percentage: 5 },
                ],
            },
        });
        expect(screen.getByText('75 ₴')).toBeInTheDocument();
        expect(screen.getByText('-25%')).toBeInTheDocument();
    });

    it('D-BIZ-01: знижка самого товару має пріоритет над знижкою категорії', () => {
        renderCard({ product: { ...base, sale_percentage: 20, categories: [{ id: 1, name: 'Одяг', discount_percentage: 30 }] } });
        expect(screen.getByText('80 ₴')).toBeInTheDocument();
        expect(screen.getByText('-20%')).toBeInTheDocument();
        expect(screen.queryByText('70 ₴')).toBeNull();
    });

    it('категорії без знижки або з нечисловою знижкою ціну не змінюють', () => {
        renderCard({
            product: { ...base, categories: [{ id: 1, name: 'А', discount_percentage: null }, { id: 2, name: 'Б', discount_percentage: 'abc' }, { id: 3, name: 'В' }] },
        });
        expect(screen.getByText('100 ₴')).toBeInTheDocument();
        expect(screen.queryByText(/^-\d+%$/)).toBeNull();
    });

    it('надбавки варіантів на картці не додаються: їх обирає покупець на сторінці товару', () => {
        const product = {
            ...base,
            variants: [{ name: 'Розмір', values: [{ label: 'S', priceModifier: 0 }, { label: 'L', priceModifier: 30 }] }],
        };
        renderCard({ product });
        expect(screen.getByText('100 ₴')).toBeInTheDocument();
        expect(screen.queryByText('130 ₴')).toBeNull();
    });

    it.each([
        ['UAH', '₴'], ['USD', '$'], ['EUR', '€'], ['PLN', '₴'], [undefined, '₴'],
    ])('валюта сайту %s -> символ %s', (currency, symbol) => {
        renderCard({ siteData: { ...shop, currency } });
        expect(screen.getByText(`100 ${symbol}`)).toBeInTheDocument();
    });
});

describe('ProductCard: вигляд і посилання', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('посилання веде на сторінку товару всередині сайту', () => {
        renderCard();
        expect(screen.getByRole('link')).toHaveAttribute('href', '/site/shop/product/5');
    });

    it('шлях сайту береться з товару, якщо його немає в siteData; без шляху — /product/<id>', () => {
        const { unmount } = renderCard({ product: { ...base, site_path: 'other' }, siteData: { title: 'X' } });
        expect(screen.getByRole('link')).toHaveAttribute('href', '/site/other/product/5');
        unmount();
        renderCard({ siteData: { title: 'X' } });
        expect(screen.getByRole('link')).toHaveAttribute('href', '/product/5');
    });

    it('у режимі редактора посилання нікуди не веде: href дорівнює поточній адресі, клік скасовується', () => {
        // to="#" react-router розв'язує у поточний шлях, тому в href немає ні "#", ні адреси товару
        renderCard({ isEditorPreview: true });
        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('/site/shop');
        expect(link.getAttribute('href')).not.toContain('/product/');
        expect(fireEvent.click(link)).toBe(false);
    });

    it('показує категорії через кому', () => {
        renderCard({ product: { ...base, categories: [{ id: 1, name: 'Одяг' }, { id: 2, name: 'Літо' }] } });
        expect(screen.getByText('Одяг, Літо')).toBeInTheDocument();
    });

    it('товар без залишку: напис «Немає в наявності», кнопка вимкнена, значок знижки прихований', () => {
        renderCard({ product: { ...base, stock_quantity: 0, sale_percentage: 20 } });
        expect(screen.getByText('Немає в наявності')).toBeInTheDocument();
        expect(screen.getByTitle('Додати в кошик')).toBeDisabled();
        expect(screen.queryByText('-20%')).toBeNull();
    });

    it('цифровий товар із нульовим залишком вважається доступним і має позначку «Цифровий»', () => {
        renderCard({ product: { ...base, type: 'digital', stock_quantity: 0 } });
        expect(screen.queryByText('Немає в наявності')).toBeNull();
        expect(screen.getByTitle('Додати в кошик')).not.toBeDisabled();
        expect(screen.getByText(/Цифровий/)).toBeInTheDocument();
    });

    it('товар із варіантами має кнопку «Вибрати опції» замість «Додати в кошик»', () => {
        renderCard({ product: { ...base, variants: [{ name: 'Розмір', values: [{ label: 'S' }] }] } });
        expect(screen.getByTitle('Вибрати опції')).toBeInTheDocument();
        expect(screen.queryByTitle('Додати в кошик')).toBeNull();
    });

    describe('зображення', () => {
        it('галерея у вигляді рядка JSON: відносні адреси доповнюються BASE_URL, абсолютні лишаються', () => {
            renderCard({ product: { ...base, image_gallery: JSON.stringify(['/uploads/a.jpg', 'https://cdn.test/b.jpg']) } });
            const srcs = screen.getAllByRole('img').map((img) => img.getAttribute('src'));
            expect(srcs).toEqual(['http://api.test/uploads/a.jpg', 'https://cdn.test/b.jpg']);
        });

        it('галерея-масив теж підтримується', () => {
            renderCard({ product: { ...base, image_gallery: ['/uploads/a.jpg'] } });
            expect(screen.getByRole('img')).toHaveAttribute('src', 'http://api.test/uploads/a.jpg');
        });

        it('без галереї показується заглушка', () => {
            renderCard();
            expect(screen.getByRole('img')).toHaveAttribute('src', 'https://placehold.co/400?text=No+Image');
        });

        it('некоректний JSON галереї дає заглушку і запис у консоль', () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            renderCard({ product: { ...base, image_gallery: '{не json' } });
            expect(screen.getByRole('img')).toHaveAttribute('src', 'https://placehold.co/400?text=No+Image');
            expect(error).toHaveBeenCalled();
            error.mockRestore();
        });
    });
});

describe('ProductCard: додавання в кошик', () => {
    const buyer = { id: 5, role: 'user', username: 'buyer' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('додає в кошик товар із даними сайту та інформацією про ціну (підсумкова, початкова, знижка)', () => {
        const { addToCart } = renderCard({ product: { ...base, sale_percentage: 20 }, user: buyer });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        expect(addToCart).toHaveBeenCalledTimes(1);
        const [product, options, priceInfo] = addToCart.mock.calls[0];
        expect(product).toMatchObject({ id: 5, name: 'Футболка', site_path: 'shop', site_name: 'Магазин', currency: 'UAH' });
        expect(options).toEqual({});
        expect(priceInfo).toEqual({ finalPrice: 80, originalPrice: 100, discount: 20 });
    });

    it('знижка категорії потрапляє в priceInfo так само, як знижка товару', () => {
        const product = { ...base, categories: [{ id: 1, name: 'Одяг', discount_percentage: 30 }] };
        const { addToCart } = renderCard({ product, user: buyer });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        expect(addToCart.mock.calls[0][2]).toEqual({ finalPrice: 70, originalPrice: 100, discount: 30 });
    });

    it('без знижки у priceInfo лежать початкова ціна й нульова знижка', () => {
        const { addToCart } = renderCard({ user: buyer });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        expect(addToCart.mock.calls[0][2]).toEqual({ finalPrice: 100, originalPrice: 100, discount: 0 });
    });

    it('товар із варіантами не додається, а відкриває сторінку товару', () => {
        const { addToCart } = renderCard({
            product: { ...base, variants: [{ name: 'Розмір', values: [{ label: 'S' }] }] },
            user: buyer,
        });
        fireEvent.click(screen.getByTitle('Вибрати опції'));
        expect(addToCart).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/site/shop/product/5');
    });

    it.each([
        ['власник сайту', { id: 99, role: 'user' }, shop],
        ['адміністратор', { id: 1, role: 'admin' }, shop],
        ['модератор', { id: 2, role: 'moderator' }, shop],
        ['співавтор за прапорцем', { id: 3, role: 'user' }, { ...shop, is_collaborator: true }],
        ['співавтор зі списку команди', { id: 4, role: 'user' }, { ...shop, team: [{ user_id: 4 }] }],
    ])('%s не може додати товар у кошик', (_, user, siteData) => {
        const { addToCart } = renderCard({ user, siteData });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        expect(addToCart).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('Не можна додавати власні товари в кошик.');
    });

    it('гість: питає про вхід і після підтвердження веде на /login із поверненням на поточну сторінку', async () => {
        confirmMock.mockResolvedValue(true);
        const { addToCart } = renderCard({ path: '/site/shop?page=2' });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { state: { from: '/site/shop?page=2' } }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Потрібна авторизація' }));
        expect(addToCart).not.toHaveBeenCalled();
    });

    it('гість, який відмовився входити, лишається на місці', async () => {
        confirmMock.mockResolvedValue(false);
        renderCard();
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(navigate).not.toHaveBeenCalled();
    });

    it('у режимі редактора клік по кнопці нічого не робить', () => {
        const { addToCart } = renderCard({ user: buyer, isEditorPreview: true });
        fireEvent.click(screen.getByTitle('Додати в кошик'));
        expect(addToCart).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});
