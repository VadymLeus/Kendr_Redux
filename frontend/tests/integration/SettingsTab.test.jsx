// Характеризаційні тести v0: відповідність типу блока панелі налаштувань у SettingsTab.
// Це «четверте з шести місць» опису блока (D-BLK-01). У v1.0 карта «тип -> панель» береться з реєстру.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsTab from '../../src/modules/editor/ui/tabs/SettingsTab';

vi.mock('../../src/modules/editor/blocks/ShowCase/ShowCaseSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('showcase') }));
vi.mock('../../src/modules/editor/blocks/Features/FeaturesSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('features') }));
vi.mock('../../src/modules/editor/blocks/Catalog/CatalogSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('catalog') }));
vi.mock('../../src/modules/editor/blocks/Text/TextSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('text') }));
vi.mock('../../src/modules/editor/blocks/Hero/HeroSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('hero') }));
vi.mock('../../src/modules/editor/blocks/Image/ImageSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('image') }));
vi.mock('../../src/modules/editor/blocks/Button/ButtonSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('button') }));
vi.mock('../../src/modules/editor/blocks/Form/FormSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('form') }));
vi.mock('../../src/modules/editor/blocks/Layout/LayoutSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('layout') }));
vi.mock('../../src/modules/editor/blocks/Video/VideoSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('video') }));
vi.mock('../../src/modules/editor/blocks/Map/MapSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('map') }));
vi.mock('../../src/modules/editor/blocks/Accordion/AccordionSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('accordion') }));
vi.mock('../../src/modules/editor/blocks/SocialIcons/SocialIconsSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('social_icons') }));
vi.mock('../../src/modules/editor/blocks/Header/HeaderSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('header') }));
vi.mock('../../src/modules/editor/blocks/Footer/FooterSettings', async () => ({ default: (await import('../helpers/stubs')).makeSettingsStub('footer') }));
vi.mock('../../src/modules/editor/ui/tabs/AdvancedSettingsTab', async () => ({ default: (await import('../helpers/stubs')).AdvancedStub }));

const block = (type, data = { value: type }) => ({ type, block_id: `id-${type}`, data });

const renderTab = (blocks, selectedBlockPath, extra = {}) => {
    const onUpdateBlockData = vi.fn();
    const utils = render(
        <SettingsTab
            blocks={blocks}
            selectedBlockPath={selectedBlockPath}
            onUpdateBlockData={onUpdateBlockData}
            siteData={{ title: 'Магазин' }}
            {...extra}
        />
    );
    return { ...utils, onUpdateBlockData };
};

describe('SettingsTab: вибір панелі налаштувань за типом блока', () => {
    // 15 типів із каталогу + псевдоніми header і footer
    it.each([
        ['hero', 'hero'],
        ['text', 'text'],
        ['image', 'image'],
        ['button', 'button'],
        ['showcase', 'showcase'],
        ['layout', 'layout'],
        ['catalog', 'catalog'],
        ['features', 'features'],
        ['form', 'form'],
        ['video', 'video'],
        ['map', 'map'],
        ['accordion', 'accordion'],
        ['social_icons', 'social_icons'],
        ['global-header', 'header'],
        ['global-footer', 'footer'],
        ['header', 'header'],
        ['footer', 'footer'],
    ])('тип "%s" відкриває панель "%s"', (type, panel) => {
        renderTab([block(type)], [0]);
        expect(screen.getByTestId(`settings-${panel}`)).toBeInTheDocument();
    });

    it('панель отримує data блока й siteData', () => {
        renderTab([block('hero', { title: 'Привіт' })], [0]);
        expect(screen.getByTestId('settings-data')).toHaveTextContent('{"title":"Привіт"}');
        expect(screen.getByTestId('settings-hero')).toHaveAttribute('data-site-title', 'Магазин');
    });

    it('невідомий тип показує «в розробці» з назвою типу', () => {
        renderTab([block('wat')], [0]);
        expect(screen.getByText(/в розробці/)).toBeInTheDocument();
        // тип показано двічі: у заголовку панелі й у повідомленні
        expect(screen.getAllByText('wat')).toHaveLength(2);
        expect(screen.getByText('wat', { selector: 'b' })).toBeInTheDocument();
    });

    it('працює для блока, вкладеного в колонку макета', () => {
        const blocks = [{ type: 'layout', data: { columns: [[block('text', { value: 'вкладений' })]] } }];
        renderTab(blocks, [0, 'data', 'columns', 0, 0]);
        expect(screen.getByTestId('settings-text')).toBeInTheDocument();
        expect(screen.getByTestId('settings-data')).toHaveTextContent('вкладений');
    });
});

describe('SettingsTab: без вибраного блока', () => {
    it('показує підказку, якщо шлях не заданий', () => {
        renderTab([block('hero')], null);
        expect(screen.getByText('Налаштування блоку')).toBeInTheDocument();
        expect(screen.queryByTestId('settings-hero')).toBeNull();
    });

    it('показує підказку, якщо за шляхом немає блока', () => {
        renderTab([block('hero')], [5]);
        expect(screen.getByText('Налаштування блоку')).toBeInTheDocument();
    });
});

describe('SettingsTab: заголовок і вкладки', () => {
    it('заголовок: власна назва блока, інакше тип; "global-" замінюється на "Глобальний "', () => {
        const { unmount } = renderTab([{ ...block('hero'), name: 'Моя обкладинка' }], [0]);
        expect(screen.getByText('Моя обкладинка')).toBeInTheDocument();
        unmount();
        renderTab([block('global-header')], [0]);
        expect(screen.getByText('Глобальний header')).toBeInTheDocument();
    });

    it('звичайний блок має вкладки «Контент» і «Вигляд»', () => {
        renderTab([block('text')], [0]);
        expect(screen.getByRole('button', { name: /Контент/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Вигляд/ })).toBeInTheDocument();
    });

    it.each(['global-header', 'global-footer', 'header', 'footer'])('глобальний блок "%s" має лише вкладку «Контент»', (type) => {
        renderTab([block(type)], [0]);
        expect(screen.getByRole('button', { name: /Контент/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Вигляд/ })).toBeNull();
    });

    it('вкладка «Вигляд» показує додаткові налаштування з data блока', () => {
        renderTab([block('text', { value: 'abc' })], [0]);
        fireEvent.click(screen.getByRole('button', { name: /Вигляд/ }));
        expect(screen.getByTestId('advanced-tab')).toBeInTheDocument();
        expect(screen.getByTestId('advanced-data')).toHaveTextContent('{"value":"abc"}');
        expect(screen.queryByTestId('settings-text')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Контент/ }));
        expect(screen.getByTestId('settings-text')).toBeInTheDocument();
    });

    it('при виборі глобального блока відкрита вкладка «Вигляд» повертається на «Контент»', () => {
        const blocks = [block('text'), block('global-header')];
        const onUpdateBlockData = vi.fn();
        const { rerender } = render(
            <SettingsTab blocks={blocks} selectedBlockPath={[0]} onUpdateBlockData={onUpdateBlockData} siteData={{}} />
        );
        fireEvent.click(screen.getByRole('button', { name: /Вигляд/ }));
        expect(screen.getByTestId('advanced-tab')).toBeInTheDocument();
        rerender(<SettingsTab blocks={blocks} selectedBlockPath={[1]} onUpdateBlockData={onUpdateBlockData} siteData={{}} />);
        expect(screen.queryByTestId('advanced-tab')).toBeNull();
        expect(screen.getByTestId('settings-header')).toBeInTheDocument();
    });
});

describe('SettingsTab: збереження змін', () => {
    it('зміна в панелі контенту передається з шляхом блока й записом в історію за замовчуванням', () => {
        const { onUpdateBlockData } = renderTab([block('hero')], [0]);
        fireEvent.click(screen.getByTestId('settings-apply'));
        expect(onUpdateBlockData).toHaveBeenCalledWith([0], { changedBy: 'hero' }, true);
    });

    it('зміна без запису в історію (другий аргумент false) передається далі', () => {
        const { onUpdateBlockData } = renderTab([block('hero')], [0]);
        fireEvent.click(screen.getByTestId('settings-apply-silent'));
        expect(onUpdateBlockData).toHaveBeenCalledWith([0], { changedBy: 'hero' }, false);
    });

    it('зміна у вкладці «Вигляд» іде тим самим шляхом, із записом в історію', () => {
        const { onUpdateBlockData } = renderTab([block('text')], [0]);
        fireEvent.click(screen.getByRole('button', { name: /Вигляд/ }));
        fireEvent.click(screen.getByTestId('advanced-apply'));
        expect(onUpdateBlockData).toHaveBeenCalledWith([0], { advanced: true }, true);
    });
});
