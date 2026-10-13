// frontend/src/modules/editor/blocks/ShowCase/ShowCaseBlock.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../../../../shared/api/api';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import ProductCard from '../../ui/components/ProductCard';
import { ShoppingBag } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const getGridColsClass = (cols) => {
    const safeCols = parseInt(cols, 10) || 4;
    if (safeCols === 1) return 'grid-cols-1';
    if (safeCols === 2) return 'grid-cols-1 @2xl:grid-cols-2';
    if (safeCols === 3) return 'grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3';
    if (safeCols >= 4) return 'grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4';
    return 'grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4';
};

const ShowCaseBlock = ({ blockData, siteData, isEditorPreview }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const {
        columns = 4,
        source_type = 'category',
        title = '',
        alignment = 'center',
        height = 'auto', 
        titleFontFamily,
        styles = {} 
    } = blockData;
    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        title: titleFontFamily
    }, siteData);

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            try {
                let params = {};
                if (source_type === 'manual') {
                    if (blockData.selected_product_ids?.length > 0) {
                        params.ids = blockData.selected_product_ids.join(',');
                    } else {
                        setProducts([]);
                        setLoading(false);
                        return;
                    }
                } else {
                    if (blockData.category_id > 0) {
                        params.category = blockData.category_id;
                    }
                    params.limit = 20;
                    if (siteData?.id) params.siteId = siteData.id;
                }
                const res = await apiClient.get('/products', { params });
                const enrichedProducts = res.data.map(p => ({
                    ...p,
                    site_path: siteData?.site_path,
                    site_name: siteData?.title
                }));
                setProducts(enrichedProducts);
            } catch (error) {
                console.error("Error loading products:", error);
            } finally {
                setLoading(false);
            }
        };
        if (siteData?.id || source_type === 'manual') fetchProducts();
    }, [blockData.selected_product_ids, blockData.category_id, source_type, siteData?.id, siteData?.site_path, siteData?.title]);
    const heightClasses = {
        small: 'min-h-[300px]',
        medium: 'min-h-[400px] @3xl:min-h-[500px]',
        large: 'min-h-[500px] @3xl:min-h-[700px]',
        full: 'min-h-[calc(100vh-80px)]',
        auto: 'min-h-auto'
    };
    
    const currentHeightClass = heightClasses[height] || 'min-h-auto';
    const isFixedHeight = height !== 'auto';
    const uniqueClass = `showcase-${blockData.block_id || blockData.id || 'preview'}`;
    const alignmentClasses = {
        center: 'justify-center',
        right: 'justify-end',
        start: 'justify-start'
    };

    const containerAlignmentClass = isFixedHeight ? 'justify-center' : 'justify-start';
    if (products.length === 0 && !loading) {
        return (
            <div 
                style={{ 
                    ...styles,
                    backgroundColor: 'var(--site-bg)',
                    ...cssVariables
                }} 
                className={`
                    py-10 @2xl:py-12 @3xl:py-16 w-full flex flex-col
                    ${currentHeightClass}
                    ${containerAlignmentClass}
                    ${uniqueClass}
                `}
            >
                <RenderFonts />
                <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
                <div className="px-4 @2xl:px-6 @3xl:px-8 w-full max-w-300 mx-auto">
                    {title && (
                        <h2 
                            className="mb-8 @3xl:mb-12 text-(--site-text-primary) text-3xl @2xl:text-4xl @3xl:text-5xl font-bold leading-tight tracking-tight"
                            style={{ 
                                textAlign: alignment, 
                                fontFamily: fontStyles.title,
                            }}
                        >
                            {title}
                        </h2>
                    )}
                    <div 
                        className={`
                            flex flex-col items-center justify-center text-center p-10 @3xl:p-14 
                            w-full mx-auto rounded-2xl border-2 border-dashed
                        `}
                        style={{ 
                            borderColor: 'color-mix(in srgb, var(--site-text-primary) 15%, transparent)',
                            backgroundColor: 'color-mix(in srgb, var(--site-text-primary) 2%, transparent)',
                            minHeight: currentHeightClass === 'min-h-auto' ? '300px' : 'auto'
                        }}
                    >
                        <div 
                            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--site-accent) 10%, transparent)' }}
                        >
                             <ShoppingBag size={36} style={{ color: 'var(--site-accent)' }} strokeWidth={1.5} />
                        </div>
                        <h4 className="m-0 mb-2 font-medium text-xl" style={{ color: 'var(--site-text-primary)' }}>Вітрина товарів</h4>
                        <p className="m-0 max-w-md text-base leading-relaxed" style={{ color: 'var(--site-text-secondary)' }}>
                             Тут будуть відображатись ваші товари.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            style={{ 
                ...styles,
                backgroundColor: 'var(--site-bg)',
                ...cssVariables
            }} 
            className={`
                py-10 @2xl:py-12 @3xl:py-16 w-full flex flex-col
                ${currentHeightClass}
                ${containerAlignmentClass}
                ${uniqueClass}
            `}
        >
            <RenderFonts />
            <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
            <div className="px-4 @2xl:px-6 @3xl:px-8 w-full max-w-300 mx-auto">
                {title && (
                    <h2 
                        className="mb-8 @3xl:mb-12 text-(--site-text-primary) text-3xl @2xl:text-4xl @3xl:text-5xl font-bold leading-tight tracking-tight"
                        style={{ 
                            textAlign: alignment, 
                            fontFamily: fontStyles.title,
                        }}
                    >
                        {title}
                    </h2>
                )}
                
                {loading ? (
                    <div className="flex justify-center items-center p-12 w-full">
                        <div className="w-8 h-8 border-4 border-(--site-accent) border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className={`grid gap-4 @2xl:gap-6 @5xl:gap-8 w-full ${alignmentClasses[alignment] || 'justify-center'} ${getGridColsClass(columns)}`}>
                        {products.map(product => (
                            <div key={product.id} className="h-full w-full flex justify-center">
                                <ProductCard 
                                    product={product} 
                                    isEditorPreview={isEditorPreview} 
                                    siteData={siteData}
                                    fontStyles={fontStyles}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(ShowCaseBlock, areBlockPropsEqual);