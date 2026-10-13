// frontend/src/modules/editor/blocks/Accordion/AccordionBlock.jsx
import React from 'react';
import AccordionItem from './AccordionItem';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { HelpCircle } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const AccordionBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const { 
        items = [], 
        titleFontFamily, 
        contentFontFamily,
        height = 'auto'
    } = blockData;

    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        title: titleFontFamily,
        content: contentFontFamily
    }, siteData);
    const uniqueClass = `accordion-scope-${blockData.block_id || blockData.id || 'preview'}`;
    const heightClasses = {
        small: 'min-h-[200px] @3xl:min-h-[300px]',
        medium: 'min-h-[350px] @3xl:min-h-[500px]',
        large: 'min-h-[500px] @3xl:min-h-[700px]',
        full: 'min-h-[calc(100vh-60px)]',
        auto: 'min-h-auto'
    };

    const currentHeightClass = heightClasses[height] || heightClasses.auto;
    if (items.length === 0) {
        return (
            <div 
                className={`
                    flex flex-col items-center justify-center gap-4 text-center p-8 @3xl:p-12 
                    bg-(--site-card-bg) w-full rounded-2xl mx-auto max-w-300
                    ${currentHeightClass}
                    ${isEditorPreview ? 'border border-dashed border-(--platform-border-color)' : ''}
                `}
                style={style}
            >
                <div className="text-(--site-accent) opacity-80 bg-(--site-accent)/10 p-4 rounded-full mb-2">
                     <HelpCircle size={40} />
                </div>
                 <h4 className="text-(--site-text-primary) m-0 font-semibold text-lg @3xl:text-xl">FAQ / Акордеон</h4>
                <p className="text-(--site-text-secondary) m-0 max-w-md text-sm @3xl:text-base">
                     Цей блок поки порожній. Додайте питання та відповіді у налаштуваннях справа.
                </p>
            </div>
        );
    }

    return (
        <div 
            className={`
                w-full flex flex-col justify-center py-12 @2xl:py-16 @3xl:py-24
                ${currentHeightClass}
                ${uniqueClass}
            `}
            style={{
                ...style,
                ...cssVariables,
                backgroundColor: 'var(--site-bg)'
            }}
        >
            <RenderFonts />
            <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
            <div className="w-full max-w-200 mx-auto flex flex-col gap-3 @2xl:gap-4 px-4 @2xl:px-6 @3xl:px-8 relative z-10">
                {items.map((item) => (
                    <AccordionItem
                        key={item.id}
                        item={item}
                        titleFont={fontStyles.title}
                        contentFont={fontStyles.content}
                    />
                ))}
            </div>
        </div>
    );
};

export default React.memo(AccordionBlock, areBlockPropsEqual);