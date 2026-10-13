// frontend/src/modules/editor/blocks/Image/ImageBlock.jsx
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { resolveSiteLink } from '../../../../shared/utils/linkUtils';
import { BASE_URL } from '../../../../shared/config';
import { Image as ImageIcon } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const formatBorderRadius = (radius) => {
    if (!radius) return '0px';
    return String(radius).match(/^[0-9]+$/) ? `${radius}px` : radius;
};

const getFlexItemClass = (cols) => {
    const safeCols = parseInt(cols) || 3;
    if (safeCols === 1) return 'w-full';
    if (safeCols === 2) return 'w-full @2xl:w-[calc(50%-8px)]';
    if (safeCols === 3) return 'w-full @2xl:w-[calc(50%-8px)] @3xl:w-[calc(33.333%-10.66px)]';
    if (safeCols >= 4) return 'w-full @2xl:w-[calc(50%-8px)] @3xl:w-[calc(33.333%-10.66px)] @5xl:w-[calc(25%-12px)]';
    return 'w-full @2xl:w-[calc(50%-8px)] @3xl:w-[calc(33.333%-10.66px)]';
};

const ImageBlock = ({ blockData, isEditorPreview, siteData, style }) => {
    const { 
        objectFit = 'contain',
        borderRadius = '0px', 
        link, 
        targetBlank,
        width = 'medium',
        height = 'auto', 
        mode = 'single',
        items = [],
        styles = {}
    } = blockData;
    
    const effectiveItems = (blockData.imageUrl && items.length === 0) 
        ? [{ id: 'legacy', src: blockData.imageUrl }] 
        : items;
    const settings_slider = blockData.settings_slider || { navigation: true, pagination: true, autoplay: false, loop: true };
    const settings_grid = { columns: 3, alignment: 'center', ...blockData.settings_grid };
    const heightClasses = {
        small: 'h-[250px] @2xl:h-[300px]',
        medium: 'h-[300px] @2xl:h-[400px] @3xl:h-[500px]',
        large: 'h-[400px] @2xl:h-[500px] @3xl:h-[700px]',
        full: 'h-[calc(100vh-80px)]', 
        auto: 'h-auto'
    };
    
    const currentHeightClass = heightClasses[height] || heightClasses.auto;
    const isFixedHeight = height !== 'auto';
    const renderImage = (item, customStyle = {}) => {
        if (!item || !item.src) return null;
        const fullUrl = item.src.startsWith('http') ? item.src : `${BASE_URL}${item.src}`;
        return (
            <img 
                src={fullUrl} 
                alt={item.alt || ''} 
                className="w-full h-full block transition-opacity duration-300"
                style={{ 
                    objectFit: isFixedHeight ? (objectFit === 'contain' ? 'contain' : 'cover') : objectFit,
                    borderRadius: formatBorderRadius(borderRadius),
                    ...customStyle
                }} 
                loading="lazy"
            />
        );
    };

    const Placeholder = () => (
        <div 
            className="p-8 @2xl:p-12 text-center bg-(--site-card-bg) border border-dashed border-(--site-border-color) text-(--site-text-secondary) flex flex-col items-center justify-center gap-3 w-full"
            style={{
                borderRadius: formatBorderRadius(borderRadius),
                height: isFixedHeight ? '100%' : '200px'
            }}
        >
            <div className="opacity-40 text-(--site-text-primary)">
                <ImageIcon size={48} className="@2xl:w-16 @2xl:h-16" />
            </div>
            <div className="text-sm font-medium">
                Зображення не вибрано
            </div>
        </div>
    );

    const renderSingle = () => {
        const item = effectiveItems[0];
        if (!item?.src) return isEditorPreview ? <Placeholder /> : null;
        const content = renderImage(item, { height: '100%' });
        if (link && !isEditorPreview) {
            const finalLink = resolveSiteLink(link, siteData?.site_path);
            return (
                <a 
                    href={finalLink} 
                    target={targetBlank ? '_blank' : '_self'} 
                    rel={targetBlank ? 'noopener noreferrer' : ''}
                    className="block w-full h-full hover:opacity-90 transition-opacity"
                >
                    {content}
                </a>
            );
        }
        return <div className="w-full h-full">{content}</div>;
    };

    const renderSlider = () => {
        if (effectiveItems.length === 0) return renderSingle();
        return (
            <div className={`swiper-container-wrapper my-block-swiper-${blockData.block_id || 'preview'} h-full w-full`}>
                <style>{`
                    .my-block-swiper-${blockData.block_id || 'preview'} .swiper-button-next,
                    .my-block-swiper-${blockData.block_id || 'preview'} .swiper-button-prev { 
                        color: var(--site-accent); 
                        transform: scale(0.7);
                    }
                    @container (min-width: 672px) {
                        .my-block-swiper-${blockData.block_id || 'preview'} .swiper-button-next,
                        .my-block-swiper-${blockData.block_id || 'preview'} .swiper-button-prev { transform: scale(1); }
                    }
                    .my-block-swiper-${blockData.block_id || 'preview'} .swiper-pagination-bullet-active { background: var(--site-accent); }
                    .my-block-swiper-${blockData.block_id || 'preview'} .swiper { height: 100%; width: 100%; }
                `}</style>
                <Swiper
                    modules={[Navigation, Pagination, Autoplay]}
                    navigation={settings_slider.navigation}
                    pagination={settings_slider.pagination ? { clickable: true } : false}
                    loop={settings_slider.loop && effectiveItems.length > 1}
                    autoplay={settings_slider.autoplay ? { delay: 3000, disableOnInteraction: false } : false}
                    className="overflow-hidden h-full w-full"
                    style={{ borderRadius: formatBorderRadius(borderRadius) }}
                >
                    {effectiveItems.map((item, idx) => (
                        <SwiperSlide key={item.id || idx} className="h-full w-full">
                            <div 
                                className="w-full flex justify-center items-center"
                                style={{ 
                                    height: isFixedHeight ? '100%' : 'auto',
                                    aspectRatio: isFixedHeight ? 'auto' : '16 / 9',
                                }}
                            >
                                {renderImage(item)}
                            </div>
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
        );
    };

    const renderGrid = () => {
        if (effectiveItems.length === 0) return renderSingle();
        const cols = settings_grid.columns || 3;
        const gridAlignClass = settings_grid.alignment === 'left' ? 'justify-start' :
                               settings_grid.alignment === 'right' ? 'justify-end' : 
                               'justify-center';
        return (
            <div 
                className={`flex flex-wrap gap-2 @2xl:gap-4 w-full ${gridAlignClass}`}
                style={{ 
                    height: isFixedHeight ? '100%' : 'auto', 
                    alignContent: isFixedHeight ? 'center' : 'flex-start' 
                }}
            >
                {effectiveItems.map((item, idx) => (
                    <div 
                        key={item.id || idx} 
                        className={`overflow-hidden flex justify-center items-center shrink-0 ${getFlexItemClass(cols)}`}
                        style={{ 
                            height: cols === 1 ? (isFixedHeight ? '100%' : 'auto') : 'auto',
                            aspectRatio: cols === 1 ? 'auto' : '1 / 1', 
                            borderRadius: formatBorderRadius(borderRadius),
                        }}
                    >
                        {renderImage(item, { 
                            objectFit: (cols === 1 && !isFixedHeight) ? 'contain' : 'cover', 
                            height: '100%' 
                        })}
                    </div>
                ))}
            </div>
        );
    };

    const widthClasses = { 
        'small': 'max-w-full @2xl:max-w-[400px]', 
        'medium': 'max-w-full @2xl:max-w-[700px]', 
        'large': 'max-w-full @5xl:max-w-[1000px]', 
        'full': 'max-w-full' 
    };

    const blockAlignment = mode === 'grid' ? settings_grid.alignment : 'center';
    const alignClass = blockAlignment === 'left' ? 'items-start' : 
                       blockAlignment === 'right' ? 'items-end' : 
                       'items-center';
    return (
        <div 
            className={`
                w-full flex flex-col justify-center px-4 @2xl:px-6 @3xl:px-8 py-4
                ${alignClass}
                ${isFixedHeight ? 'min-h-0' : 'min-h-auto'}
                ${currentHeightClass}
            `}
            style={{ 
                height: isFixedHeight ? undefined : 'auto',
                ...styles,
                ...style
            }}
        >
            <div 
                className={`
                    w-full flex flex-col justify-center
                    ${widthClasses[width] || widthClasses.medium}
                    ${isFixedHeight ? 'h-full flex-1' : 'h-auto flex-none'}
                `}
            >
                {mode === 'slider' ? renderSlider() : mode === 'grid' ? renderGrid() : renderSingle()}
            </div>
        </div>
    );
};

export default React.memo(ImageBlock, areBlockPropsEqual);