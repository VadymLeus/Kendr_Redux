// Характеризаційні тести v0: відповідність типу блока компоненту в BlockRenderer.
// Це «перше з шести місць» опису блока (D-BLK-01). Після переходу на реєстр (v1.0) таблиця
// «тип -> компонент» береться з дескрипторів, а ці тести мають лишитися зеленими без змін.
// Компоненти блоків замінено заглушками, тому перевіряється лише вибір компонента, передача props і обгортки.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BlockRenderer from '../../src/modules/editor/core/BlockRenderer';
import { rendered, resetRendered } from '../helpers/stubs';

vi.mock('../../src/modules/editor/blocks/Hero/HeroBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('hero') }));
vi.mock('../../src/modules/editor/blocks/Text/TextBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('text') }));
vi.mock('../../src/modules/editor/blocks/ShowCase/ShowCaseBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('showcase') }));
vi.mock('../../src/modules/editor/blocks/Catalog/CatalogBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('catalog') }));
vi.mock('../../src/modules/editor/blocks/Features/FeaturesBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('features') }));
vi.mock('../../src/modules/editor/blocks/Layout/LayoutBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('layout') }));
vi.mock('../../src/modules/editor/blocks/Image/ImageBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('image') }));
vi.mock('../../src/modules/editor/blocks/Button/ButtonBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('button') }));
vi.mock('../../src/modules/editor/blocks/Form/FormBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('form') }));
vi.mock('../../src/modules/editor/blocks/Video/VideoBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('video') }));
vi.mock('../../src/modules/editor/blocks/Map/MapBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('map') }));
vi.mock('../../src/modules/editor/blocks/Accordion/AccordionBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('accordion') }));
vi.mock('../../src/modules/editor/blocks/SocialIcons/SocialIconsBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('social_icons') }));
vi.mock('../../src/modules/editor/blocks/Header/HeaderBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('header') }));
vi.mock('../../src/modules/editor/blocks/Footer/FooterBlock', async () => ({ default: (await import('../helpers/stubs')).makeBlockStub('footer') }));
vi.mock('../../src/modules/renderer/components/AnimationWrapper', async () => ({ default: (await import('../helpers/stubs')).AnimationStub }));

const renderBlocks = (blocks, props = {}) =>
    render(
        <MemoryRouter>
            <BlockRenderer blocks={blocks} {...props} />
        </MemoryRouter>
    );

const block = (type, data = {}, id = `id-${type}`) => ({ type, block_id: id, data });
const propsOf = (name) => rendered.filter((r) => r.name === name).at(-1)?.props;

describe('BlockRenderer: вибір компонента за типом блока', () => {
    beforeEach(() => {
        resetRendered();
    });

    // 15 типів із каталогу + псевдонім header
    it.each([
        ['hero', 'hero'],
        ['text', 'text'],
        ['showcase', 'showcase'],
        ['catalog', 'catalog'],
        ['features', 'features'],
        ['layout', 'layout'],
        ['image', 'image'],
        ['button', 'button'],
        ['form', 'form'],
        ['video', 'video'],
        ['map', 'map'],
        ['accordion', 'accordion'],
        ['social_icons', 'social_icons'],
        ['global-header', 'header'],
        ['global-footer', 'footer'],
        ['header', 'header'],
    ])('тип "%s" рендериться компонентом "%s"', async (type, stub) => {
        renderBlocks([block(type)]);
        expect(await screen.findByTestId(`block-${stub}`)).toBeInTheDocument();
    });

    it('особливість: псевдонім "footer" у BlockRenderer не зареєстровано (панель налаштувань його знає)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderBlocks([block('footer')]);
        expect(await screen.findByText('Невідомий тип блоку')).toBeInTheDocument();
        warn.mockRestore();
    });

    it('невідомий тип показує повідомлення з назвою типу й попередження в консолі', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderBlocks([block('wat')]);
        expect(screen.getByText('Невідомий тип блоку')).toBeInTheDocument();
        expect(screen.getByText('wat')).toBeInTheDocument();
        expect(warn).toHaveBeenCalledWith('Невідомий тип блоку: wat');
        warn.mockRestore();
    });

    it('блоки відображаються в порядку масиву', async () => {
        renderBlocks([block('text', { __label: 'перший' }), block('hero', { __label: 'другий' }), block('button', { __label: 'третій' })]);
        await screen.findByTestId('block-button');
        const order = screen.getAllByTestId(/^block-/).map((el) => el.getAttribute('data-testid'));
        expect(order).toEqual(['block-text', 'block-hero', 'block-button']);
    });
});

describe('BlockRenderer: передача props у компонент блока', () => {
    beforeEach(() => {
        resetRendered();
    });

    it('передає blockData, siteData, isEditorPreview, block, style і додаткові props', async () => {
        const data = { __label: 'x', styles: { paddingTop: 10, paddingBottom: 25 } };
        const siteData = { title: 'Магазин', site_path: 'shop' };
        const b = block('text', data);
        renderBlocks([b], { siteData, isEditorPreview: true, customProp: 'extra' });
        await screen.findByTestId('block-text');
        const props = propsOf('text');
        expect(props.blockData).toEqual(data);
        expect(props.siteData).toEqual(siteData);
        expect(props.isEditorPreview).toBe(true);
        expect(props.block).toEqual(b);
        expect(props.customProp).toBe('extra');
        expect(props.style).toEqual({ paddingTop: '10px', paddingBottom: '25px' });
        expect(typeof props.onMenuToggle).toBe('function');
    });

    it('відступи за замовчуванням — 60px', async () => {
        renderBlocks([block('text')]);
        await screen.findByTestId('block-text');
        expect(propsOf('text').style).toEqual({ paddingTop: '60px', paddingBottom: '60px' });
    });

    it('особливість: нульовий відступ підміняється на 60px (значення 0 хибне)', async () => {
        renderBlocks([block('text', { styles: { paddingTop: 0, paddingBottom: 0 } })]);
        await screen.findByTestId('block-text');
        expect(propsOf('text').style).toEqual({ paddingTop: '60px', paddingBottom: '60px' });
    });

    it('isEditorPreview за замовчуванням false', async () => {
        renderBlocks([block('text')]);
        await screen.findByTestId('block-text');
        expect(propsOf('text').isEditorPreview).toBe(false);
    });
});

describe('BlockRenderer: обгортки', () => {
    beforeEach(() => {
        resetRendered();
    });

    it('anchorId стає id обгортки блока', async () => {
        renderBlocks([block('text', { anchorId: 'about-us' })]);
        const el = await screen.findByTestId('block-text');
        expect(el.closest('#about-us')).not.toBeNull();
    });

    it('звичайні блоки обгортаються в AnimationWrapper з конфігурацією анімації блока', async () => {
        const animation = { type: 'fadeUp', duration: 0.8 };
        renderBlocks([block('text', { animation })]);
        const el = await screen.findByTestId('block-text');
        const wrapper = el.closest('[data-testid="animation"]');
        expect(wrapper).not.toBeNull();
        expect(JSON.parse(wrapper.getAttribute('data-config'))).toEqual(animation);
    });

    it('шапка (global-header і header) не обгортається в AnimationWrapper', async () => {
        renderBlocks([block('global-header', { animation: { type: 'fadeUp' } }), block('header', {}, 'h2')]);
        const headers = await screen.findAllByTestId('block-header');
        headers.forEach((el) => expect(el.closest('[data-testid="animation"]')).toBeNull());
    });

    it('шапка з is_sticky липне до верху лише поза режимом редактора', async () => {
        const { unmount } = renderBlocks([block('global-header', { is_sticky: true })]);
        let el = await screen.findByTestId('block-header');
        expect(el.parentElement.className).toContain('sticky');
        unmount();

        renderBlocks([block('global-header', { is_sticky: true })], { isEditorPreview: true });
        el = await screen.findByTestId('block-header');
        expect(el.parentElement.className).not.toContain('sticky');
    });

    it('інші блоки з is_sticky не липнуть', async () => {
        renderBlocks([block('text', { is_sticky: true })]);
        const el = await screen.findByTestId('block-text');
        expect(el.closest('div.w-full').className).not.toContain('sticky');
    });
});

describe('BlockRenderer: порожній стан', () => {
    it.each([[undefined], [null], [[]]])('blocks = %j показує повідомлення «Ця сторінка порожня»', (blocks) => {
        renderBlocks(blocks);
        expect(screen.getByText('Ця сторінка порожня')).toBeInTheDocument();
        expect(screen.getByText('Додайте блоки для створення контенту')).toBeInTheDocument();
    });

    it('тексти можна перевизначити', () => {
        renderBlocks([], { emptyTitle: 'Немає блоків', emptyDescription: 'Перетягніть блок' });
        expect(screen.getByText('Немає блоків')).toBeInTheDocument();
        expect(screen.getByText('Перетягніть блок')).toBeInTheDocument();
    });

    it('колонка макета має компактний вигляд', () => {
        const { container } = renderBlocks([], { isLayoutColumn: true });
        expect(container.firstChild.className).toContain('min-h-30');
        expect(container.firstChild.className).not.toContain('min-h-[60vh]');
    });

    it('сторінка має повновисотний вигляд', () => {
        const { container } = renderBlocks([]);
        expect(container.firstChild.className).toContain('min-h-[60vh]');
    });
});

describe('BlockRenderer: мобільне меню', () => {
    const siteData = { site_path: 'shop' };
    const header = (items) => block('global-header', { nav_items: items });
    const nav = [
        { id: '1', label: 'Головна', link: '/' },
        { id: '2', label: 'Контакти', link: '/contacts' },
    ];

    afterEach(() => {
        resetRendered();
    });

    it('меню закрите, доки шапка не викличе onMenuToggle', async () => {
        renderBlocks([header(nav)], { siteData });
        await screen.findByTestId('block-header');
        expect(screen.queryByText('Контакти')).toBeNull();
    });

    it('відкривається і показує пункти меню першої шапки з посиланнями на сторінки сайту', async () => {
        renderBlocks([header(nav)], { siteData });
        fireEvent.click(await screen.findByTestId('toggle-header'));
        expect(screen.getByRole('link', { name: 'Головна' })).toHaveAttribute('href', '/site/shop');
        expect(screen.getByRole('link', { name: 'Контакти' })).toHaveAttribute('href', '/site/shop/contacts');
    });

    it('без пунктів показує «Меню порожнє»', async () => {
        renderBlocks([header([])], { siteData });
        fireEvent.click(await screen.findByTestId('toggle-header'));
        expect(screen.getByText('Меню порожнє')).toBeInTheDocument();
    });

    it('клік по пункту закриває меню', async () => {
        renderBlocks([header(nav)], { siteData });
        fireEvent.click(await screen.findByTestId('toggle-header'));
        fireEvent.click(screen.getByRole('link', { name: 'Контакти' }));
        expect(screen.queryByRole('link', { name: 'Контакти' })).toBeNull();
    });

    it('клік по затемненню закриває меню', async () => {
        const { container } = renderBlocks([header(nav)], { siteData });
        fireEvent.click(await screen.findByTestId('toggle-header'));
        const overlay = container.querySelector('.fixed.inset-0 > .absolute.inset-0');
        fireEvent.click(overlay);
        expect(screen.queryByText('Меню порожнє')).toBeNull();
        expect(screen.queryByRole('link', { name: 'Контакти' })).toBeNull();
    });

    it('у режимі редактора меню не відкривається', async () => {
        renderBlocks([header(nav)], { siteData, isEditorPreview: true });
        fireEvent.click(await screen.findByTestId('toggle-header'));
        expect(screen.queryByRole('link', { name: 'Контакти' })).toBeNull();
    });
});
