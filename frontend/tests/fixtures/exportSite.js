// Дані для золотого тесту експорту: сайт, у якому є всі типи блоків, що підтримує htmlGenerator.
// Рік у футері не використовується (задано власний текст), тому вивід не залежить від дати.
export const exportSiteData = {
    title: 'Кав\'ярня "Ранок"',
    seo_description: 'Свіжа кава & десерти',
    favicon_url: 'assets/media_0.png',
    header_content: [
        {
            type: 'header',
            block_id: 'header-1',
            data: {
                site_title: 'Ранок',
                show_title: true,
                logo_src: 'assets/media_1.png',
                logo_size: 'large',
                logo_radius: 8,
                nav_style: 'text',
                nav_items: [
                    { id: 'n1', label: 'Головна', link: '/' },
                    { id: 'n2', label: 'Меню', link: '/menu?ref=nav' },
                    { id: 'n3', label: 'Про нас', link: 'page/about' },
                    { id: 'n4', label: 'Instagram', link: 'https://instagram.com/ranok' },
                ],
            },
        },
    ],
    footer_content: [
        {
            type: 'footer',
            block_id: 'footer-1',
            data: { content: '© 2026 Кав\'ярня «Ранок». Усі права захищено.' },
        },
    ],
};

export const exportPageBlocks = [
    {
        type: 'hero',
        block_id: 'b-hero',
        data: {
            bg_image: 'assets/media_2.jpg',
            overlay_color: '#102030',
            overlay_opacity: 0.4,
            title: 'Кава, що будить',
            subtitle: 'Обсмажуємо щотижня',
            button_text: 'Замовити',
            button_link: '/menu',
            button: { size: 'large', borderRadius: 12 },
            alignment: 'left',
            height: 'large',
            theme_mode: 'dark',
        },
    },
    {
        type: 'text',
        block_id: 'b-text',
        data: {
            tag: 'h2',
            content: 'Про нас\n\nМи працюємо щодня',
            alignment: 'center',
            isBold: true,
            isItalic: true,
            isUnderline: false,
        },
    },
    {
        type: 'image',
        block_id: 'b-image',
        data: {
            mode: 'grid',
            items: [{ src: 'assets/media_3.jpg' }, { src: 'assets/media_4.jpg' }, { src: 'assets/media_5.jpg' }],
            settings_grid: { columns: 3 },
            objectFit: 'cover',
            borderRadius: '12',
            width: 'full',
        },
    },
    {
        type: 'button',
        block_id: 'b-button',
        data: {
            text: 'Дізнатись більше',
            link: '/about',
            styleType: 'secondary',
            variant: 'outline',
            size: 'small',
            icon: 'arrowRight',
            iconPosition: 'right',
            alignment: 'right',
            targetBlank: true,
        },
    },
    {
        type: 'features',
        block_id: 'b-features',
        data: {
            title: 'Чому ми',
            columns: 2,
            layout: 'cards',
            align: 'center',
            borderRadius: '16px',
            showIconBackground: true,
            items: [
                { id: 'f1', icon: 'coffee', title: 'Свіжа кава', text: 'Обсмажування щотижня' },
                { id: 'f2', icon: 'truck', title: 'Доставка', text: 'По місту за годину' },
            ],
        },
    },
    {
        type: 'accordion',
        block_id: 'b-accordion',
        data: {
            items: [
                { id: 'a1', title: 'Чи є безкоштовна доставка?', content: 'Так, від 500 грн.' },
                { id: 'a2', title: 'Чи можна повернути товар?', content: 'Протягом 14 днів.' },
            ],
        },
    },
    {
        type: 'social_icons',
        block_id: 'b-social',
        data: {
            alignment: 'center',
            facebook: 'https://facebook.com/ranok',
            instagram: '',
            telegram: 't.me/ranok',
            youtube: 'https://youtube.com/@ranok',
            tiktok: 'https://tiktok.com/@ranok',
        },
    },
    {
        type: 'map',
        block_id: 'b-map',
        data: {
            embed_code: '<iframe src="https://www.google.com/maps/embed?pb=!1m18" width="600" height="450"></iframe>',
            sizePreset: 'small',
        },
    },
    {
        type: 'form',
        block_id: 'b-form',
        data: {
            buttonText: 'Написати',
            button: { alignment: 'right', styleType: 'primary' },
        },
    },
    {
        type: 'catalog',
        block_id: 'b-catalog',
        data: { title: 'Каталог', columns: 2, items_per_page: 2 },
    },
    {
        type: 'showcase',
        block_id: 'b-showcase',
        data: { title: 'Хіти', columns: 3, items_per_page: 3 },
    },
    {
        type: 'video',
        block_id: 'b-video',
        data: { url: 'assets/media_6.mp4', height: 'medium' },
    },
    {
        type: 'layout',
        block_id: 'b-layout',
        data: {
            preset: '33-33-33',
            gap: 30,
            verticalAlign: 'middle',
            bg_type: 'color',
            bg_color: '#f5f5f5',
            styles: { paddingTop: 20, paddingBottom: 20 },
            columns: [
                [{ type: 'text', block_id: 'l-1', data: { content: 'Колонка 1', tag: 'h3' } }],
                [{ type: 'button', block_id: 'l-2', data: { text: 'Колонка 2', link: '#top' } }],
                [{ type: 'image', block_id: 'l-3', data: { url: 'assets/media_7.jpg' } }],
            ],
        },
    },
];
