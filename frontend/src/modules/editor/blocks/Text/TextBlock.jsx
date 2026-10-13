// frontend/src/modules/editor/blocks/Text/TextBlock.jsx
import React from 'react';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { areBlockPropsEqual } from '../../core/blockProps';

const TextBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const { 
        content = '', 
        tag = 'p', 
        fontFamily, 
        alignment = 'left',
        isBold = false,
        isItalic = false,
        isUnderline = false,
        height = 'small',
        textIndent = 0,
        styles = {}
    } = blockData;
    
    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        main: fontFamily
    }, siteData);

    const ValidTag = ['p', 'h1', 'h2', 'h3'].includes(tag) ? tag : 'p';
    const tagClasses = {
        h1: 'text-4xl @2xl:text-5xl @3xl:text-6xl font-extrabold leading-[1.15] tracking-tight',
        h2: 'text-3xl @2xl:text-4xl @3xl:text-5xl font-bold leading-[1.2] tracking-tight',
        h3: 'text-2xl @2xl:text-3xl @3xl:text-4xl font-semibold leading-[1.3]',
        p:  'text-base @2xl:text-lg @3xl:text-xl font-normal leading-relaxed'
    };

    const heightClasses = { 
        small: 'min-h-auto', 
        medium: 'min-h-[40vh] @3xl:min-h-[400px]', 
        large: 'min-h-[60vh] @3xl:min-h-[600px]', 
        full: 'min-h-[calc(100vh-60px)]' 
    };

    const paragraphs = content ? content.split('\n') : [];
    const uniqueClass = `text-scope-${blockData.block_id || blockData.id || 'preview'}`;
    return (
        <div 
            className={`
                ${uniqueClass}
                w-full wrap-break-word flex flex-col justify-center 
                px-4 sm:px-6 md:px-8
                ${heightClasses[height] || heightClasses.small}
            `}
            style={{ 
                textAlign: alignment,
                backgroundColor: 'var(--site-bg, transparent)',
                color: 'var(--site-text-primary, inherit)',
                ...styles,
                ...style,
                ...cssVariables
            }}
        >
            <RenderFonts />
            <style>{`.${uniqueClass} { ${fontStyles.cssVars || ''} }`}</style>
            {paragraphs.length > 0 ? (
                paragraphs.map((line, index) => (
                    <ValidTag 
                        key={index}
                        className={`
                            ${tagClasses[ValidTag]}
                            ${isBold ? 'font-bold!' : ''} 
                            ${isItalic ? 'italic' : 'not-italic'}
                            ${isUnderline ? 'underline underline-offset-4' : 'no-underline'}
                            ${index === paragraphs.length - 1 ? 'mb-0' : 'mb-[1em]'}
                        `}
                        style={{
                            fontFamily: fontStyles.main,
                            color: 'inherit',
                            display: 'block',
                            marginTop: 0,
                            whiteSpace: 'pre-wrap', 
                            minHeight: line.trim() === '' ? '1em' : 'auto',
                            textIndent: textIndent ? `${textIndent}px` : '0'
                        }}
                    >
                        {line || <br/>} 
                    </ValidTag>
                ))
            ) : (
                isEditorPreview && (
                    <div className="opacity-50 italic py-2.5 text-(--site-text-secondary)">
                        Натисніть, щоб додати текст...
                    </div>
                )
            )}
        </div>
    );
};

export default React.memo(TextBlock, areBlockPropsEqual);