// Тести getAttachmentUrl (D-CON-04): адреса вкладень тікета будується від VITE_API_URL, а не від зашитого localhost:5000.
// Адреса читається під час завантаження модуля, тому для кожного значення змінної модулі скидаються й імпортуються наново.
import { describe, it, expect, afterEach, vi } from 'vitest';

const loadWithApiUrl = async (apiUrl) => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', apiUrl);
    return import('../../src/shared/utils/mediaUtils');
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('getAttachmentUrl', () => {
    it('відносний шлях добудовується до адреси API зі змінної середовища', async () => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl('/uploads/tickets/a.png')).toBe('https://api.kendr.test/uploads/tickets/a.png');
    });

    it('шлях без початкового "/" теж добудовується правильно', async () => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl('uploads/tickets/a.png')).toBe('https://api.kendr.test/uploads/tickets/a.png');
    });

    it.each([
        ['https://api.kendr.test/api'],
        ['https://api.kendr.test/'],
        ['https://api.kendr.test/api/'],
    ])('значення змінної %s дає адресу без /api і без подвійного слеша', async (apiUrl) => {
        const { getAttachmentUrl } = await loadWithApiUrl(apiUrl);
        expect(getAttachmentUrl('/uploads/a.png')).toBe('https://api.kendr.test/uploads/a.png');
    });

    it('без змінної середовища використовується стандартна локальна адреса API', async () => {
        const { getAttachmentUrl } = await loadWithApiUrl('');
        expect(getAttachmentUrl('/uploads/a.png')).toBe('http://localhost:5000/uploads/a.png');
    });

    it('адреса не залежить від зашитого localhost:5000, коли змінну задано', async () => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl('/uploads/a.png')).not.toContain('localhost');
    });

    it.each([
        ['http://cdn.example.com/a.png'],
        ['https://cdn.example.com/a.png'],
        ['blob:http://localhost:5173/3f2a'],
    ])('абсолютна або blob-адреса %s лишається без змін', async (url) => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl(url)).toBe(url);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['порожній рядок', ''],
        ['число', 42],
        ['об\'єкт', { path: '/a.png' }],
    ])('порожнє або нерядкове значення (%s) → null', async (_, value) => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl(value)).toBeNull();
    });

    it.each([
        ['javascript:alert(1)'],
        ['  JavaScript:alert(1)'],
        ['vbscript:msgbox(1)'],
    ])('небезпечна схема %j відкидається', async (url) => {
        const { getAttachmentUrl } = await loadWithApiUrl('https://api.kendr.test');
        expect(getAttachmentUrl(url)).toBeNull();
    });
});
