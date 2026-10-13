// frontend/src/modules/editor/blocks/SocialIcons/SocialIconsBlock.jsx
import React from 'react';
import { Facebook, Instagram, Send, Youtube, Music, Share2 } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const IconsMap = {
    facebook: Facebook,
    instagram: Instagram,
    telegram: Send,
    youtube: Youtube,
    tiktok: Music
};
const sanitizeUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
        return trimmed;
    }
    if (!trimmed.startsWith('javascript:') && !trimmed.startsWith('data:')) {
        return `https://${trimmed}`;
    }
    return null;
};

const IconWrapper = ({ children, href, isEditorPreview, baseColor }) => (
    <a
        href={sanitizeUrl(href)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={isEditorPreview ? (e) => e.preventDefault() : undefined}
        className="inline-flex items-center justify-center w-10 h-10 @2xl:w-12 @2xl:h-12 mx-1.5 my-1.5 @2xl:mx-2 no-underline transition-all duration-200 rounded-full hover:text-(--site-accent) hover:bg-black/5 dark:hover:bg-white/5 hover:-translate-y-1"
        style={{
            color: baseColor, 
            opacity: isEditorPreview ? 0.8 : 1, 
        }}
    >
        {children}
    </a>
);

const SocialIconsBlock = ({ blockData, isEditorPreview, style }) => {
    const { 
        alignment, 
        theme_mode = 'auto', 
        facebook, 
        instagram, 
        telegram, 
        youtube, 
        tiktok,
        height = 'auto'
    } = blockData;

    let baseColor = 'var(--site-text-primary)';
    if (theme_mode === 'light') baseColor = '#1a202c';
    if (theme_mode === 'dark') baseColor = '#ffffff';
    const socialLinks = [
        { key: 'facebook', href: facebook },
        { key: 'instagram', href: instagram },
        { key: 'telegram', href: telegram },
        { key: 'youtube', href: youtube },
        { key: 'tiktok', href: tiktok },
    ].filter(item => item.href && item.href.trim() !== ''); 
    
    const heightClasses = {
        small: 'min-h-[150px] @2xl:min-h-[250px]',
        medium: 'min-h-[250px] @2xl:min-h-[400px]',
        large: 'min-h-[400px] @2xl:min-h-[600px]',
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'min-h-auto py-8 @2xl:py-12' 
    };

    const currentHeightClass = heightClasses[height] || heightClasses.auto;
    const hasLinks = socialLinks.length > 0;
    if (!hasLinks && isEditorPreview) {
        return (
            <div 
                className={`
                    w-full flex flex-col items-center justify-center gap-3 text-center p-8 mx-auto max-w-300 rounded-xl
                    bg-(--site-card-bg) text-(--site-text-secondary)
                    ${currentHeightClass}
                    border border-dashed border-(--site-border-color)
                `}
                style={style}
            >
                <div className="text-(--site-accent) opacity-70">
                    <Share2 size={40} className="@2xl:w-12 @2xl:h-12" />
                </div>
                <div>
                    <p className="m-0 font-semibold text-(--site-text-primary) text-base @2xl:text-lg">Соцмережі</p>
                    <small className="block mt-1 opacity-80 text-sm">Додайте посилання в налаштуваннях.</small>
                </div>
            </div>
        );
    }
    return (
        <div 
            className={`
                w-full flex flex-col justify-center bg-transparent
                ${currentHeightClass}
            `}
            style={{ 
                ...style,
                backgroundColor: 'var(--site-bg)'
            }}
        >
            <div 
                className="w-full max-w-300 mx-auto px-5 flex flex-wrap"
                style={{ 
                    justifyContent: alignment === 'left' ? 'flex-start' : (alignment === 'right' ? 'flex-end' : 'center') 
                }}
            >
                {socialLinks.map((net) => {
                    const IconComponent = IconsMap[net.key];
                    return (
                        <IconWrapper key={net.key} href={net.href} isEditorPreview={isEditorPreview} baseColor={baseColor}>
                            <IconComponent size={24} className="@2xl:w-7 @2xl:h-7" />
                        </IconWrapper>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(SocialIconsBlock, areBlockPropsEqual);