// frontend/src/modules/editor/blocks/Features/FeaturesBlock.jsx
import React from 'react';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { Star, Zap, Shield, Truck, Gift, Clock, Phone, Settings, Check, User, Globe, Heart, ShoppingBag, Box, Smile, Award } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const ICON_MAP = {
    star: Star, zap: Zap, shield: Shield, truck: Truck, gift: Gift,
    clock: Clock, phone: Phone, settings: Settings, check: Check,
    user: User, globe: Globe, heart: Heart, shop: ShoppingBag,
    box: Box, smile: Smile, award: Award, default: Star
};

const FeaturesBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const { 
        title, 
        items = [], 
        columns = 2, 
        layout = 'cards', 
        align = 'center',
        blockAlign = 'center',
        borderRadius = '8px',
        showIconBackground = false,
        titleFontFamily,
        contentFontFamily,
        height = 'small',
        styles = {} 
    } = blockData || {};

    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        title: titleFontFamily,
        content: contentFontFamily
    }, siteData);

    const uniqueClass = `features-scope-${blockData?.block_id || blockData?.id || 'preview'}`;
    const heightClasses = { 
        small: 'min-h-auto', 
        medium: 'min-h-[400px] @3xl:min-h-[600px]', 
        large: 'min-h-[600px] @3xl:min-h-[800px]', 
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'min-h-auto'
    };
    const isCard = layout === 'cards';
    const isList = layout === 'list';
    const blockAlignClasses = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end'
    };

    const itemWidthClasses = {
        1: 'w-full',
        2: 'w-full @2xl:w-[calc(50%-1rem)]',
        3: 'w-full @2xl:w-[calc(50%-1rem)] @5xl:w-[calc(33.333%-1.333rem)]',
        4: 'w-full @2xl:w-[calc(50%-1rem)] @5xl:w-[calc(25%-1.5rem)]'
    };

    let alignClass = 'items-start text-left';
    if (!isList) {
        if (align === 'center') alignClass = 'items-center text-center';
        else if (align === 'right') alignClass = 'items-end text-right';
    }

    const renderIcon = (iconName) => {
        const IconComponent = ICON_MAP[iconName] || ICON_MAP.default;
        return <IconComponent size={showIconBackground ? 28 : 36} className="@2xl:w-8 @2xl:h-8 @3xl:w-10 @3xl:h-10" />;
    };

    return (
        <div 
            className={`
                py-12 @2xl:py-16 @3xl:py-20 px-5 @2xl:px-8 flex flex-col justify-center bg-(--site-bg) text-(--site-text-primary) w-full
                ${heightClasses[height] || 'min-h-auto'}
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
                .${uniqueClass} .feature-card:hover {
                    transform: translateY(-6px);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.08);
                }
                .${uniqueClass} .feature-card:hover .feature-icon {
                    transform: scale(1.1) rotate(5deg);
                }
            `}</style>
            <div className="w-full max-w-300 mx-auto">
                {title && (
                    <h2 
                        className="text-center mb-10 @3xl:mb-14 text-3xl @2xl:text-4xl @3xl:text-5xl font-bold text-(--site-text-primary) w-full leading-tight tracking-tight"
                        style={{ fontFamily: fontStyles.title }}
                    >
                        {title}
                    </h2>
                )}
                
                <div 
                    className={`
                        flex flex-wrap items-stretch gap-6 @2xl:gap-8 w-full
                        ${blockAlignClasses[blockAlign] || 'justify-center'}
                    `}
                >
                    {items.map((item, index) => (
                        <div 
                            key={item.id || index} 
                            className={`
                                ${itemWidthClasses[columns] || itemWidthClasses[2]}
                                flex relative z-10 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]
                                ${isList ? 'flex-row items-start gap-4 @2xl:gap-5' : `flex-col gap-3 @2xl:gap-4 ${alignClass}`}
                                ${isCard ? 'feature-card bg-(--site-card-bg) border border-(--site-border-color) p-6 @2xl:p-8 shadow-sm' : 'bg-transparent border-none p-0 @2xl:p-2'}
                            `}
                            style={{ 
                                borderRadius: isCard ? borderRadius : '0' 
                            }}
                        >
                            <div 
                                className={`
                                    feature-icon flex items-center justify-center shrink-0 transition-all duration-300 ease-out
                                    ${showIconBackground ? 'w-14 h-14 @2xl:w-16 @2xl:h-16 rounded-full bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/20' : 'w-auto h-auto bg-transparent text-(--site-accent)'}
                                    ${(!isList && !showIconBackground) ? 'mb-1 @2xl:mb-2' : ''}
                                `}
                            >
                                {renderIcon(item.icon)}
                            </div>
                            <div className="w-full">
                                <h4 
                                    className="m-0 mb-2 @2xl:mb-3 text-lg @2xl:text-xl font-semibold text-(--site-text-primary) leading-snug"
                                    style={{ fontFamily: fontStyles.content }}
                                >
                                    {item.title}
                                </h4>
                                <p 
                                    className="m-0 text-(--site-text-secondary) leading-relaxed text-sm @2xl:text-base whitespace-pre-wrap opacity-90"
                                    style={{ fontFamily: fontStyles.content }}
                                >
                                    {item.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
                {isEditorPreview && items.length === 0 && (
                    <div className="text-center p-10 opacity-50 border-2 border-dashed border-(--site-border-color) rounded-xl flex flex-col items-center justify-center w-full mt-4">
                        <div className="mb-3 text-(--site-accent)">
                            <Star size={32} />
                        </div>
                        <span className="font-medium">Додайте переваги у налаштуваннях блоку</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(FeaturesBlock, areBlockPropsEqual);