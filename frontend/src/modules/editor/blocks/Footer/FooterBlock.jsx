// frontend/src/modules/editor/blocks/Footer/FooterBlock.jsx
import React, { useId } from 'react';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { BASE_URL } from '../../../../shared/config';
import { Facebook, Instagram, Send, Youtube, Music, Twitter, Linkedin, Github } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';
import { resolveSiteLink } from '../../../../shared/utils/linkUtils';

const IconsMap = {
    facebook: Facebook,
    instagram: Instagram,
    telegram: Send,
    youtube: Youtube,
    tiktok: Music,
    twitter: Twitter,
    linkedin: Linkedin,
    github: Github,
    default: Send
};

const FooterBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const data = blockData || {};
    const reactId = useId().replace(/:/g, '');
    const {
        variant = 'standard',
        theme_mode = 'auto',
        bg_type = 'color',
        bg_color = '#111827',
        bg_opacity = 1,
        bg_image,
        overlay_color = '#000000',
        overlay_opacity = 0.5,
        copyright = `© ${new Date().getFullYear()} Назва компанії`,
        links = [],
        socials = [],
        contentFontFamily,
        styles = {}
    } = data;

    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        content: contentFontFamily
    }, siteData);
    
    let rawOpacity = Number(overlay_opacity);
    if (isNaN(rawOpacity)) rawOpacity = 0.5;
    const safeOpacity = rawOpacity > 1 ? rawOpacity / 100 : rawOpacity;
    const fullImageUrl = bg_image 
        ? (bg_image.startsWith('http') ? bg_image : `${BASE_URL}${bg_image}`)
        : null;
    const getTextColor = () => {
        if (theme_mode === 'dark') return '#ffffff';
        if (theme_mode === 'light') return '#111827';
        return 'var(--site-text-primary, inherit)';
    };
    const computedTextColor = getTextColor();
    const isTransparent = overlay_color === 'transparent';
    const uniqueClass = `footer-scope-${data.block_id || data.id || reactId}`;
    const renderBackground = () => (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {bg_type === 'color' && (
                <div className="absolute inset-0" style={{ backgroundColor: bg_color, opacity: bg_opacity }} />
            )}
            {bg_type === 'image' && fullImageUrl && (
                <div 
                    className="w-full h-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${fullImageUrl})` }} 
                />
            )}
            {bg_type === 'image' && !isTransparent && (
                <div
                    className="absolute inset-0 z-1 transition-all duration-300"
                    style={{ backgroundColor: overlay_color, opacity: safeOpacity }}
                />
            )}
        </div>
    );

    return (
        <footer 
            className={`
                relative w-full flex flex-col overflow-hidden
                ${variant === 'simple' ? 'py-6 @2xl:py-8' : 'py-8 @2xl:py-12'}
                ${uniqueClass}
            `}
            style={{ 
                ...styles,
                ...style,
                color: computedTextColor,
                ...cssVariables
            }}
            id={data.anchorId}
        >
            <RenderFonts />
            <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
            {renderBackground()}
            <div className="relative z-10 mx-auto px-5 @2xl:px-8 max-w-300 w-full">
                {variant === 'simple' ? (
                    <div className="text-center">
                        <p className="text-sm @2xl:text-base m-0 opacity-80" style={{ fontFamily: fontStyles.content }}>
                            {copyright}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col @3xl:flex-row justify-between items-center gap-6 @2xl:gap-8">
                        <div className="flex flex-col items-center @3xl:items-start gap-3 w-full @3xl:w-auto text-center @3xl:text-left">
                            <p className="text-sm @2xl:text-base m-0 opacity-80" style={{ fontFamily: fontStyles.content }}>
                                {copyright}
                            </p>
                        </div>
                        {links && links.length > 0 && (
                            <div className="flex flex-wrap justify-center @3xl:justify-end gap-4 @2xl:gap-6 text-sm @2xl:text-base font-medium">
                                {links.map((link, idx) => (
                                    <a 
                                        key={link.id || idx} 
                                        href={resolveSiteLink(link.link, siteData?.site_path)}
                                        className="transition-opacity duration-200 no-underline text-inherit opacity-80 hover:opacity-100"
                                        style={{ fontFamily: fontStyles.content }}
                                        onClick={(e) => isEditorPreview && e.preventDefault()}
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        )}
                        {socials && socials.length > 0 && (
                            <div className="flex justify-center gap-4 @2xl:gap-5">
                                {socials.map((social, idx) => {
                                    const IconComponent = IconsMap[social.platform] || IconsMap.default;
                                    return (
                                        <a 
                                            key={social.id || idx} 
                                            href={resolveSiteLink(social.link, siteData?.site_path)} 
                                            className="transition-transform duration-200 no-underline text-inherit opacity-80 hover:opacity-100 hover:scale-110"
                                            title={social.platform}
                                            onClick={(e) => isEditorPreview && e.preventDefault()}
                                        >
                                            <IconComponent size={20} className="@2xl:w-6 @2xl:h-6" />
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </footer>
    );
};

export default React.memo(FooterBlock, areBlockPropsEqual);