// Характеризаційні тести v0: сторінка кошика (CartPage) — третє з трьох місць, де клієнт рахує ціну (D-BIZ-01).
// Кошик показує суми з цін, збережених у localStorage (price × quantity, до цілих), а до сервера
// відправляє лише id, кількість і параметри позиції: ціна й сума в запит не входять.
// Форма оформлення відрисовується двічі (для вузького й широкого екрана), тому багато запитів — через getAll*.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import apiClient from '../../src/shared/api/api';
import { AuthContext } from '../../src/app/providers/AuthContext';
import { CartContext } from '../../src/app/providers/CartContext';
import CartPage from '../../src/modules/shop/CartPage';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/shared/config', () => ({ BASE_URL: 'http://api.test' }));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../src/shared/ui/complex/ConfirmModal', async () => ({ default: (await import('../helpers/shopStubs')).ConfirmModalStub }));
vi.mock('../../src/shared/ui/complex/NovaPoshtaMapModal', async () => ({ default: (await import('../helpers/shopStubs')).NovaPoshtaStub }));
vi.mock('../../src/shared/ui/complex/PaymentMethodModal', async () => ({ default: (await import('../helpers/shopStubs')).PaymentModalStub }));
vi.mock('../../src/shared/ui/complex/EmptyState', async () => ({ default: (await import('../helpers/shopStubs')).EmptyStateStub }));
vi.mock('../../src/shared/ui/complex/LoadingState', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('loading') }));

const buyer = { id: 5, username: 'buyer', email: 'buyer@example.com' };
const shopInfo = { site_path: 'shop', is_online_payment_enabled: 1, is_cod_enabled: 1, user_id: 99, collaborators: [] };
const ADDRESS = 'Нова Пошта: Відділення №1, Київ';

const item = (patch = {}) => ({
    id: 1, name: 'Кава', price: 72, originalPrice: 120, quantity: 2,
    cartItemId: '1-{"size":"L"}', selectedOptions: { size: 'L' },
    site_id: 10, site_path: 'shop', site_name: 'Магазин', currency: 'UAH', type: 'physical', stock_quantity: 10,
    ...patch,
});

let siteInfo = {};
// Рендер у async act: після нього запит /sites/info/<id> уже завершився, а стан застосовано без попереджень React.
const renderCart = async ({ items = [item()], user = buyer, isLoaded = true, info = { 10: shopInfo } } = {}) => {
    siteInfo = info;
    apiClient.get.mockImplementation(async (url) => {
        const match = url.match(/^\/sites\/info\/(\d+)$/);
        if (match && siteInfo[match[1]]) return { data: siteInfo[match[1]] };
        throw new Error(`unexpected request ${url}`);
    });
    const ctx = { cartItems: items, isLoaded, removeFromCart: vi.fn(), clearCart: vi.fn(), updateQuantity: vi.fn() };
    let utils;
    await act(async () => {
        utils = render(
            <MemoryRouter>
                <AuthContext.Provider value={{ user }}>
                    <CartContext.Provider value={ctx}>
                        <CartPage />
                    </CartContext.Provider>
                </AuthContext.Provider>
            </MemoryRouter>
        );
    });
    return { ...utils, ctx };
};

const submitForm = () => fireEvent.submit(document.querySelector('form'));
const fillPhone = (value = '+380501234567') =>
    fireEvent.change(screen.getAllByPlaceholderText('+380...')[0], { target: { value } });
const pickAddress = () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Вибрати на карті/ })[0]);
    fireEvent.click(screen.getByTestId('pick-address'));
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe('CartPage: суми', () => {
    it('порожній кошик показує підказку', async () => {
        await renderCart({ items: [] });
        expect(screen.getByText('Ваш кошик порожній')).toBeInTheDocument();
    });

    it('до завершення завантаження кошика показується індикатор', async () => {
        await renderCart({ isLoaded: false });
        expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('сума позиції — price × quantity, закреслена — originalPrice × quantity', async () => {
        await renderCart({ items: [item({ price: 72, originalPrice: 120, quantity: 2 })] });
        expect(screen.getAllByText('144 ₴').length).toBeGreaterThan(0);
        expect(screen.getByText('240 ₴')).toBeInTheDocument();
    });

    it('показує економію як різницю початкових і підсумкових цін', async () => {
        await renderCart({ items: [item({ price: 72, originalPrice: 120, quantity: 2 })] });
        expect(screen.getAllByText('Економія (знижка):').length).toBeGreaterThan(0);
        expect(screen.getAllByText('-96 ₴').length).toBeGreaterThan(0);
    });

    it('без знижки економії й закресленої ціни немає', async () => {
        await renderCart({ items: [item({ price: 100, originalPrice: 100, quantity: 1 })] });
        expect(screen.queryByText('Економія (знижка):')).toBeNull();
        expect(document.querySelector('.line-through')).toBeNull();
    });

    it('рядкові ціни (DECIMAL з API) розбираються числом', async () => {
        await renderCart({ items: [item({ price: '72.00', originalPrice: '72.00', quantity: 2 })] });
        expect(screen.getAllByText('144 ₴').length).toBeGreaterThan(0);
    });

    it('особливість: суми показуються округленими до цілих (toFixed(0)), 20.8 -> 21', async () => {
        await renderCart({ items: [item({ price: 10.4, originalPrice: 10.4, quantity: 2 })] });
        expect(screen.getAllByText('21 ₴').length).toBeGreaterThan(0);
    });

    it('позиції групуються за сайтом; активна лише перша група, клік по іншій змінює активну, а разом з нею й підсумок', async () => {
        const items = [
            item(),
            item({ id: 2, name: 'Чай', cartItemId: '2-{}', selectedOptions: {}, site_id: 20, site_path: 'tea', site_name: 'Чайна', price: 50, originalPrice: 50, quantity: 1 }),
        ];
        await renderCart({ items, info: { 10: shopInfo, 20: { ...shopInfo, site_path: 'tea' } } });
        const total = () => screen.getAllByText('Вартість товарів:')[0].nextElementSibling.textContent;
        expect(screen.getByText('Магазин')).toBeInTheDocument();
        expect(screen.getByText('Чайна')).toBeInTheDocument();
        expect(screen.getAllByText(/Оформлюємо/)).toHaveLength(1);
        expect(total()).toBe('144 ₴');
        // посилання на магазин зупиняє спливання кліку, тому вибір групи перевіряємо кліком по зображенню позиції
        fireEvent.click(screen.getByAltText('Чай'));
        expect(screen.getAllByText(/Оформлюємо/)).toHaveLength(1);
        expect(total()).toBe('50 ₴');
    });
});

describe('CartPage: кількість і видалення', () => {
    const controls = (quantity) => {
        const value = screen.getByText(String(quantity));
        return { minus: value.previousElementSibling, plus: value.nextElementSibling };
    };

    it('кнопки змінюють кількість на одиницю через updateQuantity', async () => {
        const { ctx } = await renderCart({ items: [item({ quantity: 2 })] });
        const { minus, plus } = controls(2);
        fireEvent.click(plus);
        expect(ctx.updateQuantity).toHaveBeenCalledWith('1-{"size":"L"}', 3);
        fireEvent.click(minus);
        expect(ctx.updateQuantity).toHaveBeenCalledWith('1-{"size":"L"}', 1);
    });

    it('мінус вимкнений при кількості 1', async () => {
        await renderCart({ items: [item({ quantity: 1 })] });
        expect(controls(1).minus).toBeDisabled();
    });

    it('плюс вимкнений, коли кількість досягла залишку (для фізичних товарів)', async () => {
        await renderCart({ items: [item({ quantity: 3, stock_quantity: 3 })] });
        expect(controls(3).plus).toBeDisabled();
    });

    it('для цифрових товарів залишок не обмежує кількість', async () => {
        await renderCart({ items: [item({ type: 'digital', quantity: 3, stock_quantity: 3 })] });
        expect(controls(3).plus).not.toBeDisabled();
    });

    it('видалення позиції потребує підтвердження', async () => {
        const { ctx } = await renderCart();
        fireEvent.click(screen.getByRole('button', { name: /Видалити/ }));
        expect(screen.getByTestId('confirm-message')).toHaveTextContent('Ви впевнені, що хочете видалити "Кава" з кошика?');
        fireEvent.click(screen.getByText('confirm-yes'));
        expect(ctx.removeFromCart).toHaveBeenCalledWith('1-{"size":"L"}');
    });

    it('очищення всього кошика потребує підтвердження', async () => {
        const { ctx } = await renderCart();
        fireEvent.click(screen.getByRole('button', { name: /Очистити весь кошик/ }));
        expect(screen.getByTestId('confirm-title')).toHaveTextContent('Очистити кошик');
        expect(ctx.clearCart).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('confirm-yes'));
        expect(ctx.clearCart).toHaveBeenCalledTimes(1);
    });

    it('відмова в підтвердженні нічого не видаляє', async () => {
        const { ctx } = await renderCart();
        fireEvent.click(screen.getByRole('button', { name: /Видалити/ }));
        fireEvent.click(screen.getByText('confirm-no'));
        expect(ctx.removeFromCart).not.toHaveBeenCalled();
        expect(screen.queryByTestId('confirm-modal')).toBeNull();
    });
});

describe('CartPage: оформлення замовлення', () => {
    it('післяплата: до сервера йдуть лише id, кількість і параметри позиції; ціни й суми в запиті немає', async () => {
        apiClient.post.mockResolvedValue({ data: { orderId: 77 } });
        const { ctx } = await renderCart();
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/sites/info/10'));
        fillPhone();
        pickAddress();
        fireEvent.click(screen.getAllByLabelText('Оплата при отриманні')[0]);
        submitForm();

        await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
        const [url, payload, config] = apiClient.post.mock.calls[0];
        expect(url).toBe('/orders/checkout');
        expect(payload).toEqual({
            siteId: 10,
            items: [{ id: 1, quantity: 2, options: { size: 'L' } }],
            customerData: { name: 'buyer', email: 'buyer@example.com', phone: '+380501234567', address: ADDRESS },
            paymentMethod: 'cod',
        });
        expect(config).toEqual({ suppressToast: true });
        // KNOWN-DEFECT D-BIZ-01: покупець бачив 144 ₴ (72 × 2), але сервер цього числа не отримує
        expect(Object.keys(payload.items[0]).sort()).toEqual(['id', 'options', 'quantity']);
        expect(payload).not.toHaveProperty('total');

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/my-orders'));
        expect(toast.success).toHaveBeenCalledWith('Замовлення #77 успішно оформлено!');
        expect(ctx.removeFromCart).toHaveBeenCalledWith('1-{"size":"L"}');
    });

    it('онлайн-оплата: відкриває вікно оплати із сумою, порахованою на клієнті, і очищає кошик сайту', async () => {
        apiClient.post.mockResolvedValue({ data: { orderId: 78, liqpayData: 'DATA', liqpaySignature: 'SIGN' } });
        const { ctx } = await renderCart();
        fillPhone();
        pickAddress();
        submitForm();

        const modal = await screen.findByTestId('payment-modal');
        expect(modal).toHaveAttribute('data-amount', '144.00');
        expect(modal).toHaveAttribute('data-currency', '₴');
        expect(apiClient.post.mock.calls[0][1].paymentMethod).toBe('online');
        expect(ctx.removeFromCart).toHaveBeenCalledWith('1-{"size":"L"}');
        expect(navigate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('close-payment'));
        expect(toast.info).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/my-orders');
    });

    it('помилка сервера показується повідомленням і нічого не очищає', async () => {
        apiClient.post.mockRejectedValue({ response: { data: { message: 'Товару немає в наявності' } } });
        const { ctx } = await renderCart();
        fillPhone();
        pickAddress();
        submitForm();
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Товару немає в наявності'));
        expect(ctx.removeFromCart).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('цифровий кошик: без доставки й адреси, лише онлайн-оплата', async () => {
        apiClient.post.mockResolvedValue({ data: { orderId: 79, liqpayData: 'D', liqpaySignature: 'S' } });
        await renderCart({ items: [item({ type: 'digital', price: 50, originalPrice: 50, quantity: 1, stock_quantity: null })] });
        expect(screen.queryAllByText(/Доставка/)).toHaveLength(0);
        expect(screen.queryAllByLabelText('Оплата при отриманні')).toHaveLength(0);
        fillPhone();
        submitForm();
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
        const payload = apiClient.post.mock.calls[0][1];
        expect(payload.paymentMethod).toBe('online');
        expect(payload.customerData.address).toBe('');
    });

    describe('перевірки перед відправленням', () => {
        it('без телефону — повідомлення про обов\'язкові поля', async () => {
            await renderCart();
            pickAddress();
            submitForm();
            expect(toast.error).toHaveBeenCalledWith('Будь ласка, заповніть всі обов\'язкові поля');
            expect(apiClient.post).not.toHaveBeenCalled();
        });

        it('телефон із літерами відхиляється', async () => {
            await renderCart();
            fillPhone('abc');
            pickAddress();
            submitForm();
            expect(toast.error).toHaveBeenCalledWith('Некоректний формат телефону.');
            expect(apiClient.post).not.toHaveBeenCalled();
        });

        it('для фізичних товарів потрібне відділення доставки', async () => {
            await renderCart();
            fillPhone();
            submitForm();
            expect(toast.error).toHaveBeenCalledWith('Будь ласка, оберіть відділення доставки');
            expect(apiClient.post).not.toHaveBeenCalled();
        });

        it('кількість понад залишок блокує оформлення', async () => {
            await renderCart({ items: [item({ quantity: 3, stock_quantity: 2 })] });
            fillPhone();
            pickAddress();
            submitForm();
            expect(toast.error).toHaveBeenCalledWith('Товару "Кава" недостатньо на складі.');
            expect(apiClient.post).not.toHaveBeenCalled();
        });

        it('власник магазину не може оформити замовлення у власному магазині', async () => {
            await renderCart({ user: { id: 99, username: 'owner', email: 'owner@example.com' } });
            expect((await screen.findAllByText(/Ви не можете оформити замовлення у власному магазині/)).length).toBeGreaterThan(0);
            fillPhone();
            pickAddress();
            submitForm();
            expect(toast.error).toHaveBeenCalledWith('Ви не можете оформлювати замовлення у власному магазині або як співавтор.');
            expect(apiClient.post).not.toHaveBeenCalled();
        });
    });
});

describe('CartPage: способи оплати магазину', () => {
    it('якщо онлайн-оплату вимкнено, лишається післяплата й вона вибрана автоматично', async () => {
        await renderCart({ info: { 10: { ...shopInfo, is_online_payment_enabled: 0 } } });
        await waitFor(() => expect(screen.queryAllByLabelText('Оплата онлайн')).toHaveLength(0));
        expect(screen.getAllByLabelText('Оплата при отриманні').length).toBeGreaterThan(0);
        await waitFor(() => expect(localStorage.getItem('cartPaymentMethod')).toBe('cod'));
    });

    it('якщо післяплату вимкнено, лишається онлайн-оплата', async () => {
        await renderCart({ info: { 10: { ...shopInfo, is_cod_enabled: 0 } } });
        await waitFor(() => expect(screen.queryAllByLabelText('Оплата при отриманні')).toHaveLength(0));
        expect(screen.getAllByLabelText('Оплата онлайн').length).toBeGreaterThan(0);
    });

    it('якщо недоступні обидва способи, оформлення вимкнено', async () => {
        await renderCart({ info: { 10: { ...shopInfo, is_online_payment_enabled: 0, is_cod_enabled: 0 } } });
        expect((await screen.findAllByText(/не має доступних способів оплати/)).length).toBeGreaterThan(0);
        screen.getAllByRole('button', { name: /Створити та оплатити|Підтвердити замовлення/ }).forEach((b) => expect(b).toBeDisabled());
    });

    it('вибір способу оплати та дані покупця зберігаються в localStorage', async () => {
        await renderCart();
        fireEvent.click(screen.getAllByLabelText('Оплата при отриманні')[0]);
        await waitFor(() => expect(localStorage.getItem('cartPaymentMethod')).toBe('cod'));
        fillPhone('+380991112233');
        await waitFor(() => expect(JSON.parse(localStorage.getItem('cartCustomerData')).phone).toBe('+380991112233'));
    });

    it('збережені раніше дані покупця підставляються у форму', async () => {
        localStorage.setItem('cartCustomerData', JSON.stringify({ name: 'Іван', email: 'ivan@example.com', phone: '+380670000000', address: '' }));
        await renderCart({ user: null });
        expect(screen.getAllByPlaceholderText("Прізвище та ім'я")[0]).toHaveValue('Іван');
        expect(screen.getAllByPlaceholderText('+380...')[0]).toHaveValue('+380670000000');
    });
});
