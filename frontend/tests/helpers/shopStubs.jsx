// Заглушки для тестів магазину (картка товару, сторінка товару, кошик).
import React from 'react';

// Простий елемент із data-testid, щоб перевіряти, що компонент відрисовано.
export const makeIdStub = (id) => {
    const Stub = () => <div data-testid={id} />;
    Stub.displayName = `Stub(${id})`;
    return Stub;
};

export const NullStub = () => null;

export const ConfirmModalStub = ({ isOpen, title, message, onConfirm, onCancel }) =>
    isOpen ? (
        <div data-testid="confirm-modal">
            <span data-testid="confirm-title">{title}</span>
            <span data-testid="confirm-message">{message}</span>
            <button type="button" onClick={onConfirm}>confirm-yes</button>
            <button type="button" onClick={onCancel}>confirm-no</button>
        </div>
    ) : null;

export const NovaPoshtaStub = ({ isOpen, onSelect }) =>
    isOpen ? (
        <button type="button" data-testid="pick-address" onClick={() => onSelect('Нова Пошта: Відділення №1, Київ')}>
            pick-address
        </button>
    ) : null;

export const PaymentModalStub = ({ isOpen, onClose, amount, currencySymbol, onSelectLiqPay }) =>
    isOpen ? (
        <div data-testid="payment-modal" data-amount={amount} data-currency={currencySymbol}>
            <button type="button" onClick={onClose}>close-payment</button>
            <button type="button" onClick={onSelectLiqPay}>liqpay</button>
        </div>
    ) : null;

export const EmptyStateStub = ({ title }) => <div data-testid="empty-state">{title}</div>;
