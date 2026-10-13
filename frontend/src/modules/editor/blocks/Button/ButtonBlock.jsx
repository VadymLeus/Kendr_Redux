// frontend/src/modules/editor/blocks/Button/ButtonBlock.jsx
import React from 'react';
import { resolveSiteLink } from '../../../../shared/utils/linkUtils';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { BASE_URL } from '../../../../shared/config';
import { ArrowRight, ShoppingCart, Mail, Phone, Check, Star, MousePointer2, Download, FileText } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const ButtonIcon = ({ name, size, flip }) => {
    if (!name || name === 'none') return null;
    const s = size === 'large' ? 20 : 18;
    const style = {
        transform: flip ? 'scaleX(-1)' : 'none',
        flexShrink: 0
    };
    const icons = {
        arrowRight: <ArrowRight size={s} style={style} />,
        cart: <ShoppingCart size={s} style={style} />,
        mail: <Mail size={s} style={style} />,
        phone: <Phone size={s} style={style} />,
        check: <Check size={s} style={style} />,
        star: <Star size={s} fill="currentColor" style={style} />,
        pointer: <MousePointer2 size={s} style={style} />,
        download: <Download size={s} style={style} />, 
        file: <FileText size={s} style={style} />      
    };
    return icons[name] || icons.arrowRight;
};

const ButtonBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const { 
        text = 'Кнопка', 
        link, 
        styleType = 'primary', 
        variant = 'solid', 
        size = 'medium',
        width = 'auto',
        borderRadius = 4,
        targetBlank,
        icon = 'none',
        iconPosition = 'right',
        iconFlip = false,
        alignment = 'center', 
        theme_mode = 'light',
        fontFamily,
        isFile = false,
        height = 'small',
        styles = {}
    } = blockData;

    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        main: fontFamily
    }, siteData);
    const accentColor = 'var(--site-accent, #3b82f6)';
    const textColor = 'var(--site-text-primary, #111827)';
    const whiteColor = '#ffffff';
    const secondaryColor = theme_mode === 'dark' ? whiteColor : textColor;
    const colorVar = styleType === 'secondary' ? secondaryColor : accentColor;
    const isOutline = variant === 'outline';
    const dynamicBtnStyle = {
        background: isOutline ? 'transparent' : colorVar,
        color: isOutline ? colorVar : (styleType === 'secondary' && !isOutline ? whiteColor : whiteColor),
        border: isOutline ? `2px solid ${colorVar}` : '2px solid transparent',
    };

    const sizeClasses = {
        small: 'px-4 py-2 text-sm',
        medium: 'px-5 py-2.5 @2xl:px-6 @2xl:py-3 text-sm @2xl:text-base',
        large: 'px-6 py-3 @2xl:px-8 @2xl:py-4 text-base @2xl:text-lg'
    };

    const justifyMap = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end'
    };
    
    const justifyContentClass = width === 'full' ? 'justify-stretch' : (justifyMap[alignment] || 'justify-center');
    const safeRadius = parseInt(borderRadius) || 0;
    const uniqueClass = `btn-scope-${blockData.block_id || blockData.id || 'preview'}`;
    const heightMap = { 
        small: 'min-h-auto', 
        medium: 'min-h-[150px] @2xl:min-h-[250px]', 
        large: 'min-h-[250px] @2xl:min-h-[400px]', 
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'min-h-auto'
    };
    let hrefValue = '#';
    if (link) {
        if (isFile) {
            hrefValue = link.startsWith('http') ? link : `${BASE_URL}${link}`;
        } else {
            hrefValue = resolveSiteLink(link, siteData?.site_path);
        }
    }

    const effectiveIcon = (isFile && icon === 'none') ? 'download' : icon;
    return (
        <div 
            className={`
                flex w-full items-center bg-(--site-bg, transparent) text-(--site-text-primary)
                px-4 @2xl:px-6 @3xl:px-8
                ${justifyContentClass}
                ${heightMap[height] || heightMap.small}
                ${uniqueClass}
            `}
            style={{ 
                ...styles,
                ...style,
                ...cssVariables 
            }}
        >
            <RenderFonts />
            <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
            <style>{`
                .btn-${styleType}-${variant}:hover { opacity: 0.9; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .btn-${styleType}-${variant}:active { transform: translateY(0); box-shadow: none; }
            `}</style>
            
            <a 
                href={hrefValue} 
                className={`
                    btn-${styleType}-${variant}
                    inline-flex items-center justify-center gap-2 no-underline cursor-pointer font-semibold
                    transition-all duration-200 ease-out leading-none text-center
                    ${sizeClasses[size || 'medium']}
                `}
                target={(targetBlank || isFile) ? '_blank' : '_self'}
                rel={(targetBlank || isFile) ? 'noopener noreferrer' : ''}
                download={isFile} 
                onClick={(e) => isEditorPreview && e.preventDefault()}
                style={{
                    width: width === 'full' ? '100%' : 'auto',
                    fontFamily: fontStyles.main,
                    borderRadius: `${safeRadius}px`,
                    ...dynamicBtnStyle
                }}
            >
                {iconPosition === 'left' && <ButtonIcon name={effectiveIcon} size={size} flip={iconFlip} />}
                <span>{text}</span>
                {iconPosition === 'right' && <ButtonIcon name={effectiveIcon} size={size} flip={iconFlip} />}
            </a>
        </div>
    );
};

export default React.memo(ButtonBlock, areBlockPropsEqual);