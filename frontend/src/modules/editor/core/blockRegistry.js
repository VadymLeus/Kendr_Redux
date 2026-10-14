// frontend/src/modules/editor/core/blockRegistry.js
import React, { lazy } from 'react';
import { Image, FileText, MousePointerClick, Star, Grid, ShoppingBag, List, Mail, Video, MapPin, HelpCircle, Share2, Globe } from 'lucide-react';
import { generateBlockId } from './blockId';
import { LEGACY_TYPE_ALIASES } from './globalBlockTypes';
import { escapeHTML, transformLink, cssNumber, renderIcon, parseSrcFromIframe, getGridTemplate, renderButtonHTML, getPaddingStyle } from '../../../shared/utils/exportHtml';

const renderProductGridHtml = (data, isCatalog) => {
    const cols = cssNumber(data.columns || 3, 3);
    const mockItems = Array.from({length: cssNumber(data.items_per_page || 4, 4)}).fill(0);
    return `
        <section style="${getPaddingStyle(data)}">
            <div class="container">
                ${data.title ? `<h2 style="text-align: center; font-size: 2rem; margin-bottom: 2rem; color: var(--site-text-primary);">${escapeHTML(data.title)}</h2>` : ''}
                <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 24px;">
                     ${mockItems.map(() => `
                        <div style="background: var(--site-card-bg); border: 1px solid var(--site-border-color); border-radius: 12px; overflow: hidden;">
                            <div style="height: 250px; background: #eee; display: flex; align-items: center; justify-content: center; color: #999;">
                                ${renderIcon('shopping-bag', '', 'width: 48px; height: 48px; opacity: 0.5;')}
                            </div>
                            <div style="padding: 16px;">
                                <div style="height: 20px; background: #eee; width: 70%; margin-bottom: 10px; border-radius: 4px;"></div>
                                <div style="height: 16px; background: #eee; width: 40%; border-radius: 4px;"></div>
                            </div>
                        </div>
                     `).join('')}
                </div>
                ${isCatalog ? `<div style="text-align: center; margin-top: 30px; font-style: italic; color: var(--site-text-secondary);">Dynamic catalog requires backend connection.</div>` : ''}
            </div>
        </section>`;
};

const DEFINITIONS = [
    {
        type: 'hero',
        label: 'Обкладинка',
        icon: Image,
        category: 'basic',
        Component: lazy(() => import('../blocks/Hero/HeroBlock')),
        Settings: lazy(() => import('../blocks/Hero/HeroSettings')),
        getDefaults: () => ({
            bg_image: '',
            overlay_color: 'rgba(0, 0, 0, 0.5)',
            title: 'Заголовок обкладинки',
            subtitle: 'Напишіть тут короткий опис вашої пропозиції або компанії. Це перше, що побачать відвідувачі.',
            button_text: 'Дізнатись більше',
            button_link: '#',
            alignment: 'center',
            height: 'medium',
            fontFamily: 'global',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const heroHeight = { small: '300px', medium: '500px', large: '700px', full: 'calc(100vh - 60px)' }[data.height] || '500px';
            const heroAlign = { left: 'flex-start', center: 'center', right: 'flex-end' }[data.alignment] || 'center';
            const heroBg = data.bg_image ? `url('${escapeHTML(data.bg_image)}')` : 'var(--site-bg)';
            return `
        <section style="position: relative; min-height: ${heroHeight}; display: flex; align-items: center; justify-content: ${heroAlign}; overflow: hidden; color: ${data.theme_mode === 'dark' ? '#fff' : 'var(--site-text-primary)'}; text-align: ${data.alignment || 'center'}; ${getPaddingStyle(data)}">
            <div style="position: absolute; inset: 0; background: ${heroBg} center/cover no-repeat; z-index: 0;">
                ${data.bg_type === 'video' && data.bg_video ? `<video src="${escapeHTML(data.bg_video)}" autoplay muted loop playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>` : ''}
            </div>
            <div style="position: absolute; inset: 0; background-color: ${escapeHTML(data.overlay_color || '#000')}; opacity: ${cssNumber(data.overlay_opacity || 0.5, 0.5)}; z-index: 1;"></div>
            <div class="container" style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: ${heroAlign};">
                ${data.title ? `<h1 style="font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; margin-bottom: 1rem; line-height: 1.1;">${escapeHTML(data.title)}</h1>` : ''}
                ${data.subtitle ? `<p style="font-size: clamp(1rem, 2vw, 1.25rem); margin-bottom: 2rem; opacity: 0.9; max-width: 600px;">${escapeHTML(data.subtitle)}</p>` : ''}
                ${data.button_text ? renderButtonHTML({
                    text: data.button_text, link: data.button_link, ...data.button
                }) : ''}
            </div>
        </section>`;
        },
    },
    {
        type: 'text',
        label: 'Текстовий блок',
        icon: FileText,
        category: 'basic',
        Component: lazy(() => import('../blocks/Text/TextBlock')),
        Settings: lazy(() => import('../blocks/Text/TextSettings')),
        getDefaults: () => ({
            content: 'Вставте сюди свій текст.',
            alignment: 'left',
            style: 'p',
            fontFamily: 'global',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const Tag = ['h1', 'h2', 'h3'].includes(data.tag) ? data.tag : 'p';
            const fontSize = { h1: '2.5rem', h2: '2rem', h3: '1.5rem', p: '1rem' }[Tag];
            const fontWeight = { h1: '800', h2: '700', h3: '600', p: '400' }[Tag];
            return `
        <div style="text-align: ${escapeHTML(data.alignment || 'left')}; color: var(--site-text-primary); ${getPaddingStyle(data)}">
            <div class="container">
                ${(data.content || '').split('\n').map(line => `
                    <${Tag} style="font-size: ${fontSize}; font-weight: ${data.isBold ? 'bold' : fontWeight}; font-style: ${data.isItalic ? 'italic' : 'normal'}; text-decoration: ${data.isUnderline ? 'underline' : 'none'}; margin-bottom: 0.5em;">
                        ${line ? escapeHTML(line) : '&nbsp;'}
                    </${Tag}>
                `).join('')}
            </div>
        </div>`;
        },
    },
    {
        type: 'image',
        label: 'Зображення',
        icon: Image,
        category: 'basic',
        Component: lazy(() => import('../blocks/Image/ImageBlock')),
        Settings: lazy(() => import('../blocks/Image/ImageSettings')),
        getDefaults: () => ({
            mode: 'single',
            items: [],
            width: 'medium',
            objectFit: 'contain',
            borderRadius: '0px',
            link: '',
            targetBlank: false,
            settings_slider: {
                navigation: true,
                pagination: true,
                autoplay: false,
                loop: true
            },
            settings_grid: { columns: 3 },
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            let items = data.items || (data.url ? [{src: data.url}] : []);
            if (!items.length) return '';
            const imgRadius = data.borderRadius ? (String(data.borderRadius).match(/^[0-9]+$/) ? `${data.borderRadius}px` : escapeHTML(data.borderRadius)) : '0px';
            const imgRender = (src) => `<img src="${escapeHTML(src)}" alt="" style="width: 100%; height: 100%; object-fit: ${escapeHTML(data.objectFit || 'cover')}; border-radius: ${imgRadius}; display: block;">`;
            let imgContent = '';
            if (data.mode === 'grid') {
                 imgContent = `<div style="display: grid; grid-template-columns: repeat(${cssNumber(data.settings_grid?.columns || 3, 3)}, 1fr); gap: 16px;">
                    ${items.map(i => `<div style="aspect-ratio: 1/1;">${imgRender(i.src)}</div>`).join('')}
                 </div>`;
            } else {
                 imgContent = imgRender(items[0].src);
            }
            return `<div style="${getPaddingStyle(data)}"><div class="container" style="max-width: ${data.width === 'full' ? '100%' : '800px'};">${imgContent}</div></div>`;
        },
    },
    {
        type: 'button',
        label: 'Кнопка',
        icon: MousePointerClick,
        category: 'basic',
        Component: lazy(() => import('../blocks/Button/ButtonBlock')),
        Settings: lazy(() => import('../blocks/Button/ButtonSettings')),
        getDefaults: () => ({
            text: 'Натисніть тут',
            link: '#',
            styleType: 'primary',
            alignment: 'center',
            targetBlank: false,
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            return `
        <div style="display: flex; justify-content: ${data.alignment === 'left' ? 'flex-start' : (data.alignment === 'right' ? 'flex-end' : 'center')}; ${getPaddingStyle(data)}">
            <div class="container">
                ${renderButtonHTML(data)}
            </div>
        </div>`;
        },
    },
    {
        type: 'showcase',
        label: 'Вітрина',
        icon: Star,
        category: 'ecommerce',
        Component: lazy(() => import('../blocks/ShowCase/ShowCaseBlock')),
        Settings: lazy(() => import('../blocks/ShowCase/ShowCaseSettings')),
        getDefaults: () => ({
            title: 'Хіти продажів',
            source_type: 'category',
            category_id: 'all',
            selected_product_ids: [],
            columns: 4,
            limit: 8,
            block_theme: 'auto'
        }),
        toHtml: (data) => renderProductGridHtml(data, false),
    },
    {
        type: 'layout',
        label: 'Макет',
        icon: Grid,
        category: 'layout',
        presets: [
            { preset: '50-50', name: '2 колонки (50/50)', columns: 2 },
            { preset: '75-25', name: '2 колонки (75/25)', columns: 2 },
            { preset: '33-33-33', name: '3 колонки (33/33/33)', columns: 3 },
            { preset: '25-25-25-25', name: '4 колонки (25/25/25/25)', columns: 4 },
        ],
        Component: lazy(() => import('../blocks/Layout/LayoutBlock')),
        Settings: lazy(() => import('../blocks/Layout/LayoutSettings')),
        getDefaults: (options = {}) => {
            const columnCount = options.columns || 2;
            return {
                preset: options.preset || '50-50',
                columns: Array(columnCount).fill().map(() => []),
                verticalAlign: 'top',
                direction: 'row',
                block_theme: 'auto'
            };
        },
        toHtml: (data, ctx) => {
            const gridCols = getGridTemplate(data.preset, data.direction);
            const layoutHeight = { small: '300px', medium: '500px', large: '700px', full: '100vh', auto: 'auto' }[data.height] || 'auto';
            const bgStyle = data.bg_image 
                ? `background: url('${escapeHTML(data.bg_image)}') center/cover no-repeat;` 
                : (data.bg_type === 'color' ? `background-color: ${escapeHTML(data.bg_color || '')};` : '');
            const columnsHTML = (data.columns || []).map(colBlocks => `
                <div style="display: flex; flex-direction: column; width: 100%;">
                    ${colBlocks.map(innerBlock => ctx.renderBlock(innerBlock)).join('\n')}
                </div>
            `).join('');
            return `
        <section style="position: relative; min-height: ${layoutHeight}; ${bgStyle} ${getPaddingStyle(data)}">
            ${(data.bg_type === 'image' || data.bg_type === 'video') ? `<div style="position: absolute; inset: 0; background-color: ${escapeHTML(data.overlay_color || '')}; opacity: ${cssNumber(data.overlay_opacity || 0, 0)}; pointer-events: none;"></div>` : ''}
            <div class="container" style="position: relative; z-index: 1;">
                <div style="display: grid; grid-template-columns: ${gridCols}; gap: ${cssNumber(data.gap || 20, 20)}px; align-items: ${data.verticalAlign === 'middle' ? 'center' : 'start'};">
                    ${columnsHTML}
                </div>
            </div>
        </section>`;
        },
    },
    {
        type: 'catalog',
        label: 'Каталог товарів',
        icon: ShoppingBag,
        category: 'ecommerce',
        Component: lazy(() => import('../blocks/Catalog/CatalogBlock')),
        Settings: lazy(() => import('../blocks/Catalog/CatalogSettings')),
        getDefaults: () => ({
            title: 'Каталог товарів',
            source_type: 'all',
            root_category_id: null,
            show_search: true,
            show_category_filter: true,
            show_sorting: true,
            items_per_page: 12,
            columns: 3,
            block_theme: 'auto'
        }),
        toHtml: (data) => renderProductGridHtml(data, true),
    },
    {
        type: 'features',
        label: 'Переваги',
        icon: List,
        category: 'basic',
        Component: lazy(() => import('../blocks/Features/FeaturesBlock')),
        Settings: lazy(() => import('../blocks/Features/FeaturesSettings')),
        getDefaults: () => ({
            title: 'Наші переваги',
            columns: 2,
            items: [
                { id: generateBlockId(), icon: 'star', title: 'Особливість 1', text: 'Короткий опис' },
                { id: generateBlockId(), icon: 'zap', title: 'Особливість 2', text: 'Короткий опис' }
            ],
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const isCard = data.layout === 'cards';
            return `
        <section style="background-color: var(--site-bg); ${getPaddingStyle(data)}">
            <div class="container">
                ${data.title ? `<h2 style="text-align: center; font-size: 2rem; margin-bottom: 2rem; color: var(--site-text-primary);">${escapeHTML(data.title)}</h2>` : ''}
                <div style="display: grid; grid-template-columns: repeat(${cssNumber(data.columns || 3, 3)}, 1fr); gap: 24px;">
                    ${(data.items || []).map(item => `
                        <div style="padding: ${isCard ? '24px' : '0'}; background: ${isCard ? 'var(--site-card-bg)' : 'transparent'}; border: ${isCard ? '1px solid var(--site-border-color)' : 'none'}; border-radius: ${escapeHTML(data.borderRadius || '8px')}; display: flex; flex-direction: ${data.layout === 'list' ? 'row' : 'column'}; align-items: ${data.align === 'center' ? 'center' : 'flex-start'}; gap: 16px; text-align: ${data.layout === 'list' ? 'left' : escapeHTML(data.align)};">
                            <div style="color: var(--site-accent); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: ${data.showIconBackground ? 'var(--site-accent)' : 'transparent'}; color: ${data.showIconBackground ? '#fff' : 'var(--site-accent)'}; border-radius: 50%;">
                                ${renderIcon(item.icon)}
                            </div>
                            <div>
                                <h4 style="margin: 0 0 8px; font-size: 1.25rem; color: var(--site-text-primary);">${escapeHTML(item.title)}</h4>
                                <p style="margin: 0; color: var(--site-text-secondary); line-height: 1.6;">${escapeHTML(item.text)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </section>`;
        },
    },
    {
        type: 'form',
        label: 'Форма звʼязку',
        icon: Mail,
        category: 'basic',
        Component: lazy(() => import('../blocks/Form/FormBlock')),
        Settings: lazy(() => import('../blocks/Form/FormSettings')),
        getDefaults: () => ({
            buttonText: 'Надіслати',
            successMessage: 'Дякуємо! Ваше повідомлення надіслано.',
            notifyEmail: '',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            return `
        <section style="${getPaddingStyle(data)}">
            <div class="container" style="max-width: 600px;">
                <form style="background: var(--site-card-bg); padding: 30px; border-radius: 12px; border: 1px solid var(--site-border-color);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <input type="text" placeholder="Ваше ім'я" style="padding: 12px; border: 1px solid var(--site-border-color); border-radius: 8px; width: 100%;">
                        <input type="email" placeholder="Email" style="padding: 12px; border: 1px solid var(--site-border-color); border-radius: 8px; width: 100%;">
                    </div>
                    <textarea placeholder="Повідомлення" style="width: 100%; padding: 12px; border: 1px solid var(--site-border-color); border-radius: 8px; min-height: 120px; margin-bottom: 20px;"></textarea>
                    <div style="text-align: ${escapeHTML(data.button?.alignment || 'center')}">
                         ${renderButtonHTML({ text: data.buttonText || 'Надіслати', ...data.button })}
                    </div>
                </form>
            </div>
        </section>`;
        },
    },
    {
        type: 'video',
        label: 'Відео',
        icon: Video,
        category: 'basic',
        Component: lazy(() => import('../blocks/Video/VideoBlock')),
        Settings: lazy(() => import('../blocks/Video/VideoSettings')),
        getDefaults: () => ({
            url: '',
            sizePreset: 'medium',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
             const vidHeight = { small: '300px', medium: '500px', large: '700px', auto: 'auto' }[data.height] || 'auto';
             return `
        <div style="width: 100%; height: ${vidHeight}; background: #000; ${getPaddingStyle(data)}">
            <div class="container" style="height: 100%;">
                 ${data.url ? `<video src="${escapeHTML(data.url)}" controls style="width: 100%; height: 100%; object-fit: cover;"></video>` : ''}
            </div>
        </div>`;
        },
    },
    {
        type: 'map',
        label: 'Мапа',
        icon: MapPin,
        category: 'basic',
        Component: lazy(() => import('../blocks/Map/MapBlock')),
        Settings: lazy(() => import('../blocks/Map/MapSettings')),
        getDefaults: () => ({
            embed_code: '',
            sizePreset: 'medium',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const mapSrc = parseSrcFromIframe(data.embed_code);
            if (!mapSrc) return '';
            const mapHeight = { small: '300px', medium: '450px', large: '600px' }[data.sizePreset] || '450px';
            return `
        <div style="${getPaddingStyle(data)}">
            <div class="container">
                <iframe src="${mapSrc}" width="100%" height="${mapHeight}" style="border:0; border-radius: 8px;" allowfullscreen="" loading="lazy"></iframe>
            </div>
        </div>`;
        },
    },
    {
        type: 'accordion',
        label: 'Акордеон',
        icon: HelpCircle,
        category: 'basic',
        Component: lazy(() => import('../blocks/Accordion/AccordionBlock')),
        Settings: lazy(() => import('../blocks/Accordion/AccordionSettings')),
        getDefaults: () => ({
            fontFamily: 'global',
            items: [
                { id: generateBlockId(), title: "Перше питання", content: "Текст відповіді тут..." },
                { id: generateBlockId(), title: "Друге питання", content: "Інший текст відповіді..." }
            ],
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            return `
        <section style="${getPaddingStyle(data)}">
            <div class="container" style="max-width: 800px;">
                ${(data.items || []).map(item => `
                    <details style="margin-bottom: 12px; background: var(--site-card-bg); border: 1px solid var(--site-border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 16px; font-weight: 600; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: var(--site-text-primary);">
                            ${escapeHTML(item.title)}
                            <span style="color: var(--site-accent);">▼</span>
                        </summary>
                        <div style="padding: 16px; border-top: 1px solid var(--site-border-color); color: var(--site-text-secondary); line-height: 1.6;">
                            ${escapeHTML(item.content)}
                        </div>
                    </details>
                `).join('')}
            </div>
        </section>`;
        },
    },
    {
        type: 'social_icons',
        label: 'Соцмережі',
        icon: Share2,
        category: 'basic',
        Component: lazy(() => import('../blocks/SocialIcons/SocialIconsBlock')),
        Settings: lazy(() => import('../blocks/SocialIcons/SocialIconsSettings')),
        getDefaults: () => ({
            alignment: 'left',
            facebook: '',
            instagram: '',
            telegram: '',
            youtube: '',
            tiktok: '',
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const socialLinks = [
                { k: 'facebook', v: data.facebook }, { k: 'instagram', v: data.instagram },
                { k: 'telegram', v: data.telegram }, { k: 'youtube', v: data.youtube }
            ].filter(s => s.v);
            return `
        <div style="text-align: ${escapeHTML(data.alignment || 'left')}; ${getPaddingStyle(data)}">
            <div class="container" style="display: flex; gap: 12px; justify-content: ${data.alignment === 'center' ? 'center' : (data.alignment === 'right' ? 'flex-end' : 'flex-start')};">
                ${socialLinks.map(s => `
                    <a href="${transformLink(s.v)}" target="_blank" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: var(--site-text-primary); border: 1px solid var(--site-border-color); border-radius: 50%; transition: all 0.2s;">
                        ${renderIcon(s.k)}
                    </a>
                `).join('')}
            </div>
        </div>`;
        },
    },
    {
        type: 'global-header',
        label: 'Глобальний Хедер',
        icon: Globe,
        category: 'global',
        isGlobal: true,
        Component: lazy(() => import('../blocks/Header/HeaderBlock')),
        Settings: lazy(() => import('../blocks/Header/HeaderSettings')),
        getDefaults: () => ({
            logo_src: '',
            site_title: 'Мій Сайт',
            show_title: true,
            logo_size: 'medium',
            nav_alignment: 'right',
            nav_style: 'text',
            nav_items: [
                { id: generateBlockId(), label: 'Головна', link: '/' },
                { id: generateBlockId(), label: 'Контакти', link: '/contacts' }
            ],
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const logoImage = data.logo_src || data.logo_url;
            return `
        <header style="background-color: var(--site-header-bg); border-bottom: 1px solid var(--site-border-color); padding: 1rem 0;">
            <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
                <a href="index.html" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--site-text-primary);">
                    ${logoImage 
                        ? `<img src="${escapeHTML(logoImage)}" alt="Logo" style="height: ${data.logo_size === 'large' ? 80 : (data.logo_size === 'small' ? 30 : 50)}px; width: auto; border-radius: ${cssNumber(data.logo_radius || 0, 0)}px;">` 
                        : ''}
                    ${data.show_title ? `<span style="font-weight: 700; font-size: 1.2rem;">${escapeHTML(data.site_title || 'Site')}</span>` : ''}
                </a>
                <nav style="display: flex; gap: 24px; align-items: center;">
                    ${(data.nav_items || []).map(item => {
                        if (data.nav_style === 'button') {
                            return renderButtonHTML({
                                text: item.label, link: item.link, 
                                ...data.buttonSettings
                            });
                        }
                        return `<a href="${transformLink(item.link)}" style="color: var(--site-text-primary); font-weight: 500;">${escapeHTML(item.label)}</a>`;
                    }).join('')}
                </nav>
                <div class="mobile-menu-icon" style="display: none;">${renderIcon('menu')}</div>
            </div>
        </header>`;
        },
    },
    {
        type: 'global-footer',
        label: 'Глобальний Футер',
        icon: Globe,
        category: 'global',
        isGlobal: true,
        Component: lazy(() => import('../blocks/Footer/FooterBlock')),
        Settings: lazy(() => import('../blocks/Footer/FooterSettings')),
        getDefaults: () => ({
            variant: 'standard',
            bg_color: 'dark',
            logo_src: '',
            copyright: `© ${new Date().getFullYear()} Назва компанії`,
            links: [
                { id: generateBlockId(), label: 'Політика конфіденційності', link: '/privacy' },
                { id: generateBlockId(), label: 'Контакти', link: '/contact' }
            ],
            socials: [
                { id: generateBlockId(), platform: 'facebook', link: '#' },
                { id: generateBlockId(), platform: 'instagram', link: '#' }
            ],
            block_theme: 'auto'
        }),
        toHtml: (data) => {
            const text = data.copyright || data.content || `© ${new Date().getFullYear()} All rights reserved.`;
            const links = (Array.isArray(data.links) ? data.links : []).filter(item => item && item.label);
            return `
        <footer style="background-color: var(--site-card-bg); border-top: 1px solid var(--site-border-color); padding: 40px 0;">
            <div class="container" style="text-align: center; color: var(--site-text-secondary);">
                ${escapeHTML(text)}${links.length ? `
                <nav style="display: flex; justify-content: center; flex-wrap: wrap; gap: 16px; margin-top: 12px;">
                    ${links.map(item => `<a href="${transformLink(item.link)}" style="color: var(--site-text-secondary);">${escapeHTML(item.label)}</a>`).join('')}
                </nav>` : ''}
            </div>
        </footer>`;
        },
    },
];

const BY_TYPE = new Map(DEFINITIONS.map((definition) => [definition.type, definition]));
const ACCEPTED_ALIASES = {
    render: ['header'],
    settings: ['header', 'footer'],
    export: ['header', 'footer']
};

const resolveType = (type, consumer) => (ACCEPTED_ALIASES[consumer].includes(type) ? LEGACY_TYPE_ALIASES[type] : type);
const find = (type, consumer) => BY_TYPE.get(resolveType(type, consumer));

export const BLOCK_REGISTRY = DEFINITIONS;

export const BLOCK_LIBRARY = DEFINITIONS.map((definition) => ({
    type: definition.type,
    name: definition.label,
    icon: React.createElement(definition.icon, { size: 20 }),
    category: definition.category,
    ...(definition.presets ? { presets: definition.presets } : {})
}));

export const getBlockDescriptor = (type) => BY_TYPE.get(type);

export const getBlockComponent = (type) => find(type, 'render')?.Component;

export const getSettingsComponent = (type) => find(type, 'settings')?.Settings;

export const getBlockHtmlRenderer = (type) => {
    const resolved = resolveType(type, 'export');
    const descriptor = BY_TYPE.get(resolved);
    return descriptor ? descriptor.toHtml : undefined;
};

export const getDefaultBlockData = (type, options = {}) => {
    const descriptor = BY_TYPE.get(type);
    return descriptor ? descriptor.getDefaults(options) : { block_theme: 'auto' };
};

export const getBlocksByCategory = (category) => BLOCK_LIBRARY.filter((block) => block.category === category);

export const getDraggableBlocks = () => BLOCK_LIBRARY.filter((block) => !block.isSystem);
