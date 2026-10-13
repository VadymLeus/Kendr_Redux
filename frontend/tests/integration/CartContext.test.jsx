// Характеризаційні тести v0: кошик у браузері (CartContext).
// Кошик зберігає в localStorage вже порахований рядок (price × quantity на клієнті), а сервер при оформленні
// отримує лише id, кількість і параметри (D-BIZ-01). Тут фіксується, що саме кошик запам'ятовує.
import React, { useContext } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../src/app/providers/AuthContext';
import { CartContext, CartProvider } from '../../src/app/providers/CartContext';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

let currentUser = null;
const wrapper = ({ children }) => (
    <AuthContext.Provider value={{ user: currentUser }}>
        <CartProvider>{children}</CartProvider>
    </AuthContext.Provider>
);
const setup = (user = null) => {
    currentUser = user;
    return renderHook(() => useContext(CartContext), { wrapper });
};
const stored = (key = 'cart_guest') => JSON.parse(localStorage.getItem(key));

const coffee = { id: 1, name: 'Кава', price: 100, site_id: 10, type: 'physical' };
const ebook = { id: 2, name: 'Книга', price: 50, site_id: 10, type: 'digital' };
const tea = { id: 3, name: 'Чай', price: 80, site_id: 20, type: 'physical' };

describe('CartProvider: завантаження', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        currentUser = null;
    });

    it('починає з порожнього кошика, позначаючи завантаження завершеним', () => {
        const { result } = setup();
        expect(result.current.cartItems).toEqual([]);
        expect(result.current.isLoaded).toBe(true);
        expect(result.current.isDigitalOnly).toBe(false);
    });

    it('гість: кошик береться з ключа cart_guest', () => {
        localStorage.setItem('cart_guest', JSON.stringify([{ ...coffee, cartItemId: '1-{}', quantity: 2 }]));
        const { result } = setup();
        expect(result.current.cartItems).toHaveLength(1);
        expect(result.current.cartItems[0].quantity).toBe(2);
    });

    it('користувач: кошик береться з ключа cart_<id>', () => {
        localStorage.setItem('cart_7', JSON.stringify([{ ...tea, cartItemId: '3-{}', quantity: 1 }]));
        localStorage.setItem('cart_guest', JSON.stringify([{ ...coffee, cartItemId: '1-{}', quantity: 1 }]));
        const { result } = setup({ id: 7 });
        expect(result.current.cartItems.map((i) => i.id)).toEqual([3]);
    });

    it('пошкоджений JSON у сховищі дає порожній кошик і запис у консоль', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('cart_guest', '{не json');
        const { result } = setup();
        expect(result.current.cartItems).toEqual([]);
        expect(result.current.isLoaded).toBe(true);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('особливість: кошик гостя не переноситься в кошик користувача після входу', () => {
        const { result, rerender } = setup();
        act(() => result.current.addToCart(coffee));
        expect(result.current.cartItems).toHaveLength(1);
        currentUser = { id: 5 };
        rerender();
        expect(result.current.cartItems).toEqual([]);
        expect(stored('cart_guest')).toHaveLength(1);
        act(() => result.current.addToCart(tea));
        expect(stored('cart_5').map((i) => i.id)).toEqual([3]);
    });
});

describe('CartProvider: addToCart', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        currentUser = null;
    });

    it('без priceInfo ціна береться з товару, знижка 0', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee));
        expect(result.current.cartItems).toEqual([
            { ...coffee, cartItemId: '1-{}', selectedOptions: {}, price: 100, originalPrice: 100, discountPercent: 0, quantity: 1 },
        ]);
    });

    it('з priceInfo у кошику лежить ціна зі сторінки товару, а початкова ціна й знижка запам\'ятовуються', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee, { size: 'L' }, { finalPrice: 72, originalPrice: 120, discount: 40 }));
        const item = result.current.cartItems[0];
        expect(item.price).toBe(72);
        expect(item.originalPrice).toBe(120);
        expect(item.discountPercent).toBe(40);
        expect(item.selectedOptions).toEqual({ size: 'L' });
        expect(item.cartItemId).toBe('1-{"size":"L"}');
    });

    it('особливість: поле price товару перезаписується підсумковою ціною (повна ціна лишається в originalPrice)', () => {
        const { result } = setup();
        act(() => result.current.addToCart({ ...coffee, price: 100 }, {}, { finalPrice: 60, originalPrice: 100, discount: 40 }));
        expect(result.current.cartItems[0].price).toBe(60);
    });

    it('повторне додавання того самого товару з тими самими параметрами збільшує кількість', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee, { size: 'L' }));
        act(() => result.current.addToCart(coffee, { size: 'L' }));
        expect(result.current.cartItems).toHaveLength(1);
        expect(result.current.cartItems[0].quantity).toBe(2);
    });

    it('порядок ключів параметрів не впливає на ідентифікатор позиції', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee, { size: 'L', color: 'red' }));
        act(() => result.current.addToCart(coffee, { color: 'red', size: 'L' }));
        expect(result.current.cartItems).toHaveLength(1);
        expect(result.current.cartItems[0].quantity).toBe(2);
        expect(result.current.cartItems[0].cartItemId).toBe('1-{"color":"red","size":"L"}');
    });

    it('інші параметри дають окрему позицію', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee, { size: 'L' }));
        act(() => result.current.addToCart(coffee, { size: 'S' }));
        expect(result.current.cartItems.map((i) => i.cartItemId)).toEqual(['1-{"size":"L"}', '1-{"size":"S"}']);
    });

    it('показує сповіщення з назвою товару', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee));
        expect(toast.success).toHaveBeenCalledWith('"Кава" додано до кошика!');
    });

    it('зберігає кошик у localStorage', () => {
        const { result } = setup();
        act(() => result.current.addToCart(coffee));
        expect(stored()).toEqual(result.current.cartItems);
    });

    it('KNOWN-DEFECT D-ARC-13: повторне додавання змінює об\'єкт попереднього стану на місці', () => {
        // Функція-оновлювач мутує елемент prevItems замість створення нового об'єкта, а також пише в localStorage
        // усередині setState. У режимі StrictMode (dev) оновлювач викликається двічі, і кількість росте на 2.
        const { result } = setup();
        act(() => result.current.addToCart(coffee));
        const itemBefore = result.current.cartItems[0];
        expect(itemBefore.quantity).toBe(1);
        act(() => result.current.addToCart(coffee));
        expect(itemBefore.quantity).toBe(2);
        expect(result.current.cartItems[0]).toBe(itemBefore);
    });
});

describe('CartProvider: зміна й очищення', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        currentUser = null;
    });

    const filled = () => {
        const hook = setup();
        act(() => hook.result.current.addToCart(coffee));
        act(() => hook.result.current.addToCart(ebook));
        act(() => hook.result.current.addToCart(tea));
        return hook;
    };

    it('updateQuantity встановлює нову кількість і зберігає її', () => {
        const { result } = filled();
        act(() => result.current.updateQuantity('1-{}', 5));
        expect(result.current.cartItems.find((i) => i.id === 1).quantity).toBe(5);
        expect(stored().find((i) => i.id === 1).quantity).toBe(5);
    });

    it('updateQuantity з кількістю 0 або меншою видаляє позицію й показує сповіщення', () => {
        const { result } = filled();
        act(() => result.current.updateQuantity('1-{}', 0));
        expect(result.current.cartItems.map((i) => i.id)).toEqual([2, 3]);
        expect(toast.info).toHaveBeenCalledWith('Товар видалено з кошика');
        act(() => result.current.updateQuantity('2-{}', -3));
        expect(result.current.cartItems.map((i) => i.id)).toEqual([3]);
    });

    it('updateQuantity для невідомої позиції нічого не змінює', () => {
        const { result } = filled();
        act(() => result.current.updateQuantity('999-{}', 4));
        expect(result.current.cartItems.map((i) => i.quantity)).toEqual([1, 1, 1]);
    });

    it('removeFromCart видаляє позицію за cartItemId', () => {
        const { result } = filled();
        act(() => result.current.removeFromCart('2-{}'));
        expect(result.current.cartItems.map((i) => i.id)).toEqual([1, 3]);
        expect(toast.info).toHaveBeenCalledWith('Товар видалено з кошика');
    });

    it('clearCart спорожнює кошик без сповіщення', () => {
        const { result } = filled();
        vi.clearAllMocks();
        act(() => result.current.clearCart());
        expect(result.current.cartItems).toEqual([]);
        expect(stored()).toEqual([]);
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('clearCartBySite прибирає лише позиції цього сайту', () => {
        const { result } = filled();
        act(() => result.current.clearCartBySite(10));
        expect(result.current.cartItems.map((i) => i.id)).toEqual([3]);
    });

    it('особливість: clearCartBySite порівнює site_id суворо, тому рядок "10" не збігається з числом 10', () => {
        const { result } = filled();
        act(() => result.current.clearCartBySite('10'));
        expect(result.current.cartItems).toHaveLength(3);
    });
});

describe('CartProvider: isDigitalOnly', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        currentUser = null;
    });

    it('істина лише якщо кошик непорожній і всі позиції цифрові', () => {
        const { result } = setup();
        expect(result.current.isDigitalOnly).toBe(false);
        act(() => result.current.addToCart(ebook));
        expect(result.current.isDigitalOnly).toBe(true);
        act(() => result.current.addToCart(coffee));
        expect(result.current.isDigitalOnly).toBe(false);
        act(() => result.current.removeFromCart('1-{}'));
        expect(result.current.isDigitalOnly).toBe(true);
    });
});
