// D-SEC-11: посилання підвалу проходять resolveSiteLink, як у кнопках, зображеннях і шапці.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FooterBlock from '../../src/modules/editor/blocks/Footer/FooterBlock';

vi.mock('../../src/shared/config', () => ({ BASE_URL: 'http://api.test' }));
vi.mock('../../src/shared/hooks/useBlockFonts', () => ({
    useBlockFonts: () => ({ styles: {}, RenderFonts: () => null, cssVariables: {} }),
}));

const site = { site_path: 'shop' };
const hrefOf = (label) => screen.getByText(label).closest('a').getAttribute('href');

describe('FooterBlock: посилання', () => {
    const renderFooter = (data, siteData = site) => render(<FooterBlock blockData={data} siteData={siteData} />);

    it('відносне посилання отримує префікс сайту, абсолютне лишається', () => {
        renderFooter({
            links: [
                { id: '1', label: 'Політика', link: '/privacy' },
                { id: '2', label: 'Контакти', link: 'contact' },
                { id: '3', label: 'Головна', link: '/' },
                { id: '4', label: 'Зовнішнє', link: 'https://example.com/a' },
                { id: '5', label: 'Пошта', link: 'mailto:a@b.c' },
                { id: '6', label: 'Якір', link: '#top' },
            ],
        });
        expect(hrefOf('Політика')).toBe('/site/shop/privacy');
        expect(hrefOf('Контакти')).toBe('/site/shop/contact');
        expect(hrefOf('Головна')).toBe('/site/shop');
        expect(hrefOf('Зовнішнє')).toBe('https://example.com/a');
        expect(hrefOf('Пошта')).toBe('mailto:a@b.c');
        expect(hrefOf('Якір')).toBe('#top');
    });

    it.each([['javascript:alert(1)'], ['  JavaScript:alert(1)'], ['data:text/html,<b>x</b>'], ['vbscript:x']])('небезпечне посилання %j замінюється на #', (link) => {
        renderFooter({ links: [{ id: '1', label: 'Небезпечне', link }] });
        expect(hrefOf('Небезпечне')).toBe('#');
    });

    it('порожнє посилання дає #', () => {
        renderFooter({ links: [{ id: '1', label: 'Порожнє', link: '' }, { id: '2', label: 'Без поля' }] });
        expect(hrefOf('Порожнє')).toBe('#');
        expect(hrefOf('Без поля')).toBe('#');
    });

    it('соцмережі: небезпечне посилання замінюється на #, звичайне лишається', () => {
        renderFooter({
            socials: [
                { id: '1', platform: 'facebook', link: 'javascript:alert(1)' },
                { id: '2', platform: 'instagram', link: 'https://instagram.com/shop' },
                { id: '3', platform: 'telegram', link: '' },
            ],
        });
        expect(screen.getByTitle('facebook')).toHaveAttribute('href', '#');
        expect(screen.getByTitle('instagram')).toHaveAttribute('href', 'https://instagram.com/shop');
        expect(screen.getByTitle('telegram')).toHaveAttribute('href', '#');
    });

    it('варіант simple посилань не показує', () => {
        renderFooter({ variant: 'simple', copyright: 'К', links: [{ id: '1', label: 'Політика', link: '/privacy' }] });
        expect(screen.queryByText('Політика')).toBeNull();
    });
});
