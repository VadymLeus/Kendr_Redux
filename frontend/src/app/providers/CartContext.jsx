// frontend/src/app/providers/CartContext.jsx
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from './AuthContext';
import { toast } from 'react-toastify';

export const CartContext = createContext(null);
export const CartProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const [cartItems, setCartItems] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    // Актуальний вміст кошика: оновлювач читає його звідси, а не з функції setState (D-ARC-13).
    const itemsRef = useRef([]);
    const getCartKey = () => `cart_${user?.id || 'guest'}`;
    useEffect(() => {
        const cartKey = getCartKey();
        let items = [];
        try {
            const localData = localStorage.getItem(cartKey);
            items = localData ? JSON.parse(localData) : [];
        } catch (error) {
            console.error(`Помилка парсингу кошика`, error);
            items = [];
        } finally {
            itemsRef.current = items;
            setCartItems(items);
            setIsLoaded(true);
        }
    }, [user]);
    // Нове значення обчислюється один раз, поза функцією setState: у StrictMode її викликають двічі, і побічні дії
    // (запис у localStorage) та зміна попереднього стану виконувалися б двічі.
    const updateCart = (updater) => {
        const newItems = typeof updater === 'function' ? updater(itemsRef.current) : updater;
        itemsRef.current = newItems;
        setCartItems(newItems);
        try {
            localStorage.setItem(getCartKey(), JSON.stringify(newItems));
        } catch (error) {
            console.error('Не вдалося зберегти кошик', error);
        }
    };

    const isDigitalOnly = cartItems.length > 0 && cartItems.every(item => item.type === 'digital');
    const addToCart = (product, selectedOptions = {}, priceInfo = null) => {
        const optionsString = JSON.stringify(selectedOptions, Object.keys(selectedOptions).sort());
        const cartItemId = `${product.id}-${optionsString}`;
        const finalPrice = priceInfo ? priceInfo.finalPrice : product.price;
        const originalPrice = priceInfo ? priceInfo.originalPrice : product.price;
        const discount = priceInfo ? priceInfo.discount : 0;
        updateCart(prevItems => {
            const existingItemIndex = prevItems.findIndex(item => item.cartItemId === cartItemId);
            if (existingItemIndex > -1) {
                return prevItems.map((item, index) =>
                    index === existingItemIndex ? { ...item, quantity: item.quantity + 1 } : item
                );
            } else {
                return [...prevItems, { 
                    ...product, 
                    cartItemId,
                    selectedOptions,
                    price: finalPrice,
                    originalPrice: originalPrice,
                    discountPercent: discount,
                    quantity: 1 
                }];
            }
        });
        toast.success(`"${product.name}" додано до кошика!`);
    };
    const removeFromCart = (cartItemId) => {
        updateCart(prevItems => prevItems.filter(item => item.cartItemId !== cartItemId));
        toast.info("Товар видалено з кошика");
    };
    const updateQuantity = (cartItemId, newQuantity) => {
        if (newQuantity <= 0) {
            removeFromCart(cartItemId);
        } else {
            updateCart(prevItems =>
                prevItems.map(item =>
                    item.cartItemId === cartItemId ? { ...item, quantity: newQuantity } : item
                )
            );
        }
    };
    const clearCart = () => {
        updateCart([]);
    };
    const clearCartBySite = (siteId) => {
        updateCart(prevItems => prevItems.filter(item => item.site_id !== siteId));
    };
    return (
        <CartContext.Provider value={{ 
            cartItems, 
            isDigitalOnly,
            isLoaded,
            addToCart, 
            removeFromCart, 
            clearCart, 
            clearCartBySite,
            updateQuantity 
        }}>
            {children}
        </CartContext.Provider>
    );
};