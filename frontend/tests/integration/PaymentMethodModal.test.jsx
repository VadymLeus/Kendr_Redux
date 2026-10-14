// Вікно вибору способу оплати (ADR-006): Google Pay прибрано, бо сервер не може його підтвердити (відповідає 501),
// тож покупець бачить єдиний робочий спосіб — картку через LiqPay.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import PaymentMethodModal from '../../src/shared/ui/complex/PaymentMethodModal';

const renderModal = (props = {}) => {
    const handlers = { onClose: vi.fn(), onSelectLiqPay: vi.fn() };
    const utils = render(<PaymentMethodModal isOpen amount="150" currencySymbol="₴" {...handlers} {...props} />);
    return { ...utils, ...handlers };
};

beforeEach(() => {
    document.body.style.overflow = '';
});

describe('PaymentMethodModal', () => {
    it('закрите вікно нічого не відображає', () => {
        const { container } = render(<PaymentMethodModal isOpen={false} onClose={vi.fn()} onSelectLiqPay={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('показує заголовок і суму до сплати з символом валюти', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Спосіб оплати' })).toBeInTheDocument();
        expect(screen.getByText('150 ₴')).toBeInTheDocument();
    });

    it('пропонує єдиний спосіб оплати — картку LiqPay; Google Pay немає', () => {
        renderModal();
        expect(screen.getByRole('button', { name: /LiqPay/ })).toBeInTheDocument();
        expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
        expect(screen.queryByText('або')).not.toBeInTheDocument();
        // Кнопки лише дві: закрити вікно й оплатити карткою.
        expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('натискання «Оплатити карткою» викликає onSelectLiqPay один раз', () => {
        const { onSelectLiqPay } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: /LiqPay/ }));
        expect(onSelectLiqPay).toHaveBeenCalledTimes(1);
    });

    it('кнопка закриття й клік по затемненню викликають onClose', () => {
        const { onClose, container } = renderModal();
        fireEvent.click(screen.getAllByRole('button')[0]);
        fireEvent.click(container.querySelector('.backdrop-blur-sm'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('під час оплати кнопки заблоковано, а клік по затемненню вікна не закриває', () => {
        const { onClose, onSelectLiqPay, container } = renderModal({ isLoading: true });
        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
        fireEvent.click(container.querySelector('.backdrop-blur-sm'));
        fireEvent.click(screen.getAllByRole('button')[1]);
        expect(onClose).not.toHaveBeenCalled();
        expect(onSelectLiqPay).not.toHaveBeenCalled();
    });

    it('поки вікно відкрите, прокручування сторінки вимкнено, а після закриття повертається', () => {
        const { rerender, unmount } = renderModal();
        expect(document.body.style.overflow).toBe('hidden');
        rerender(<PaymentMethodModal isOpen={false} onClose={vi.fn()} onSelectLiqPay={vi.fn()} />);
        expect(document.body.style.overflow).toBe('unset');
        rerender(<PaymentMethodModal isOpen onClose={vi.fn()} onSelectLiqPay={vi.fn()} />);
        unmount();
        expect(document.body.style.overflow).toBe('unset');
    });
});

describe('інтерфейс більше не звертається до Google Pay', () => {
    const SRC = resolve(process.cwd(), 'src');
    const listSources = (dir) =>
        readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) return listSources(path);
            return /\.(js|jsx)$/.test(name) ? [path] : [];
        });
    // Ознаки старого коду: бібліотека кнопки, її конфігурація в пропсах і маршрути сервера, які відповідають 501.
    const GOOGLE_PAY = /@google-pay|GooglePayButton|gpayConfig|handleGooglePay|\/pay\/gpay|\/upgrade\/gpay/;

    it('у коді застосунку немає посилань на кнопку, конфігурацію і маршрути Google Pay', () => {
        const found = listSources(SRC)
            .filter((file) => GOOGLE_PAY.test(readFileSync(file, 'utf8')))
            .map((file) => relative(SRC, file));
        expect(found).toEqual([]);
    });
});
