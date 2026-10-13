// Характеризаційні тести v0: конфігурація редактора (каталог блоків, значення за замовчуванням, опції).
// Це «перше з шести місць» опису блока (D-BLK-01): у v1.0 каталог і значення за замовчуванням
// переходять до дескрипторів реєстру (blockRegistry.js), а ці тести підтверджують, що результат не змінився.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    FONT_LIBRARY,
    BLOCK_THEME_OPTIONS,
    ALIGNMENT_OPTIONS,
    HEIGHT_OPTIONS,
    generateBlockId,
    getBlockThemeClass,
} from '../../src/modules/editor/core/editorConfig';
import { BLOCK_LIBRARY, getDefaultBlockData, getDraggableBlocks } from '../../src/modules/editor/core/blockRegistry';

// Ідентифікатори елементів генеруються випадково, тому порівнюємо дані з маркером замість значення.
const maskIds = (value) => {
    if (Array.isArray(value)) return value.map(maskIds);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' ? '<id>' : maskIds(v)]));
    }
    return value;
};

describe('BLOCK_LIBRARY', () => {
    it('містить 15 типів блоків у фіксованому порядку', () => {
        expect(BLOCK_LIBRARY.map((b) => b.type)).toEqual([
            'hero', 'text', 'image', 'button', 'showcase', 'layout', 'catalog', 'features',
            'form', 'video', 'map', 'accordion', 'social_icons', 'global-header', 'global-footer',
        ]);
    });

    it('кожен запис має назву й іконку', () => {
        BLOCK_LIBRARY.forEach((entry) => {
            expect(typeof entry.name).toBe('string');
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.icon).toBeTruthy();
        });
    });

    it('назви в каталозі', () => {
        const names = Object.fromEntries(BLOCK_LIBRARY.map((b) => [b.type, b.name]));
        expect(names).toEqual({
            hero: 'Обкладинка',
            text: 'Текстовий блок',
            image: 'Зображення',
            button: 'Кнопка',
            showcase: 'Вітрина',
            layout: 'Макет',
            catalog: 'Каталог товарів',
            features: 'Переваги',
            form: 'Форма звʼязку',
            video: 'Відео',
            map: 'Мапа',
            accordion: 'Акордеон',
            social_icons: 'Соцмережі',
            'global-header': 'Глобальний Хедер',
            'global-footer': 'Глобальний Футер',
        });
    });

    it('лише макет має пресети: чотири варіанти з кількістю колонок', () => {
        const withPresets = BLOCK_LIBRARY.filter((b) => b.presets);
        expect(withPresets.map((b) => b.type)).toEqual(['layout']);
        expect(withPresets[0].presets.map((p) => [p.preset, p.columns])).toEqual([
            ['50-50', 2], ['75-25', 2], ['33-33-33', 3], ['25-25-25-25', 4],
        ]);
    });

    it('типи унікальні', () => {
        const types = BLOCK_LIBRARY.map((b) => b.type);
        expect(new Set(types).size).toBe(types.length);
    });
});

describe('getDraggableBlocks', () => {
    it('особливість: прапорець isSystem ніде не виставлено, тому повертається весь каталог', () => {
        expect(BLOCK_LIBRARY.some((b) => b.isSystem)).toBe(false);
        expect(getDraggableBlocks()).toHaveLength(BLOCK_LIBRARY.length);
    });
});

describe('generateBlockId', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('повертає унікальні непорожні рядки', () => {
        const a = generateBlockId();
        const b = generateBlockId();
        expect(typeof a).toBe('string');
        expect(a.length).toBeGreaterThan(0);
        expect(a).not.toBe(b);
    });

    it('використовує crypto.randomUUID, якщо він є', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'uuid-stub' });
        expect(generateBlockId()).toBe('uuid-stub');
    });

    it('без crypto.randomUUID формує "id-<час>-<випадкові символи>"', () => {
        vi.stubGlobal('crypto', {});
        expect(generateBlockId()).toMatch(/^id-\d+-[a-z0-9]{1,7}$/);
    });
});

describe('getDefaultBlockData', () => {
    const year = new Date().getFullYear();

    const expectedDefaults = {
        hero: {
            bg_image: '',
            overlay_color: 'rgba(0, 0, 0, 0.5)',
            title: 'Заголовок обкладинки',
            subtitle: 'Напишіть тут короткий опис вашої пропозиції або компанії. Це перше, що побачать відвідувачі.',
            button_text: 'Дізнатись більше',
            button_link: '#',
            alignment: 'center',
            height: 'medium',
            fontFamily: 'global',
            block_theme: 'auto',
        },
        text: {
            content: 'Вставте сюди свій текст.',
            alignment: 'left',
            style: 'p',
            fontFamily: 'global',
            block_theme: 'auto',
        },
        image: {
            mode: 'single',
            items: [],
            width: 'medium',
            objectFit: 'contain',
            borderRadius: '0px',
            link: '',
            targetBlank: false,
            settings_slider: { navigation: true, pagination: true, autoplay: false, loop: true },
            settings_grid: { columns: 3 },
            block_theme: 'auto',
        },
        button: {
            text: 'Натисніть тут',
            link: '#',
            styleType: 'primary',
            alignment: 'center',
            targetBlank: false,
            block_theme: 'auto',
        },
        layout: {
            preset: '50-50',
            columns: [[], []],
            verticalAlign: 'top',
            direction: 'row',
            block_theme: 'auto',
        },
        showcase: {
            title: 'Хіти продажів',
            source_type: 'category',
            category_id: 'all',
            selected_product_ids: [],
            columns: 4,
            limit: 8,
            block_theme: 'auto',
        },
        catalog: {
            title: 'Каталог товарів',
            source_type: 'all',
            root_category_id: null,
            show_search: true,
            show_category_filter: true,
            show_sorting: true,
            items_per_page: 12,
            columns: 3,
            block_theme: 'auto',
        },
        features: {
            title: 'Наші переваги',
            columns: 2,
            items: [
                { id: '<id>', icon: 'star', title: 'Особливість 1', text: 'Короткий опис' },
                { id: '<id>', icon: 'zap', title: 'Особливість 2', text: 'Короткий опис' },
            ],
            block_theme: 'auto',
        },
        form: {
            buttonText: 'Надіслати',
            successMessage: 'Дякуємо! Ваше повідомлення надіслано.',
            notifyEmail: '',
            block_theme: 'auto',
        },
        video: { url: '', sizePreset: 'medium', block_theme: 'auto' },
        map: { embed_code: '', sizePreset: 'medium', block_theme: 'auto' },
        accordion: {
            fontFamily: 'global',
            items: [
                { id: '<id>', title: 'Перше питання', content: 'Текст відповіді тут...' },
                { id: '<id>', title: 'Друге питання', content: 'Інший текст відповіді...' },
            ],
            block_theme: 'auto',
        },
        social_icons: {
            alignment: 'left',
            facebook: '',
            instagram: '',
            telegram: '',
            youtube: '',
            tiktok: '',
            block_theme: 'auto',
        },
        'global-header': {
            logo_src: '',
            site_title: 'Мій Сайт',
            show_title: true,
            logo_size: 'medium',
            nav_alignment: 'right',
            nav_style: 'text',
            nav_items: [
                { id: '<id>', label: 'Головна', link: '/' },
                { id: '<id>', label: 'Контакти', link: '/contacts' },
            ],
            block_theme: 'auto',
        },
        'global-footer': {
            variant: 'standard',
            bg_color: 'dark',
            logo_src: '',
            copyright: `© ${year} Назва компанії`,
            links: [
                { id: '<id>', label: 'Політика конфіденційності', link: '/privacy' },
                { id: '<id>', label: 'Контакти', link: '/contact' },
            ],
            socials: [
                { id: '<id>', platform: 'facebook', link: '#' },
                { id: '<id>', platform: 'instagram', link: '#' },
            ],
            block_theme: 'auto',
        },
    };

    it.each(Object.keys(expectedDefaults))('значення за замовчуванням для "%s"', (type) => {
        expect(maskIds(getDefaultBlockData(type))).toEqual(expectedDefaults[type]);
    });

    it('кожен тип каталогу має значення за замовчуванням', () => {
        BLOCK_LIBRARY.forEach((entry) => {
            expect(Object.keys(expectedDefaults)).toContain(entry.type);
        });
    });

    it('невідомий тип дає лише block_theme "auto"', () => {
        expect(getDefaultBlockData('wat')).toEqual({ block_theme: 'auto' });
    });

    it('макет: кількість колонок і пресет беруться з options', () => {
        const data = getDefaultBlockData('layout', { preset: '25-25-25-25', columns: 4 });
        expect(data.preset).toBe('25-25-25-25');
        expect(data.columns).toEqual([[], [], [], []]);
    });

    it('макет: колонки створюються окремими масивами (не одним посиланням)', () => {
        const data = getDefaultBlockData('layout', { columns: 3 });
        data.columns[0].push('x');
        expect(data.columns[1]).toEqual([]);
        expect(data.columns[2]).toEqual([]);
    });

    it('макет: пресет і кількість колонок не пов\'язані між собою', () => {
        const data = getDefaultBlockData('layout', { preset: '33-33-33' });
        expect(data.columns).toHaveLength(2);
    });

    it('ідентифікатори елементів унікальні між викликами', () => {
        const a = getDefaultBlockData('features').items.map((i) => i.id);
        const b = getDefaultBlockData('features').items.map((i) => i.id);
        expect(new Set([...a, ...b]).size).toBe(4);
    });

    it('особливість: редактор записує text.style, а експорт і TextBlock читають tag; video.sizePreset проти height', () => {
        const text = getDefaultBlockData('text');
        expect(text).toHaveProperty('style', 'p');
        expect(text).not.toHaveProperty('tag');
        const video = getDefaultBlockData('video');
        expect(video).toHaveProperty('sizePreset', 'medium');
        expect(video).not.toHaveProperty('height');
    });
});

describe('опції та теми', () => {
    it('BLOCK_THEME_OPTIONS', () => {
        expect(BLOCK_THEME_OPTIONS).toEqual([
            { value: 'auto', label: 'Автоматично (як на сайті)' },
            { value: 'light', label: 'Світла тема' },
            { value: 'dark', label: 'Темна тема' },
        ]);
    });

    it.each([
        ['light', 'block-theme-light'],
        ['dark', 'block-theme-dark'],
        ['auto', ''],
        [undefined, ''],
        ['невідомо', ''],
    ])('getBlockThemeClass(%s) -> "%s"', (theme, expected) => {
        expect(getBlockThemeClass(theme)).toBe(expected);
    });

    it('ALIGNMENT_OPTIONS: ліворуч, по центру, праворуч', () => {
        expect(ALIGNMENT_OPTIONS.map((o) => o.value)).toEqual(['left', 'center', 'right']);
    });

    it('HEIGHT_OPTIONS: найбільша висота має значення "fullscreen", тоді як експорт розпізнає "full"', () => {
        expect(HEIGHT_OPTIONS.map((o) => o.value)).toEqual(['small', 'medium', 'large', 'fullscreen']);
    });
});

describe('FONT_LIBRARY', () => {
    it('21 шрифт; перший — "як на сайті", решта мають googleFont', () => {
        expect(FONT_LIBRARY).toHaveLength(21);
        expect(FONT_LIBRARY[0].value).toBe('global');
        FONT_LIBRARY.slice(1).forEach((font) => {
            expect(typeof font.googleFont).toBe('string');
            expect(font.value).toContain(font.googleFont);
        });
    });
});
