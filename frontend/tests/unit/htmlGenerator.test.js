// Характеризаційні тести v0: експорт сайту в статичний HTML (generateFullHTML).
// Експорт фактично є другим рендерером блоків (D-BLK-02). Тести фіксують його вивід такий, який він є,
// включно з відомими дефектами; у v1.0 вивід лишається побайтово тим самим (золоті файли в tests/golden),
// у v2.0 тести, позначені KNOWN-DEFECT, перевернуто свідомо (D-BLK-06, D-SEC-27: див. docs/04-results/v2.0/fixes.md).
import { describe, it, expect } from 'vitest';
import { generateFullHTML } from '../../src/shared/utils/htmlGenerator';
import { getBlockHtmlRenderer } from '../../src/modules/editor/core/blockRegistry';
import { expectGolden } from '../helpers/golden';
import { exportSiteData, exportPageBlocks } from '../fixtures/exportSite';

const squash = (text) => text.replace(/\s+/g, ' ').trim();
const bodyOf = (html) => html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('<script>'));
const render = (blocks, siteData = { title: 'T' }) => squash(bodyOf(generateFullHTML(siteData, blocks, 'P')));
const one = (type, data = {}) => render([{ type, data }]);

describe('generateFullHTML: каркас документа', () => {
    it('починається з doctype, мова документа — uk', () => {
        const html = generateFullHTML({ title: 'Магазин' }, [], 'Головна');
        expect(html.startsWith('<!DOCTYPE html>\n<html lang="uk">')).toBe(true);
        expect(html).toContain('<meta charset="UTF-8">');
        expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    });

    it('заголовок: "<сторінка> - <сайт>"', () => {
        expect(generateFullHTML({ title: 'Магазин' }, [], 'Головна')).toContain('<title>Головна - Магазин</title>');
    });

    it('без назви сторінки в заголовку лише назва сайту', () => {
        expect(generateFullHTML({ title: 'Магазин' }, [], '')).toContain('<title>Магазин</title>');
        expect(generateFullHTML({ title: 'Магазин' }, [], undefined)).toContain('<title>Магазин</title>');
    });

    it('без назви сайту підставляється "My Website"', () => {
        expect(generateFullHTML({}, [], 'Головна')).toContain('<title>Головна - My Website</title>');
        expect(generateFullHTML({}, [], '')).toContain('<title>My Website</title>');
    });

    it('опис для пошукових систем береться з seo_description, за замовчуванням порожній', () => {
        expect(generateFullHTML({ seo_description: 'Кава' }, [], 'P')).toContain('<meta name="description" content="Кава">');
        expect(generateFullHTML({}, [], 'P')).toContain('<meta name="description" content="">');
    });

    it('іконка сайту додається лише за наявності favicon_url', () => {
        const withIcon = generateFullHTML({ favicon_url: 'assets/media_0.png' }, [], 'P');
        expect(withIcon).toContain('<link rel="icon" href="assets/media_0.png" type="image/x-icon">');
        expect(generateFullHTML({}, [], 'P')).not.toContain('rel="icon"');
    });

    it('залежить від зовнішніх ресурсів: lucide з unpkg, шрифт Inter з Google Fonts, css/style.css', () => {
        const html = generateFullHTML({}, [], 'P');
        expect(html).toContain('<script src="https://unpkg.com/lucide@latest"></script>');
        expect(html).toContain('https://fonts.googleapis.com/css2?family=Inter');
        expect(html).toContain('<link rel="stylesheet" href="css/style.css">');
        expect(html).toContain('lucide.createIcons();');
    });

    it('нерядкові blocks (null, не масив) трактуються як порожня сторінка', () => {
        expect(squash(bodyOf(generateFullHTML({ title: 'T' }, null, 'P')))).toBe('');
        expect(squash(bodyOf(generateFullHTML({ title: 'T' }, { type: 'text' }, 'P')))).toBe('');
    });

    it('блоки без даних і невідомі типи дають порожній рядок', () => {
        expect(render([{ type: 'text' }])).toBe('');
        expect(render([null])).toBe('');
        expect(render([{ type: 'unknown-type', data: { a: 1 } }])).toBe('');
    });
});

describe('generateFullHTML: глобальні хедер і футер сайту', () => {
    const headerBlock = { type: 'header', data: { site_title: 'Зі сторінки', show_title: true } };

    it('header_content (масив) додається першим, футер — останнім', () => {
        const html = generateFullHTML(
            {
                title: 'T',
                header_content: [{ type: 'header', data: { site_title: 'Шапка', show_title: true } }],
                footer_content: [{ type: 'footer', data: { content: 'Підвал' } }],
            },
            [{ type: 'text', data: { content: 'Середина' } }],
            'P'
        );
        const body = squash(bodyOf(html));
        const iHeader = body.indexOf('Шапка');
        const iText = body.indexOf('Середина');
        const iFooter = body.indexOf('Підвал');
        expect(iHeader).toBeGreaterThan(-1);
        expect(iText).toBeGreaterThan(iHeader);
        expect(iFooter).toBeGreaterThan(iText);
    });

    it('header_content і footer_content можуть бути об\'єктами, а не масивами', () => {
        const body = render([], {
            title: 'T',
            header_content: { type: 'header', data: { site_title: 'Шапка', show_title: true } },
            footer_content: { type: 'footer', data: { content: 'Підвал' } },
        });
        expect(body).toContain('Шапка');
        expect(body).toContain('Підвал');
    });

    it('якщо на сторінці вже є header або footer, вони не дублюються; дані беруться з налаштувань сайту, як на публічному сайті', () => {
        const body = render(
            [headerBlock, { type: 'footer', data: { content: 'Свій підвал' } }],
            {
                title: 'T',
                header_content: [{ type: 'header', data: { site_title: 'Глобальна шапка', show_title: true } }],
                footer_content: [{ type: 'footer', data: { content: 'Глобальний підвал' } }],
            }
        );
        expect(body.match(/<header/g)).toHaveLength(1);
        expect(body.match(/<footer/g)).toHaveLength(1);
        expect(body).toContain('Глобальна шапка');
        expect(body).toContain('Глобальний підвал');
        expect(body).not.toContain('Зі сторінки');
        expect(body).not.toContain('Свій підвал');
    });

    it('без даних у налаштуваннях сайту блок на сторінці виводиться зі своїми даними', () => {
        const body = render([headerBlock, { type: 'footer', data: { content: 'Свій підвал' } }], { title: 'T' });
        expect(body).toContain('Зі сторінки');
        expect(body).toContain('Свій підвал');
    });

    it('порожні масиви header_content і footer_content нічого не додають', () => {
        expect(render([], { title: 'T', header_content: [], footer_content: [] })).toBe('');
    });

    it('дані сайту накладаються на дані блока хедера (siteData має пріоритет)', () => {
        const body = render([], {
            title: 'T',
            site_title: 'З налаштувань сайту',
            show_title: true,
            header_content: [{ type: 'header', data: { site_title: 'З блока', show_title: false } }],
        });
        expect(body).toContain('З налаштувань сайту');
        expect(body).not.toContain('З блока');
    });

    it('вхідні масиви й об\'єкти не змінюються', () => {
        const blocks = [{ type: 'text', data: { content: 'x' } }];
        const siteData = {
            title: 'T',
            header_content: [{ type: 'header', data: { site_title: 'S', show_title: true } }],
            footer_content: [{ type: 'footer', data: { content: 'F' } }],
        };
        const siteBefore = JSON.stringify(siteData);
        generateFullHTML(siteData, blocks, 'P');
        expect(blocks).toHaveLength(1);
        expect(JSON.stringify(siteData)).toBe(siteBefore);
    });

    describe('D-BLK-06: global-header і global-footer', () => {
        const HEADER = { site_title: 'Шапка', show_title: true, nav_items: [{ id: 'n1', label: 'Меню', link: '/menu' }] };
        const FOOTER = { copyright: '© Компанія', links: [{ id: 'l1', label: 'Умови', link: '/terms' }] };

        it('блоки global-header і global-footer із даними потрапляють в експорт', () => {
            const header = one('global-header', { site_title: 'Шапка', show_title: true, nav_items: [] });
            expect(header).toContain('<header');
            expect(header).toContain('>Шапка</span>');
            const footer = one('global-footer', { copyright: '© Компанія' });
            expect(footer).toContain('<footer');
            expect(footer).toContain('© Компанія');
        });

        it.each([
            ['масив блоків', { header_content: [{ type: 'header', data: HEADER }], footer_content: [{ type: 'footer', data: FOOTER }] }],
            ['об\'єкт-блок', { header_content: { type: 'global-header', data: HEADER }, footer_content: { type: 'global-footer', data: FOOTER } }],
            ['об\'єкт даних (так редактор зберігає налаштування)', { header_content: HEADER, footer_content: FOOTER }],
            ['рядок із JSON', { header_content: JSON.stringify(HEADER), footer_content: JSON.stringify(FOOTER) }],
        ])('блоки сторінки з порожнім data (так їх зберігає редактор) беруть дані сайту: %s', (_name, site) => {
            const body = render([{ type: 'global-header', data: {} }, { type: 'text', data: { content: 'Середина' } }, { type: 'global-footer', data: {} }], { title: 'T', ...site });
            expect(body.match(/<header/g)).toHaveLength(1);
            expect(body.match(/<footer/g)).toHaveLength(1);
            expect(body).toContain('>Шапка</span>');
            expect(body).toContain('href="menu.html"');
            expect(body).toContain('© Компанія');
            expect(body).toContain('href="terms.html"');
            expect(body.indexOf('Шапка')).toBeLessThan(body.indexOf('Середина'));
            expect(body.indexOf('Середина')).toBeLessThan(body.indexOf('© Компанія'));
        });

        it('шапка й підвал із налаштувань сайту додаються, якщо на сторінці їх немає, і мають глобальні типи', () => {
            const injected = render([], {
                title: 'T',
                header_content: [{ type: 'global-header', data: { site_title: 'Шапка', show_title: true } }],
                footer_content: [{ type: 'global-footer', data: { copyright: '© Компанія' } }],
            });
            expect(injected).toContain('>Шапка</span>');
            expect(injected).toContain('© Компанія');
        });

        it('старі імена header і footer у налаштуваннях сайту й на сторінці дають той самий результат', () => {
            const legacy = render([{ type: 'header', data: {} }, { type: 'footer', data: {} }], { title: 'T', header_content: HEADER, footer_content: FOOTER });
            const current = render([{ type: 'global-header', data: {} }, { type: 'global-footer', data: {} }], { title: 'T', header_content: HEADER, footer_content: FOOTER });
            expect(legacy).toBe(current);
        });

        it('порожній блок global-footer отримує дані за замовчуванням редактора (посилання й текст)', () => {
            const body = one('global-footer', {});
            expect(body).toContain('Назва компанії');
            expect(body).toContain('href="privacy.html"');
        });
    });
});

describe('transformLink (через посилання кнопок)', () => {
    const hrefOf = (link) => {
        const m = one('button', { text: 'B', link }).match(/<a href="([^"]*)"/);
        return m ? m[1] : null;
    };

    it.each([
        ['/', 'index.html'],
        ['about', 'about.html'],
        ['/about', 'about.html'],
        ['page/contacts', 'contacts.html'],
        ['/page/contacts', 'contacts.html'],
        ['/about?x=1', 'about.html'],
        ['/about.html', 'about.html'],
        ['https://example.com/a', 'https://example.com/a'],
        ['http://example.com', 'http://example.com'],
        ['mailto:a@b.c', 'mailto:a@b.c'],
        ['tel:+380501234567', 'tel:+380501234567'],
        ['#top', '#top'],
        ['  /about  ', 'about.html'],
    ])('%s -> %s', (link, expected) => {
        expect(hrefOf(link)).toBe(expected);
    });

    it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x'])(
        'небезпечна схема %s замінюється на "#"',
        (link) => {
            expect(hrefOf(link)).toBe('#');
        }
    );

    it('кнопка без посилання рендериться як <button>, а не <a>', () => {
        const html = one('button', { text: 'B' });
        expect(html).toContain('<button type="button"');
        expect(html).not.toContain('<a ');
    });

    it('особливість: будь-який рядок, що починається з "http", вважається зовнішнім посиланням', () => {
        expect(hrefOf('httpfoo')).toBe('httpfoo');
    });
});

describe('блоки: правила виводу', () => {
    describe('header', () => {
        const nav = [{ id: 'n1', label: 'Меню', link: '/menu' }];

        it('логотип: logo_src має пріоритет над logo_url; розмір: small 30, за замовчуванням 50, large 80', () => {
            expect(one('header', { logo_src: 'a.png', logo_url: 'b.png' })).toContain('src="a.png"');
            expect(one('header', { logo_url: 'b.png' })).toContain('src="b.png"');
            expect(one('header', { logo_src: 'a.png', logo_size: 'small' })).toContain('height: 30px');
            expect(one('header', { logo_src: 'a.png', logo_size: 'medium' })).toContain('height: 50px');
            expect(one('header', { logo_src: 'a.png', logo_size: 'large' })).toContain('height: 80px');
            expect(one('header', { logo_src: 'a.png', logo_radius: 8 })).toContain('border-radius: 8px');
            expect(one('header', { logo_src: 'a.png' })).toContain('border-radius: 0px');
        });

        it('без логотипа <img> немає', () => {
            expect(one('header', { show_title: true, site_title: 'S' })).not.toContain('<img');
        });

        it('назва сайту показується лише з show_title', () => {
            expect(one('header', { show_title: true, site_title: 'Назва' })).toContain('>Назва</span>');
            expect(one('header', { site_title: 'Назва' })).not.toContain('Назва');
        });

        it('без site_title у блоці сторінки береться назва з даних за замовчуванням редактора; сам рендерер підставляє "Site"', () => {
            expect(one('header', { show_title: true })).toContain('>Мій Сайт</span>');
            expect(getBlockHtmlRenderer('global-header')({ show_title: true })).toContain('>Site</span>');
        });

        it('пункти меню — посилання з transformLink; nav_style "button" малює їх як кнопки', () => {
            const text = one('header', { nav_items: nav });
            expect(text).toContain('<a href="menu.html" style="color: var(--site-text-primary); font-weight: 500;">Меню</a>');
            const asButtons = one('header', { nav_items: nav, nav_style: 'button' });
            expect(asButtons).toContain('<a href="menu.html" target="_self" style=" display: inline-flex;');
            expect(asButtons).toContain('<span>Меню</span>');
        });

        it('мобільна іконка меню завжди є і прихована inline-стилем', () => {
            const html = one('header', {});
            expect(html).toContain('class="mobile-menu-icon" style="display: none;"');
            expect(html).toContain('data-lucide="menu"');
        });
    });

    describe('hero', () => {
        it.each([
            ['small', '300px'], ['medium', '500px'], ['large', '700px'],
            ['full', 'calc(100vh - 60px)'], ['невідомо', '500px'], [undefined, '500px'],
        ])('висота %s -> min-height: %s', (height, css) => {
            expect(one('hero', { height })).toContain(`min-height: ${css}`);
        });

        it.each([
            ['left', 'flex-start'], ['center', 'center'], ['right', 'flex-end'], [undefined, 'center'],
        ])('вирівнювання %s -> justify-content: %s', (alignment, css) => {
            expect(one('hero', { alignment })).toContain(`justify-content: ${css}`);
        });

        it('фон: зображення або змінна теми; відео лише для bg_type "video"', () => {
            expect(one('hero', { bg_image: 'a.jpg' })).toContain("background: url('a.jpg') center/cover no-repeat");
            expect(one('hero', {})).toContain('background: var(--site-bg) center/cover no-repeat');
            expect(one('hero', { bg_type: 'video', bg_video: 'v.mp4' })).toContain('<video src="v.mp4" autoplay muted loop playsinline');
            expect(one('hero', { bg_video: 'v.mp4' })).not.toContain('<video');
        });

        it('накладка: колір за замовчуванням #000, прозорість за замовчуванням 0.5', () => {
            expect(one('hero', {})).toContain('background-color: #000; opacity: 0.5');
            expect(one('hero', { overlay_color: '#102030', overlay_opacity: 0.4 })).toContain('background-color: #102030; opacity: 0.4');
        });

        it('особливість: overlay_opacity = 0 підміняється значенням 0.5 (оператор ||)', () => {
            expect(one('hero', { overlay_opacity: 0 })).toContain('opacity: 0.5');
        });

        it('заголовок і підзаголовок виводяться лише якщо задані; кнопка — лише з button_text', () => {
            expect(one('hero', {})).not.toContain('<h1');
            expect(one('hero', {})).not.toContain('<p ');
            expect(one('hero', { title: 'Заголовок', subtitle: 'Опис' })).toContain('<h1');
            expect(one('hero', { title: 'Заголовок', subtitle: 'Опис' })).toContain('>Опис</p>');
            expect(one('hero', { button_text: 'Йти', button_link: '/shop' })).toContain('<a href="shop.html"');
            expect(one('hero', { button_link: '/shop' })).not.toContain('shop.html');
        });

        it('темний режим блока робить текст білим', () => {
            expect(one('hero', { theme_mode: 'dark' })).toContain('color: #fff;');
            expect(one('hero', {})).toContain('color: var(--site-text-primary);');
        });
    });

    describe('відступи (спільні для більшості блоків)', () => {
        it('за замовчуванням 40px зверху й знизу', () => {
            expect(one('text', { content: 'x' })).toContain('padding-top: 40px; padding-bottom: 40px;');
        });
        it('styles.paddingTop / paddingBottom мають пріоритет', () => {
            expect(one('text', { content: 'x', styles: { paddingTop: 10, paddingBottom: 0 } }))
                .toContain('padding-top: 10px; padding-bottom: 0px;');
        });
        it('застарілий рядок padding ("24px") читається через parseInt', () => {
            expect(one('text', { content: 'x', padding: '24px' })).toContain('padding-top: 24px; padding-bottom: 24px;');
        });
    });

    describe('layout', () => {
        it.each([
            ['50-50', undefined, '1fr 1fr'],
            ['33-33-33', undefined, '1fr 1fr 1fr'],
            ['25-75', undefined, '1fr 3fr'],
            ['75-25', undefined, '3fr 1fr'],
            ['25-25-25-25', undefined, '1fr 1fr 1fr 1fr'],
            ['невідомо', undefined, '1fr 1fr'],
            ['33-33-33', 'column', '1fr'],
        ])('пресет %s, напрям %s -> %s', (preset, direction, template) => {
            expect(one('layout', { preset, direction, columns: [] })).toContain(`grid-template-columns: ${template}`);
        });

        it('проміжок 20px за замовчуванням, вирівнювання middle -> center, інакше start', () => {
            expect(one('layout', { columns: [] })).toContain('gap: 20px; align-items: start;');
            expect(one('layout', { columns: [], gap: 8, verticalAlign: 'middle' })).toContain('gap: 8px; align-items: center;');
        });

        it('вкладені блоки рендеряться рекурсивно по колонках', () => {
            const html = one('layout', {
                columns: [
                    [{ type: 'text', data: { content: 'Ліво' } }],
                    [{ type: 'text', data: { content: 'Право' } }, { type: 'text', data: { content: 'Низ' } }],
                ],
            });
            expect(html.match(/display: flex; flex-direction: column; width: 100%;/g)).toHaveLength(2);
            expect(html.indexOf('Ліво')).toBeLessThan(html.indexOf('Право'));
            expect(html.indexOf('Право')).toBeLessThan(html.indexOf('Низ'));
        });

        it('фон: зображення, колір або без фону; накладка лише для image і video', () => {
            expect(one('layout', { columns: [], bg_image: 'a.jpg' })).toContain("background: url('a.jpg') center/cover no-repeat;");
            expect(one('layout', { columns: [], bg_type: 'color', bg_color: '#eee' })).toContain('background-color: #eee;');
            expect(one('layout', { columns: [], bg_type: 'color', bg_color: '#eee' })).not.toContain('pointer-events: none');
            expect(one('layout', { columns: [], bg_type: 'image', overlay_color: '#000', overlay_opacity: 0.3 }))
                .toContain('background-color: #000; opacity: 0.3; pointer-events: none;');
        });
    });

    describe('text', () => {
        it('тег: h1, h2, h3, інакше p; розмір і насиченість залежать від тега', () => {
            expect(one('text', { content: 'x', tag: 'h1' })).toContain('<h1 style="font-size: 2.5rem; font-weight: 800;');
            expect(one('text', { content: 'x', tag: 'h2' })).toContain('<h2 style="font-size: 2rem; font-weight: 700;');
            expect(one('text', { content: 'x', tag: 'h3' })).toContain('<h3 style="font-size: 1.5rem; font-weight: 600;');
            expect(one('text', { content: 'x', tag: 'h4' })).toContain('<p style="font-size: 1rem; font-weight: 400;');
            expect(one('text', { content: 'x' })).toContain('<p style="font-size: 1rem; font-weight: 400;');
        });

        it('особливість: поле style з редактора (значення за замовчуванням) експортом не читається, береться лише tag', () => {
            expect(one('text', { content: 'x', style: 'h1' })).toContain('<p style="font-size: 1rem;');
        });

        it('кожен рядок тексту — окремий тег, порожній рядок — &nbsp;', () => {
            const html = one('text', { content: 'a\n\nb' });
            expect(html.match(/<p style=/g)).toHaveLength(3);
            expect(html).toContain('&nbsp;');
        });

        it('жирний, курсив, підкреслення; вирівнювання за замовчуванням left', () => {
            const html = one('text', { content: 'x', isBold: true, isItalic: true, isUnderline: true, alignment: 'right' });
            expect(html).toContain('font-weight: bold; font-style: italic; text-decoration: underline;');
            expect(html).toContain('text-align: right;');
            expect(one('text', { content: 'x' })).toContain('text-align: left;');
        });
    });

    describe('image', () => {
        it('без зображень блок порожній', () => {
            expect(one('image', {})).toBe('');
            expect(one('image', { items: [] })).toBe('');
        });
        it('застаріле поле url трактується як одне зображення', () => {
            expect(one('image', { url: 'a.jpg' })).toContain('<img src="a.jpg"');
        });
        it('режим single показує лише перше зображення', () => {
            const html = one('image', { items: [{ src: 'a.jpg' }, { src: 'b.jpg' }] });
            expect(html).toContain('a.jpg');
            expect(html).not.toContain('b.jpg');
        });
        it('режим grid показує всі зображення в колонках settings_grid.columns (за замовчуванням 3)', () => {
            const items = [{ src: 'a.jpg' }, { src: 'b.jpg' }];
            expect(one('image', { mode: 'grid', items })).toContain('repeat(3, 1fr)');
            expect(one('image', { mode: 'grid', items, settings_grid: { columns: 2 } })).toContain('repeat(2, 1fr)');
            expect(one('image', { mode: 'grid', items })).toContain('b.jpg');
        });
        it('радіус: число -> px, рядок лишається як є, відсутній -> 0px; ширина full -> 100%', () => {
            expect(one('image', { url: 'a.jpg', borderRadius: '12' })).toContain('border-radius: 12px');
            expect(one('image', { url: 'a.jpg', borderRadius: '50%' })).toContain('border-radius: 50%');
            expect(one('image', { url: 'a.jpg' })).toContain('border-radius: 0px');
            expect(one('image', { url: 'a.jpg', width: 'full' })).toContain('max-width: 100%');
            expect(one('image', { url: 'a.jpg', width: 'medium' })).toContain('max-width: 800px');
        });
    });

    describe('button', () => {
        it.each([['left', 'flex-start'], ['right', 'flex-end'], ['center', 'center'], [undefined, 'center']])(
            'вирівнювання %s -> %s',
            (alignment, css) => {
                expect(one('button', { text: 'B', alignment })).toContain(`justify-content: ${css};`);
            }
        );

        it('основна кнопка: фон — акцент, текст білий; secondary — колір тексту сайту', () => {
            expect(one('button', { text: 'B' })).toContain('background: var(--site-accent); color: #ffffff; border: 2px solid transparent;');
            expect(one('button', { text: 'B', styleType: 'secondary' })).toContain('background: var(--site-text-primary); color: #ffffff;');
        });

        it('контурна кнопка: прозорий фон, рамка й текст кольору акценту або тексту', () => {
            expect(one('button', { text: 'B', variant: 'outline' }))
                .toContain('background: transparent; color: var(--site-accent); border: 2px solid var(--site-accent);');
            expect(one('button', { text: 'B', variant: 'outline', styleType: 'secondary' }))
                .toContain('background: transparent; color: var(--site-text-primary); border: 2px solid var(--site-text-primary);');
        });

        it('розміри: small, medium (за замовчуванням), large, невідомий -> medium', () => {
            expect(one('button', { text: 'B', size: 'small' })).toContain('padding: 8px 16px; font-size: 0.85rem;');
            expect(one('button', { text: 'B' })).toContain('padding: 12px 24px; font-size: 1rem;');
            expect(one('button', { text: 'B', size: 'large' })).toContain('padding: 16px 32px; font-size: 1.2rem;');
            expect(one('button', { text: 'B', size: 'x' })).toContain('padding: 12px 24px; font-size: 1rem;');
        });

        it('радіус і ширина; посилання з targetBlank відкривається в новій вкладці', () => {
            expect(one('button', { text: 'B', borderRadius: 10, width: 'full' })).toContain('border-radius: 10px; width: 100%;');
            expect(one('button', { text: 'B' })).toContain('border-radius: 4px; width: auto;');
            expect(one('button', { text: 'B', link: '/a', targetBlank: true })).toContain('target="_blank"');
            expect(one('button', { text: 'B', link: '/a' })).toContain('target="_self"');
        });

        it('іконка: ліворуч або праворуч (за замовчуванням праворуч), camelCase -> kebab-case, "none" -> без іконки', () => {
            const right = one('button', { text: 'B', icon: 'arrowRight' });
            expect(right.indexOf('<span>B</span>')).toBeLessThan(right.indexOf('data-lucide="arrow-right"'));
            const left = one('button', { text: 'B', icon: 'arrowRight', iconPosition: 'left' });
            expect(left.indexOf('data-lucide="arrow-right"')).toBeLessThan(left.indexOf('<span>B</span>'));
            expect(one('button', { text: 'B', icon: 'none' })).not.toContain('data-lucide');
        });

        it('текст за замовчуванням "Button"', () => {
            expect(one('button', {})).toContain('<span>Button</span>');
        });
    });

    describe('features', () => {
        const items = [{ icon: 'star', title: 'Т1', text: 'О1' }, { icon: 'zap', title: 'Т2', text: 'О2' }];

        it('заголовок необов\'язковий, колонок 3 за замовчуванням', () => {
            expect(one('features', { items })).not.toContain('<h2');
            expect(one('features', { items })).toContain('repeat(3, 1fr)');
            expect(one('features', { title: 'Переваги', columns: 2, items })).toContain('<h2');
            expect(one('features', { title: 'Переваги', columns: 2, items })).toContain('repeat(2, 1fr)');
        });

        it('layout "cards" малює картки з рамкою; інші макети — без рамки; list — рядком', () => {
            const cards = one('features', { layout: 'cards', items });
            expect(cards).toContain('padding: 24px; background: var(--site-card-bg); border: 1px solid var(--site-border-color);');
            const plain = one('features', { items });
            expect(plain).toContain('padding: 0; background: transparent; border: none;');
            expect(one('features', { layout: 'list', items })).toContain('flex-direction: row;');
        });

        it('кожна особливість: іконка, заголовок, текст', () => {
            const html = one('features', { items });
            expect(html).toContain('data-lucide="star"');
            expect(html).toContain('data-lucide="zap"');
            expect(html).toContain('>Т1</h4>');
            expect(html).toContain('>О2</p>');
        });

        it('особливість: без поля align у CSS потрапляє літерал "text-align: undefined"', () => {
            // Редактор не записує align у значення за замовчуванням, тому це стан кожного нового блока.
            expect(one('features', { items })).toContain('text-align: undefined;');
            expect(one('features', { items, align: 'center' })).toContain('text-align: center;');
        });
    });

    describe('accordion', () => {
        it('кожен пункт — <details> із заголовком у <summary> і вмістом', () => {
            const html = one('accordion', { items: [{ title: 'Питання', content: 'Відповідь' }] });
            expect(html).toContain('<details');
            expect(html).toContain('Питання');
            expect(html).toContain('Відповідь');
            expect(html).toContain('▼');
        });
        it('без пунктів блок містить лише порожній контейнер', () => {
            expect(one('accordion', {})).not.toContain('<details');
        });
    });

    describe('social_icons', () => {
        it('виводяться лише facebook, instagram, telegram, youtube; порожні пропускаються, tiktok ігнорується', () => {
            const html = one('social_icons', {
                facebook: 'https://fb.com/a', instagram: '', telegram: 'https://t.me/a', youtube: 'https://youtu.be/a', tiktok: 'https://tiktok.com/a',
            });
            expect(html).toContain('data-lucide="facebook"');
            expect(html).toContain('data-lucide="telegram"');
            expect(html).toContain('data-lucide="youtube"');
            expect(html).not.toContain('data-lucide="instagram"');
            expect(html).not.toContain('tiktok');
        });
        it('посилання відкриваються в новій вкладці й проходять transformLink', () => {
            const html = one('social_icons', { telegram: 't.me/a', facebook: 'javascript:alert(1)' });
            expect(html).toContain('href="t.me/a.html"');
            expect(html).toContain('href="#"');
            expect(html.match(/target="_blank"/g)).toHaveLength(2);
        });
        it('вирівнювання: center, right, інакше flex-start', () => {
            expect(one('social_icons', { alignment: 'center', facebook: 'https://a.b' })).toContain('justify-content: center;');
            expect(one('social_icons', { alignment: 'right', facebook: 'https://a.b' })).toContain('justify-content: flex-end;');
            expect(one('social_icons', { facebook: 'https://a.b' })).toContain('justify-content: flex-start;');
        });
    });

    describe('map', () => {
        const embed = (src) => `<iframe src="${src}" width="600"></iframe>`;

        it('приймає лише вбудовування Google Maps', () => {
            const ok = one('map', { embed_code: embed('https://www.google.com/maps/embed?pb=1') });
            expect(ok).toContain('<iframe src="https://www.google.com/maps/embed?pb=1" width="100%" height="450px"');
            expect(one('map', { embed_code: embed('http://googleusercontent.com/maps.google.com/x') })).toContain('<iframe');
        });
        it('інші джерела, порожній код і код без src дають порожній блок', () => {
            expect(one('map', { embed_code: embed('https://evil.example/embed') })).toBe('');
            expect(one('map', { embed_code: '' })).toBe('');
            expect(one('map', { embed_code: '<iframe></iframe>' })).toBe('');
            expect(one('map', {})).toBe('');
        });
        it('висота: small 300px, medium 450px (за замовчуванням), large 600px', () => {
            const e = embed('https://www.google.com/maps/embed?pb=1');
            expect(one('map', { embed_code: e, sizePreset: 'small' })).toContain('height="300px"');
            expect(one('map', { embed_code: e })).toContain('height="450px"');
            expect(one('map', { embed_code: e, sizePreset: 'large' })).toContain('height="600px"');
        });
    });

    describe('form', () => {
        it('статична розмітка без дії: два поля, повідомлення й кнопка', () => {
            const html = one('form', {});
            expect(html).toContain('placeholder="Ваше ім\'я"');
            expect(html).toContain('type="email"');
            expect(html).toContain('<textarea');
            expect(html).not.toContain('action=');
            expect(html).toContain('<span>Надіслати</span>');
        });
        it('текст кнопки з buttonText; налаштування data.button накладаються на кнопку', () => {
            const html = one('form', { buttonText: 'Написати', button: { text: 'З налаштувань', alignment: 'right' } });
            expect(html).toContain('<span>З налаштувань</span>');
            expect(html).toContain('text-align: right');
            expect(one('form', { buttonText: 'Написати' })).toContain('<span>Написати</span>');
        });
    });

    describe('catalog і showcase', () => {
        it('замість товарів малюються заглушки; кількість — items_per_page (за замовчуванням 4)', () => {
            expect(one('catalog', {}).match(/height: 250px; background: #eee;/g)).toHaveLength(4);
            expect(one('showcase', { items_per_page: 2 }).match(/height: 250px; background: #eee;/g)).toHaveLength(2);
        });
        it('особливість: поле limit, яке записує редактор для вітрини, експортом не читається', () => {
            expect(one('showcase', { limit: 8 }).match(/height: 250px; background: #eee;/g)).toHaveLength(4);
        });
        it('лише каталог має підпис про залежність від backend', () => {
            expect(one('catalog', {})).toContain('Dynamic catalog requires backend connection.');
            expect(one('showcase', {})).not.toContain('Dynamic catalog requires backend connection.');
        });
        it('колонки: 3 за замовчуванням; заголовок необов\'язковий', () => {
            expect(one('catalog', {})).toContain('repeat(3, 1fr)');
            expect(one('catalog', { columns: 2, title: 'Товари' })).toContain('repeat(2, 1fr)');
            expect(one('catalog', { columns: 2, title: 'Товари' })).toContain('>Товари</h2>');
            expect(one('catalog', {})).not.toContain('<h2');
        });
    });

    describe('video', () => {
        it('показує <video controls>, якщо задано url; інакше порожній чорний контейнер', () => {
            expect(one('video', { url: 'v.mp4' })).toContain('<video src="v.mp4" controls');
            expect(one('video', {})).not.toContain('<video');
            expect(one('video', {})).toContain('background: #000;');
        });
        it('висота береться з height (small/medium/large/auto), а не з sizePreset, який записує редактор', () => {
            expect(one('video', { url: 'v.mp4', height: 'small' })).toContain('height: 300px;');
            expect(one('video', { url: 'v.mp4', sizePreset: 'large' })).toContain('height: auto;');
            expect(one('video', { url: 'v.mp4' })).toContain('height: auto;');
        });
    });

    describe('footer', () => {
        it('власний текст екранується й виводиться як є', () => {
            expect(one('footer', { content: '© 2026 Компанія' })).toContain('© 2026 Компанія');
        });
        it('copyright (поле редактора) має пріоритет над content', () => {
            const html = one('global-footer', { copyright: '© Нова', content: '© Стара' });
            expect(html).toContain('© Нова');
            expect(html).not.toContain('© Стара');
        });
        it('порожній блок footer на сторінці отримує дані за замовчуванням редактора', () => {
            expect(one('footer', {})).toContain('Назва компанії');
        });
        it('рендерер без тексту підставляє поточний рік і "All rights reserved."', () => {
            const year = new Date().getFullYear();
            expect(getBlockHtmlRenderer('global-footer')({})).toContain(`© ${year} All rights reserved.`);
        });
        it('посилання підвалу проходять transformLink, пункти без назви пропускаються', () => {
            const html = one('global-footer', {
                copyright: 'К',
                links: [
                    { label: 'Контакти', link: '/contact' },
                    { label: 'Умови', link: 'https://example.com/a?x=1&y=2' },
                    { label: 'Небезпечне', link: 'javascript:alert(1)' },
                    { label: '', link: '/hidden' },
                    null,
                ],
            });
            expect(html).toContain('<a href="contact.html" style="color: var(--site-text-secondary);">Контакти</a>');
            expect(html).toContain('href="https://example.com/a?x=1&amp;y=2"');
            expect(html).toContain('<a href="#" style="color: var(--site-text-secondary);">Небезпечне</a>');
            expect(html).not.toContain('/hidden');
            expect(html).not.toContain('javascript:');
        });
        it('без links навігація не виводиться', () => {
            expect(one('global-footer', { copyright: 'К' })).not.toContain('<nav');
        });
    });
});

describe('екранування значень', () => {
    it('лапки екрануються: " -> &quot;, \' -> &#39;', () => {
        const html = one('text', { content: 'Він сказав "привіт" і \'бувай\'' });
        expect(html).toContain('Він сказав &quot;привіт&quot; і &#39;бувай&#39;');
    });

    it('D-SEC-27: символи <, > і & у тексті екрануються', () => {
        const html = one('text', { content: '<script>alert(1)</script> & <b>x</b>' });
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>');
    });

    it('D-SEC-27: розмітка в назві сайту й сторінки не виходить за межі <title>', () => {
        const html = generateFullHTML({ title: 'A</title><script>x()</script>' }, [], 'P<b>');
        expect(html).toContain('<title>P&lt;b&gt; - A&lt;/title&gt;&lt;script&gt;x()&lt;/script&gt;</title>');
        expect(html).not.toContain('<script>x()');
    });

    it('D-SEC-27: розмітка в описі й адресі іконки екранується', () => {
        const html = generateFullHTML({ seo_description: 'a" onload="x', favicon_url: 'f.png" onerror="x' }, [], 'P');
        expect(html).toContain('<meta name="description" content="a&quot; onload=&quot;x">');
        expect(html).toContain('href="f.png&quot; onerror=&quot;x"');
    });

    it('D-SEC-27: лапка в посиланні не виходить за межі атрибута href', () => {
        const html = one('button', { text: 'B', link: 'https://example.com/" onmouseover="alert(1)' });
        expect(html).toContain('<a href="https://example.com/&quot; onmouseover=&quot;alert(1)"');
        expect(html).not.toContain('" onmouseover=');
    });

    it('D-SEC-27: посилання з & у запиті записується як &amp; і лишається робочим', () => {
        expect(one('button', { text: 'B', link: 'https://example.com/?a=1&b=2' })).toContain('href="https://example.com/?a=1&amp;b=2"');
    });

    it('D-SEC-27: посилання пунктів меню й соцмереж теж екрануються', () => {
        const header = one('global-header', { nav_items: [{ label: 'M', link: 'https://e.com/" x="y' }] });
        expect(header).toContain('href="https://e.com/&quot; x=&quot;y"');
        const social = one('social_icons', { facebook: 'https://e.com/" x="y' });
        expect(social).toContain('href="https://e.com/&quot; x=&quot;y"');
    });

    it('D-SEC-27: текст кнопки, заголовки, переваги й акордеон екрануються', () => {
        const evil = '<img src=x onerror=alert(1)>';
        expect(one('button', { text: evil, link: '/a' })).not.toContain('<img');
        expect(one('hero', { title: evil, subtitle: evil })).not.toContain('<img');
        expect(one('features', { title: evil, items: [{ title: evil, text: evil, icon: 'star' }] })).not.toContain('<img');
        expect(one('accordion', { items: [{ title: evil, content: evil }] })).not.toContain('<img');
        expect(one('global-header', { site_title: evil, show_title: true, nav_items: [{ label: evil, link: '/a' }] })).not.toContain('<img');
    });

    describe('D-SEC-27: числові значення в style не закривають атрибут', () => {
        const INJECT = '1;" onmouseover="alert(1)';

        it.each([
            ['hero', { overlay_opacity: INJECT }],
            ['layout', { columns: [], gap: INJECT, bg_type: 'image', overlay_opacity: INJECT }],
            ['layout', { columns: [], overlay_opacity: INJECT, bg_type: 'image' }],
            ['image', { mode: 'grid', items: [{ src: 'a.jpg' }], settings_grid: { columns: INJECT } }],
            ['features', { columns: INJECT, items: [] }],
            ['catalog', { columns: INJECT }],
            ['showcase', { columns: INJECT }],
            ['global-header', { logo_src: 'a.png', logo_radius: INJECT }],
            ['button', { text: 'B', link: '/a', borderRadius: INJECT }],
            ['text', { content: 'x', styles: { paddingTop: INJECT, paddingBottom: INJECT } }],
            ['text', { content: 'x', padding: INJECT }],
        ])('%s: %j', (type, data) => {
            expect(one(type, data)).not.toContain('onmouseover');
        });

        it('допустимі числа (число або рядок із числом) зберігаються', () => {
            expect(one('hero', { overlay_opacity: '0.3' })).toContain('opacity: 0.3');
            expect(one('layout', { columns: [], gap: '12' })).toContain('gap: 12px');
            expect(one('button', { text: 'B', borderRadius: '10' })).toContain('border-radius: 10px');
        });

        it('недопустиме значення замінюється значенням за замовчуванням', () => {
            expect(one('hero', { overlay_opacity: 'abc' })).toContain('opacity: 0.5');
            expect(one('layout', { columns: [], gap: 'abc' })).toContain('gap: 20px');
            expect(one('features', { columns: 'abc', items: [] })).toContain('repeat(3, 1fr)');
            expect(one('text', { content: 'x', padding: 'abc' })).toContain('padding-top: 40px; padding-bottom: 40px;');
        });
    });
});

describe('золоті файли', () => {
    it('порожня сторінка', () => {
        expectGolden(generateFullHTML({ title: 'Мій сайт' }, [], 'Головна'), 'export/minimal.html');
    });

    it('сайт з усіма типами блоків, глобальними хедером і футером', () => {
        expectGolden(generateFullHTML(exportSiteData, exportPageBlocks, 'Головна'), 'export/all-blocks.html');
    });
});
