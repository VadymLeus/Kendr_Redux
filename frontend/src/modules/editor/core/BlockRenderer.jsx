// frontend/src/modules/editor/core/BlockRenderer.jsx
import React, { Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import AnimationWrapper from '../../renderer/components/AnimationWrapper';
import { resolveSiteLink } from '../../../shared/utils/linkUtils';
import { getBlockComponent } from './blockRegistry';
import { AlertTriangle, Construction, Loader2 } from 'lucide-react';

const BlockRenderer = ({ 
    blocks, 
    siteData, 
    isEditorPreview = false, 
    emptyTitle = "Ця сторінка порожня", 
    emptyDescription = "Додайте блоки для створення контенту",
    isLayoutColumn = false,
    ...props 
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const bg = 'var(--site-bg)';
    const cardBg = 'var(--site-card-bg)';
    const borderColor = 'var(--site-border-color)';
    const textPrimary = 'var(--site-text-primary)';
    const textSecondary = 'var(--site-text-secondary)';
    const danger = 'var(--site-danger, #ef4444)';
    const headerBlock = blocks?.find(b => b.type === 'global-header' || b.type === 'header');
    const navItems = headerBlock?.data?.nav_items || [];
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return (
            <div
                className={`flex flex-col items-center justify-center text-center font-sans w-full transition-all duration-300
                    ${isLayoutColumn 
                        ? 'py-6 px-4 my-2 min-h-30 rounded-2xl' 
                        : 'py-12 px-6 rounded-lg my-4 min-h-[60vh]'
                    }
                `}
                style={{ 
                    color: textSecondary,
                    background: isLayoutColumn ? 'color-mix(in srgb, var(--site-text-primary) 3%, transparent)' : bg,
                    border: isEditorPreview ? `1px dashed ${borderColor}` : 'none',
                }}
            >
                <div className={`${isLayoutColumn ? 'mb-2' : 'mb-4'} opacity-50 flex justify-center`}>
                    <Construction size={isLayoutColumn ? 28 : 48} />
                </div>
                <h3 className={`font-medium font-inherit ${isLayoutColumn ? 'text-[0.95rem] mb-1' : 'text-lg mb-2'}`} style={{ color: textPrimary }}>
                    {emptyTitle}
                </h3>
                <p className={`m-0 font-inherit ${isLayoutColumn ? 'text-xs opacity-70' : 'text-[0.95rem]'}`}>
                    {emptyDescription}
                </p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full flex flex-col">
            {blocks.map((block, index) => {
                const Component = getBlockComponent(block.type);
                const elementId = block.data?.anchorId || undefined;
                if (!Component) {
                    console.warn(`Невідомий тип блоку: ${block.type}`);
                    return (
                        <div
                            key={block.block_id || index}
                            id={elementId}
                            className="p-6 rounded-lg my-2 text-center font-sans"
                            style={{
                                background: isEditorPreview ? 'rgba(229, 62, 62, 0.1)' : cardBg,
                                border: isEditorPreview ? `1px solid ${danger}` : `1px solid ${borderColor}`,
                                color: isEditorPreview ? danger : textPrimary,
                            }}
                        >
                            <div className="text-2xl mb-2 flex justify-center">
                                <AlertTriangle size={32} />
                            </div>
                            <div className="font-medium">Невідомий тип блоку</div>
                            <div className="text-sm mt-1 opacity-80">{block.type}</div>
                        </div>
                    );
                }
                const styles = block.data?.styles || {};
                const dynamicStyle = {
                    paddingTop: styles.paddingTop ? `${styles.paddingTop}px` : '60px',
                    paddingBottom: styles.paddingBottom ? `${styles.paddingBottom}px` : '60px'
                };
                const isHeader = block.type === 'global-header' || block.type === 'header';
                const isSticky = isHeader && block.data?.is_sticky && !isEditorPreview;
                return (
                    <div 
                        key={block.block_id || index}
                        id={elementId}
                        className={`w-full ${isSticky ? 'sticky top-0 z-85' : 'relative'}`}
                    >
                        {isHeader ? (
                            <Suspense
                                fallback={
                                    <div className="w-full flex items-center justify-center py-10">
                                        <Loader2 size={32} className="animate-spin text-(--platform-accent)" style={{ color: 'var(--site-accent, var(--platform-accent))' }} />
                                    </div>
                                }
                            >
                                <Component
                                    blockData={block.data}
                                    siteData={siteData}
                                    isEditorPreview={isEditorPreview}
                                    style={dynamicStyle} 
                                    {...props}
                                    block={block}
                                    onMenuToggle={() => !isEditorPreview && setIsMobileMenuOpen(true)}
                                />
                            </Suspense>
                        ) : (
                            <AnimationWrapper animationConfig={block.data?.animation}>
                                <Suspense
                                    fallback={
                                        <div className="w-full flex items-center justify-center py-10">
                                            <Loader2 size={32} className="animate-spin text-(--platform-accent)" style={{ color: 'var(--site-accent, var(--platform-accent))' }} />
                                        </div>
                                    }
                                >
                                    <Component
                                        blockData={block.data}
                                        siteData={siteData}
                                        isEditorPreview={isEditorPreview}
                                        style={dynamicStyle} 
                                        {...props}
                                        block={block}
                                        onMenuToggle={() => !isEditorPreview && setIsMobileMenuOpen(true)}
                                    />
                                </Suspense>
                            </AnimationWrapper>
                        )}
                    </div>
                );
            })}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-10000 flex justify-end">
                    <div 
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
                    />
                    <div 
                        className="relative w-[80%] max-w-75 h-full shadow-[-5px_0_25px_rgba(0,0,0,0.15)] p-6 flex flex-col"
                        style={{ backgroundColor: 'var(--site-bg, #ffffff)' }}
                    >
                        <button 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="self-end bg-transparent border-none cursor-pointer p-2"
                            style={{ color: 'var(--site-text-primary)' }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        <nav className="mt-8 flex flex-col gap-5">
                            {navItems.length > 0 ? (
                                navItems.map((item) => (
                                    <Link
                                        key={item.id}
                                        to={resolveSiteLink(item.link, siteData?.site_path)}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="text-[1.2rem] font-semibold no-underline pb-2 border-b"
                                        style={{
                                            color: 'var(--site-text-primary)',
                                            borderBottomColor: 'var(--site-border-color)'
                                        }}
                                    >
                                        {item.label}
                                    </Link>
                                ))
                            ) : (
                                <p className="text-center" style={{ color: textSecondary }}>Меню порожнє</p>
                            )}
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BlockRenderer;