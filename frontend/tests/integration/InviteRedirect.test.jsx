// Повернення за запрошенням (D-CON-03): гість відкриває /invite/<токен>, входить і потрапляє назад до запрошення.
// Раніше InvitePage записувала адресу в localStorage під ключем redirectAfterAuth, а AuthPage читає її зі стану навігації
// (location.state.from), тому після входу користувач опинявся на головній. Перевіряється весь шлях: запрошення → вхід →
// (перемикання вхід/реєстрація) → запрошення, а сам виклик прийняття запрошення йде з тим самим токеном.
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import apiClient from '../../src/shared/api/api';
import { AuthContext } from '../../src/app/providers/AuthContext';
import AuthPage from '../../src/modules/auth/AuthPage';
import InvitePage from '../../src/pages/InvitePage';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/shared/config', () => ({
    BASE_URL: 'http://api.test',
    API_URL: 'http://api.test/api',
    UPLOADS_URL: 'http://api.test/uploads',
    GOOGLE_AUTH_URL: 'http://api.test/api/auth/google',
}));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@marsidev/react-turnstile', async () => ({ Turnstile: (await import('../helpers/authStubs')).TurnstileStub }));
vi.mock('react-helmet-async', async () => ({ Helmet: (await import('../helpers/authStubs')).HelmetStub }));
vi.mock('../../src/shared/ui/elements/Avatar', async () => ({ default: (await import('../helpers/shopStubs')).makeIdStub('avatar') }));
vi.mock('../../src/shared/ui/complex/ImageUploadTrigger', async () => ({ default: (await import('../helpers/authStubs')).PassThroughStub }));
vi.mock('../../src/shared/ui/complex/PasswordStrengthMeter', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));
vi.mock('../../src/shared/ui/complex/OtpInput', async () => ({ default: (await import('../helpers/shopStubs')).NullStub }));

const loginSpy = vi.fn();

// Показує, де опинився користувач (поточний шлях).
const Where = ({ label }) => {
    const location = useLocation();
    return <div data-testid={label}>{location.pathname}</div>;
};

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const auth = {
        isAuthenticated,
        isLoading: false,
        login: (...args) => {
            loginSpy(...args);
            setIsAuthenticated(true);
        },
    };
    return (
        <AuthContext.Provider value={auth}>
            <Routes>
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/my-sites" element={<Where label="my-sites" />} />
                <Route path="*" element={<Where label="elsewhere" />} />
            </Routes>
        </AuthContext.Provider>
    );
};

const renderAt = (entry) => render(
    <MemoryRouter initialEntries={[entry]}>
        <App />
    </MemoryRouter>
);

const fillAndSubmitLogin = (container) => {
    fireEvent.change(screen.getByPlaceholderText('Введіть дані'), { target: { name: 'loginInput', value: 'ann' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { name: 'password', value: 'secret-1' } });
    fireEvent.submit(container.querySelector('form'));
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiClient.post.mockImplementation(async (url) => {
        if (url === '/auth/login') return { data: { user: { id: 1, username: 'ann' }, token: 'jwt' } };
        if (url === '/team/invite/accept') return { data: { message: 'ok' } };
        throw new Error(`unexpected request ${url}`);
    });
});

describe('вхід за запрошенням веде назад до запрошення (D-CON-03)', () => {
    it('гість натискає «Увійти / Зареєструватися» і потрапляє на сторінку входу', async () => {
        renderAt('/invite/abc');
        fireEvent.click(await screen.findByRole('button', { name: 'Увійти / Зареєструватися' }));
        expect(await screen.findByRole('heading', { name: 'Вхід' })).toBeInTheDocument();
    });

    it('після входу користувач повертається до запрошення і приймає його з тим самим токеном', async () => {
        const { container } = renderAt('/invite/abc');
        fireEvent.click(await screen.findByRole('button', { name: 'Увійти / Зареєструватися' }));
        await screen.findByRole('heading', { name: 'Вхід' });
        fillAndSubmitLogin(container);
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/team/invite/accept', { token: 'abc' }));
        expect(loginSpy).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('elsewhere')).not.toBeInTheDocument();
    });

    it('перемикання «вхід ↔ реєстрація» не губить адресу повернення', async () => {
        const { container } = renderAt('/invite/abc');
        fireEvent.click(await screen.findByRole('button', { name: 'Увійти / Зареєструватися' }));
        await screen.findByRole('heading', { name: 'Вхід' });
        fireEvent.click(screen.getByRole('button', { name: 'Немає акаунту? Реєстрація' }));
        expect(await screen.findByRole('heading', { name: 'Реєстрація' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Вже є акаунт? Увійти' }));
        await screen.findByRole('heading', { name: 'Вхід' });
        fillAndSubmitLogin(container);
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/team/invite/accept', { token: 'abc' }));
    });

    it('запрошення не залишає службових записів у localStorage', async () => {
        renderAt('/invite/abc');
        fireEvent.click(await screen.findByRole('button', { name: 'Увійти / Зареєструватися' }));
        await screen.findByRole('heading', { name: 'Вхід' });
        expect(localStorage.getItem('redirectAfterAuth')).toBeNull();
    });
});

describe('вхід без запрошення', () => {
    it('веде на головну, коли адреси повернення немає', async () => {
        const { container } = renderAt('/login');
        await screen.findByRole('heading', { name: 'Вхід' });
        fillAndSubmitLogin(container);
        expect(await screen.findByTestId('elsewhere')).toHaveTextContent(/^\/$/);
        expect(apiClient.post).not.toHaveBeenCalledWith('/team/invite/accept', expect.anything());
    });

    it('веде на адресу зі стану навігації, якщо її передано (наприклад, захищений маршрут)', async () => {
        const { container } = renderAt({ pathname: '/login', state: { from: '/my-sites' } });
        await screen.findByRole('heading', { name: 'Вхід' });
        fillAndSubmitLogin(container);
        expect(await screen.findByTestId('my-sites')).toBeInTheDocument();
    });
});
