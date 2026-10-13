// frontend/src/shared/utils/exportHtml.js
export const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&',
        '<': '<',
        '>': '>',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
};

export const transformLink = (link) => {
    if (!link || typeof link !== 'string') return '#';
    const trimmed = link.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return '#';
    }
    
    if (trimmed.startsWith('http') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('#')) return trimmed;
    if (trimmed === '/' || trimmed === '') return 'index.html';
    
    let cleanLink = trimmed.replace(/^\//, '').replace(/^page\//, '').split('?')[0];
    if (!cleanLink.endsWith('.html')) cleanLink += '.html';
    return cleanLink;
};

export const renderIcon = (iconName, className = '', style = '') => {
    if (!iconName || iconName === 'none') return '';
    const name = iconName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    return `<i data-lucide="${escapeHTML(name)}" class="${escapeHTML(className)}" style="${escapeHTML(style)}"></i>`;
};

export const parseSrcFromIframe = (embedCode) => {
    if (!embedCode || typeof embedCode !== 'string') return null;
    const match = embedCode.match(/src="([^"]+)"/);
    const extractedUrl = match && match[1] ? match[1] : null;

    if (extractedUrl) {
        if (extractedUrl.startsWith('https://www.google.com/maps/embed') || 
            extractedUrl.startsWith('http://googleusercontent.com/maps.google.com/')) {
            return extractedUrl;
        }
    }
    return null;
};

export const getGridTemplate = (preset, direction) => {
    if (direction === 'column') return '1fr';
    switch(preset) {
        case '50-50': return '1fr 1fr';
        case '33-33-33': return '1fr 1fr 1fr';
        case '25-75': return '1fr 3fr';
        case '75-25': return '3fr 1fr';
        case '25-25-25-25': return '1fr 1fr 1fr 1fr';
        default: return '1fr 1fr'; 
    }
};

export const renderButtonHTML = (config, extraStyle = '') => {
    const { 
        text = 'Button', link, styleType = 'primary', variant = 'solid', 
        size = 'medium', borderRadius, width = 'auto', 
        icon, iconPosition = 'right', targetBlank 
    } = config;
    const isOutline = variant === 'outline';
    const isSecondary = styleType === 'secondary';
    const bgVar = isOutline ? 'transparent' : (isSecondary ? 'var(--site-text-primary)' : 'var(--site-accent)');
    const textVar = isOutline 
        ? (isSecondary ? 'var(--site-text-primary)' : 'var(--site-accent)') 
        : '#ffffff';
    const borderVar = isOutline 
        ? (isSecondary ? 'var(--site-text-primary)' : 'var(--site-accent)') 
        : 'transparent';
    const paddingMap = {
        small: '8px 16px', medium: '12px 24px', large: '16px 32px'
    };
    const fontSizeMap = {
        small: '0.85rem', medium: '1rem', large: '1.2rem'
    };

    const style = `
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        background: ${bgVar}; color: ${textVar}; border: 2px solid ${borderVar};
        padding: ${paddingMap[size] || paddingMap.medium};
        font-size: ${fontSizeMap[size] || fontSizeMap.medium};
        border-radius: ${borderRadius ? borderRadius + 'px' : '4px'};
        width: ${width === 'full' ? '100%' : 'auto'};
        text-decoration: none; font-weight: 600; cursor: pointer;
        transition: opacity 0.2s; ${extraStyle}
    `;
    const iconHTML = renderIcon(icon, '', 'width: 1.2em; height: 1.2em;');
    const safeText = escapeHTML(text);
    const content = `
        ${iconPosition === 'left' ? iconHTML : ''}
        <span>${safeText}</span>
        ${iconPosition === 'right' ? iconHTML : ''}
    `;

    if (link) {
        return `<a href="${transformLink(link)}" target="${targetBlank ? '_blank' : '_self'}" style="${style}">${content}</a>`;
    } else {
        return `<button type="button" style="${style}">${content}</button>`;
    }
};

export const getPaddingStyle = (data) => {
    const pt = data.styles?.paddingTop !== undefined ? data.styles.paddingTop : (data.padding ? parseInt(data.padding) : 40);
    const pb = data.styles?.paddingBottom !== undefined ? data.styles.paddingBottom : (data.padding ? parseInt(data.padding) : 40);
    return `padding-top: ${pt}px; padding-bottom: ${pb}px;`;
};
