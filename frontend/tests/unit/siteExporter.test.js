// Характеризаційні тести v0: експорт сайту в zip (exportSiteToZip).
// Мережа, JSZip і file-saver замінені підмінами; htmlGenerator працює справжній, тож перевіряється
// весь шлях «сторінки -> завантаження медіа -> заміна посилань -> HTML -> архів».
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveAs } from 'file-saver';
import apiClient from '../../src/shared/api/api';
import { exportSiteToZip } from '../../src/shared/utils/siteExporter';
import { zipState, resetZip } from '../helpers/fakeZip';

vi.mock('jszip', async () => ({ default: (await import('../helpers/fakeZip')).FakeZip }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('../../src/shared/api/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../src/shared/config', () => ({ BASE_URL: 'http://api.test' }));

const pagesMeta = [
    { id: 1, slug: 'home', title: 'Головна', is_homepage: 1 },
    { id: 2, slug: 'about', title: 'Про нас', is_homepage: 0 },
];

// contentById: id сторінки -> block_content (масив, рядок JSON) або Error для імітації помилки запиту
const mockApi = (contentById = {}, pages = pagesMeta) => {
    apiClient.get.mockImplementation(async (url) => {
        if (url === '/sites/5/pages') return { data: pages };
        const match = url.match(/^\/pages\/(\d+)$/);
        if (match) {
            const content = contentById[match[1]];
            if (content instanceof Error) throw content;
            return { data: { block_content: content } };
        }
        throw new Error(`unexpected request ${url}`);
    });
};

let fetchMock;
const okBlob = (type = 'image/png') => ({ ok: true, blob: async () => ({ type }) });
const mockFetch = (impl) => {
    fetchMock = vi.fn(impl || (async () => okBlob()));
    vi.stubGlobal('fetch', fetchMock);
};

const site = (extra = {}) => ({ id: 5, site_path: 'my-shop', title: 'Магазин', ...extra });
const textBlock = (content) => ({ type: 'text', data: { content } });
const assetFiles = () => Object.keys(zipState.files).filter((k) => k.startsWith('assets/'));

describe('exportSiteToZip', () => {
    beforeEach(() => {
        resetZip();
        apiClient.get.mockClear();
        saveAs.mockClear();
        mockFetch();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('склад архіву', () => {
        it('додає сторінки, стилі й README та зберігає архів під ім\'ям <site_path>_export.zip', async () => {
            mockApi({ 1: [textBlock('Привіт')], 2: [textBlock('Про нас')] });
            const result = await exportSiteToZip(site());
            expect(result).toBe(true);
            expect(Object.keys(zipState.files).sort()).toEqual(['README.txt', 'about.html', 'css/style.css', 'index.html']);
            expect(zipState.options).toEqual({ type: 'blob' });
            expect(saveAs).toHaveBeenCalledTimes(1);
            expect(saveAs.mock.calls[0][1]).toBe('my-shop_export.zip');
            expect(zipState.files['README.txt']).toContain('Exported from Kendr Website Builder.');
        });

        it('без site_path ім\'я архіву "website_export.zip"', async () => {
            mockApi({ 1: [], 2: [] });
            await exportSiteToZip({ id: 5, title: 'Магазин' });
            expect(saveAs.mock.calls[0][1]).toBe('website_export.zip');
        });

        it('головна сторінка зберігається як index.html, решта — <slug>.html', async () => {
            mockApi({ 1: [textBlock('Головна')], 2: [textBlock('Про нас')] });
            await exportSiteToZip(site());
            expect(zipState.files['index.html']).toContain('Головна');
            expect(zipState.files['about.html']).toContain('Про нас');
        });

        it('заголовок сторінки поєднується з назвою сайту в <title>', async () => {
            mockApi({ 1: [], 2: [] });
            await exportSiteToZip(site());
            expect(zipState.files['about.html']).toContain('<title>Про нас - Магазин</title>');
            expect(zipState.files['index.html']).toContain('<title>Головна - Магазин</title>');
        });

        it('запитує сторінки сайту, а потім вміст кожної сторінки', async () => {
            mockApi({ 1: [], 2: [] });
            await exportSiteToZip(site());
            expect(apiClient.get.mock.calls.map((c) => c[0])).toEqual(['/sites/5/pages', '/pages/1', '/pages/2']);
        });

        it('D-BLK-06: блоки global-header і global-footer зі сторінки беруть дані сайту (так їх зберігає редактор)', async () => {
            const globals = (text) => [
                { type: 'global-header', block_id: 'h', data: {} },
                textBlock(text),
                { type: 'global-footer', block_id: 'f', data: {} },
            ];
            mockApi({ 1: globals('A'), 2: globals('B') });
            await exportSiteToZip(
                site({
                    header_content: { site_title: 'Шапка', show_title: true, nav_items: [{ id: 'n', label: 'Меню', link: '/menu' }] },
                    footer_content: { copyright: 'Підвал', links: [{ id: 'l', label: 'Умови', link: '/terms' }] },
                })
            );
            ['index.html', 'about.html'].forEach((name) => {
                const html = zipState.files[name];
                expect(html.match(/<header/g)).toHaveLength(1);
                expect(html.match(/<footer/g)).toHaveLength(1);
                expect(html).toContain('>Шапка</span>');
                expect(html).toContain('href="menu.html"');
                expect(html).toContain('Підвал');
                expect(html).toContain('href="terms.html"');
            });
        });

        it('глобальні шапка й підвал з даних сайту потрапляють на кожну сторінку', async () => {
            mockApi({ 1: [textBlock('A')], 2: [textBlock('B')] });
            await exportSiteToZip(
                site({
                    header_content: [{ type: 'header', data: { site_title: 'Шапка', show_title: true } }],
                    footer_content: [{ type: 'footer', data: { content: 'Підвал' } }],
                })
            );
            ['index.html', 'about.html'].forEach((name) => {
                expect(zipState.files[name]).toContain('Шапка');
                expect(zipState.files[name]).toContain('Підвал');
            });
        });
    });

    describe('вміст сторінок', () => {
        it('block_content у вигляді рядка JSON розбирається', async () => {
            mockApi({ 1: JSON.stringify([textBlock('З рядка')]), 2: [] });
            await exportSiteToZip(site());
            expect(zipState.files['index.html']).toContain('З рядка');
        });

        it('некоректний JSON дає порожню сторінку, експорт триває', async () => {
            mockApi({ 1: '{не json', 2: [textBlock('Друга')] });
            await expect(exportSiteToZip(site())).resolves.toBe(true);
            expect(zipState.files['index.html']).not.toContain('<p style');
            expect(zipState.files['about.html']).toContain('Друга');
        });

        it('помилка запиту вмісту однієї сторінки дає порожню сторінку, експорт триває', async () => {
            mockApi({ 1: new Error('500'), 2: [textBlock('Друга')] });
            await expect(exportSiteToZip(site())).resolves.toBe(true);
            expect(zipState.files['index.html']).toBeDefined();
            expect(zipState.files['about.html']).toContain('Друга');
        });

        it('null у block_content трактується як порожня сторінка', async () => {
            mockApi({ 1: null, 2: [] });
            await expect(exportSiteToZip(site())).resolves.toBe(true);
        });

        it('помилка запиту списку сторінок перериває експорт і прокидається далі', async () => {
            apiClient.get.mockImplementation(async () => {
                throw new Error('network');
            });
            await expect(exportSiteToZip(site())).rejects.toThrow('network');
            expect(saveAs).not.toHaveBeenCalled();
        });
    });

    describe('медіафайли', () => {
        const withMedia = (extraBlocks = []) => [
            { type: 'image', data: { mode: 'single', items: [{ src: '/uploads/a.png' }] } },
            { type: 'hero', data: { bg_image: 'https://cdn.test/bg.jpg', title: 'T' } },
            ...extraBlocks,
        ];

        it('завантажує файли, зберігає їх як assets/media_<n>.<ext> і замінює посилання в HTML', async () => {
            mockApi({ 1: withMedia(), 2: [] });
            await exportSiteToZip(site());
            const files = assetFiles();
            expect(files).toHaveLength(2);
            expect(files.some((f) => /^assets\/media_\d+\.png$/.test(f))).toBe(true);
            expect(files.some((f) => /^assets\/media_\d+\.jpg$/.test(f))).toBe(true);
            const html = zipState.files['index.html'];
            files.forEach((f) => expect(html).toContain(f));
            expect(html).not.toContain('/uploads/a.png');
            expect(html).not.toContain('https://cdn.test/bg.jpg');
        });

        it('відносні адреси завантажуються з BASE_URL, абсолютні — як є', async () => {
            mockApi({ 1: withMedia(), 2: [] });
            await exportSiteToZip(site());
            const urls = fetchMock.mock.calls.map((c) => c[0]);
            expect(urls).toContain('http://api.test/uploads/a.png');
            expect(urls).toContain('https://cdn.test/bg.jpg');
        });

        it('ресурси з /src/ і /assets/ завантажуються з поточного origin', async () => {
            mockApi({ 1: [{ type: 'image', data: { url: '/src/assets/logo.svg' } }], 2: [] });
            await exportSiteToZip(site());
            expect(fetchMock.mock.calls.map((c) => c[0])).toContain(`${window.location.origin}/src/assets/logo.svg`);
        });

        it('data: і blob: адреси не завантажуються й лишаються в HTML', async () => {
            mockApi({
                1: [
                    { type: 'image', data: { url: 'data:image/png;base64,AAAA' } },
                    { type: 'image', data: { url: 'blob:http://localhost/abc' } },
                ],
                2: [],
            });
            await exportSiteToZip(site());
            expect(fetchMock).not.toHaveBeenCalled();
            expect(assetFiles()).toEqual([]);
            expect(zipState.files['index.html']).toContain('data:image/png;base64,AAAA');
        });

        it('невдале завантаження (статус не 200 або помилка мережі) лишає початкове посилання', async () => {
            mockFetch(async (url) => {
                if (url.includes('a.png')) return { ok: false, status: 404 };
                throw new Error('offline');
            });
            mockApi({ 1: withMedia(), 2: [] });
            await expect(exportSiteToZip(site())).resolves.toBe(true);
            expect(assetFiles()).toEqual([]);
            expect(zipState.files['index.html']).toContain('/uploads/a.png');
            expect(zipState.files['index.html']).toContain('https://cdn.test/bg.jpg');
        });

        it('однакове посилання на кількох сторінках завантажується один раз', async () => {
            const same = [{ type: 'image', data: { url: '/uploads/same.png' } }];
            mockApi({ 1: same, 2: same });
            await exportSiteToZip(site());
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(assetFiles()).toHaveLength(1);
            const name = assetFiles()[0];
            expect(zipState.files['index.html']).toContain(name);
            expect(zipState.files['about.html']).toContain(name);
        });

        it('розширення береться з посилання, а за його відсутності — з типу відповіді', async () => {
            const types = { '/uploads/clip': 'video/mp4', '/uploads/pic': 'image/svg+xml', '/uploads/raw': 'application/octet-stream' };
            mockFetch(async (url) => okBlob(types[url.replace('http://api.test', '')]));
            mockApi({
                1: [
                    { type: 'image', data: { url: '/uploads/clip' } },
                    { type: 'image', data: { url: '/uploads/pic' } },
                    { type: 'image', data: { url: '/uploads/raw' } },
                ],
                2: [],
            });
            await exportSiteToZip(site());
            const extensions = assetFiles().map((f) => f.split('.').pop()).sort();
            expect(extensions).toEqual(['jpg', 'mp4', 'svg']);
        });

        it('особливість: іконка .ico зберігається з розширенням .jpg', async () => {
            mockFetch(async () => okBlob('image/x-icon'));
            mockApi({ 1: [], 2: [] });
            await exportSiteToZip(site({ favicon_url: '/uploads/fav.ico' }));
            expect(assetFiles()).toHaveLength(1);
            expect(assetFiles()[0]).toMatch(/\.jpg$/);
            expect(zipState.files['index.html']).toContain('<link rel="icon" href="assets/media_');
        });

        it('особливість: будь-яке значення ключа url / src / href завантажується як медіафайл, навіть якщо це не файл', async () => {
            mockFetch(async () => okBlob('text/html'));
            mockApi({ 1: [{ type: 'video', data: { url: 'https://youtu.be/abc' } }], 2: [] });
            await exportSiteToZip(site());
            expect(fetchMock.mock.calls.map((c) => c[0])).toContain('https://youtu.be/abc');
        });
    });

    describe('стилі сайту (css/style.css)', () => {
        const cssOf = async (siteExtra = {}) => {
            mockApi({ 1: [], 2: [] });
            resetZip();
            await exportSiteToZip(site(siteExtra));
            return zipState.files['css/style.css'];
        };

        it('світла тема за замовчуванням', async () => {
            const css = await cssOf();
            expect(css).toContain('--site-accent: #3b82f6;');
            expect(css).toContain('--site-bg: #ffffff;');
            expect(css).toContain('--site-text-primary: #1a202c;');
            expect(css).toContain('--site-text-secondary: #4a5568;');
            expect(css).toContain('--site-card-bg: #ffffff;');
            expect(css).toContain('--site-border-color: #e2e8f0;');
        });

        it('темна тема змінює фон, текст, картки й рамки', async () => {
            const css = await cssOf({ site_theme_mode: 'dark' });
            expect(css).toContain('--site-bg: #1a202c;');
            expect(css).toContain('--site-text-primary: #f7fafc;');
            expect(css).toContain('--site-text-secondary: #a0aec0;');
            expect(css).toContain('--site-card-bg: #2d3748;');
            expect(css).toContain('--site-border-color: #4a5568;');
        });

        it('theme_settings перевизначають акцент, фон і колір тексту; фон шапки збігається з фоном сайту', async () => {
            const css = await cssOf({ theme_settings: { accentColor: '#ff0000', backgroundColor: '#101010', textColor: '#eeeeee' } });
            expect(css).toContain('--site-accent: #ff0000;');
            expect(css).toContain('--site-bg: #101010;');
            expect(css).toContain('--site-text-primary: #eeeeee;');
            expect(css).toContain('--site-header-bg: #101010;');
        });

        it('символи ; { } у значеннях кольорів вилучаються', async () => {
            const css = await cssOf({ theme_settings: { accentColor: '#fff;}body{display:none' } });
            expect(css).toContain('--site-accent: #fffbodydisplay:none;');
        });
    });
});
