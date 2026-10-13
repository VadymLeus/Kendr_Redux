// frontend/src/shared/ui/complex/SitePreviewer.jsx
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import BlockRenderer from '../../../modules/editor/core/BlockRenderer';
import FontLoader from '../../../modules/renderer/components/FontLoader';
import { resolveAccentColor } from '../../utils/themeUtils';
import CustomSelect from '../elements/CustomSelect';
import LoadingState from './LoadingState';
import { getDefaultBlockData } from '../../../modules/editor/core/blockRegistry';
import { Lock, Layers, Monitor, Smartphone, Star } from 'lucide-react';

const DeviceIframe = ({ children, className, style }) => {
    const [iframeRef, setIframeRef] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    useEffect(() => {
        if (!iframeRef) return;
        const doc = iframeRef.contentDocument;
        if (!doc) return;
        const writeDoc = () => {
            doc.open();
            doc.write('<!DOCTYPE html><html><head></head><body><div id="iframe-root" style="height: 100%; display: flex; flex-direction: column;"></div></body></html>');
            doc.close();
            const head = doc.head;
            document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
                head.appendChild(el.cloneNode(true));
            });
            const baseStyle = doc.createElement('style');
            baseStyle.innerHTML = `
                html, body { height: 100%; margin: 0; padding: 0; overflow-x: hidden; background-color: transparent; }
                * { box-sizing: border-box; }
                ::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
                body { font-family: var(--site-font-main, inherit); color: var(--site-text-primary, inherit); display: flex; flex-direction: column; }
            `;
            head.appendChild(baseStyle);
            setIsLoaded(true);
        };

        const timer = setTimeout(writeDoc, 50);
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'STYLE' || (node.tagName === 'LINK' && node.rel === 'stylesheet')) {
                        doc.head.appendChild(node.cloneNode(true));
                    }
                });
            });
        });
        observer.observe(document.head, { childList: true });
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [iframeRef]);

    return (
        <iframe
            ref={setIframeRef}
            className={className}
            style={style}
            title="Mobile Preview"
        >
            {isLoaded && iframeRef.contentDocument && createPortal(
                children,
                iframeRef.contentDocument.getElementById('iframe-root')
            )}
        </iframe>
    );
};

const SitePreviewer = ({ 
    previewData, 
    currentBlocks, 
    isLoading = false,
    emptyTitle = "Оберіть шаблон",
    emptyDescription = "Для попереднього перегляду",
    url = "kendr.site",
    userTitle = "",
    userLogo = ""
}) => {
    const [viewMode, setViewMode] = useState('desktop');
    const [isSwitchingView, setIsSwitchingView] = useState(false);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const containerRef = useRef(null);
    const [isAutoMobile, setIsAutoMobile] = useState(false);
    const isAutoMobileRef = useRef(false);
    const lastUserModeRef = useRef('desktop');
    const handleViewModeChange = useCallback((mode, isAuto = false) => {
        if (!isAuto) {
            lastUserModeRef.current = mode;
        }
        setViewMode(prev => {
            if (prev === mode) return prev;
            setIsSwitchingView(true);
            setTimeout(() => setIsSwitchingView(false), 500);
            return mode;
        });
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            const width = entries[0].contentRect.width;
            const THRESHOLD = 768;
            if (width < THRESHOLD && !isAutoMobileRef.current) {
                isAutoMobileRef.current = true;
                setIsAutoMobile(true);
                handleViewModeChange('mobile', true);
            } else if (width >= THRESHOLD && isAutoMobileRef.current) {
                isAutoMobileRef.current = false;
                setIsAutoMobile(false);
                handleViewModeChange(lastUserModeRef.current, true);
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, [handleViewModeChange]);

    useEffect(() => {
        setActivePageIndex(0);
    }, [previewData?.id]);

    const handlePreviewInteraction = (e) => {
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('.js-allow-click')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
    };

    const simulatedSiteData = useMemo(() => {
        const baseSettings = previewData?.siteData || previewData || {};
        const themeSettings = previewData?.theme || baseSettings?.theme_settings || {};
        const headerContent = 
            baseSettings.header_content || 
            previewData?.header_content || 
            previewData?.header || 
            themeSettings?.header_content;
        const footerContent = 
            baseSettings.footer_content || 
            previewData?.footer_content || 
            previewData?.footer || 
            themeSettings?.footer_content;
        return {
            ...baseSettings,
            header_content: headerContent,
            footer_content: footerContent,
            id: 'preview',
            title: userTitle || baseSettings.title || 'My Site',
            logo_url: userLogo || baseSettings.logo_url || null,
            site_theme_mode: themeSettings.mode || themeSettings.site_theme_mode || 'light',
            site_theme_accent: themeSettings.accent || themeSettings.site_theme_accent || 'orange',
            theme_settings: themeSettings,
            site_name: userTitle || baseSettings.title || 'My Site'
        };
    }, [previewData, userTitle, userLogo]);

    const pageOptions = useMemo(() => {
        if (!previewData?.pages) return [];
        const pagesWithOriginalIndex = previewData.pages.map((p, index) => ({ ...p, originalIndex: index }));
        const sortedPages = pagesWithOriginalIndex.sort((a, b) => {
            if (a.is_homepage && !b.is_homepage) return -1;
            if (!a.is_homepage && b.is_homepage) return 1;
            return 0; 
        });
        return sortedPages.map((p) => {
            let label = p.title || p.name || p.slug || `Сторінка ${p.originalIndex + 1}`;
            let result = { value: p.originalIndex, label: label };

            if (p.is_homepage) {
                result.icon = Star;
                result.iconStyle = { flexShrink: 0, color: 'var(--platform-accent)', fill: 'var(--platform-accent)' };
                result.iconProps = { filled: true };
            }
            return result;
        });
    }, [previewData?.pages]);

    const displayUrl = useMemo(() => {
        if (!url) return '';
        const activePage = previewData?.pages?.[activePageIndex];
        if (activePage && !activePage.is_homepage && activePage.slug) {
            return `${url}/${activePage.slug}`;
        }
        return url;
    }, [url, previewData?.pages, activePageIndex]);

    const siteIsolationStyles = useMemo(() => {
        const isSiteDark = simulatedSiteData.site_theme_mode === 'dark';
        const siteBg = isSiteDark ? '#1a202c' : '#f7fafc';
        const siteText = isSiteDark ? '#f7fafc' : '#1a202c';
        const siteCardBg = isSiteDark ? '#2d3748' : '#ffffff';
        const siteBorder = isSiteDark ? '#4a5568' : '#e2e8f0';
        const siteAccent = resolveAccentColor(simulatedSiteData.site_theme_accent);
        const themeSettings = simulatedSiteData.theme_settings || {};
        const styles = {
            '--site-bg': siteBg,
            '--site-text-primary': siteText,
            '--site-text-secondary': isSiteDark ? '#a0aec0' : '#718096',
            '--site-card-bg': siteCardBg,
            '--site-border-color': siteBorder,
            '--site-accent': siteAccent,
            '--site-font-main': themeSettings.font_body || "'Inter', sans-serif",
            '--site-font-headings': themeSettings.font_heading || themeSettings.font_body || "'Inter', sans-serif"
        };
        let hex = siteAccent.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        if (hex.length === 6) {
            styles['--site-accent-rgb'] = `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
        }
        return styles;
    }, [simulatedSiteData]);

    const processBlocksWithGlobalData = useCallback((blocksArray) => {
        if (!Array.isArray(blocksArray)) return [];
        return blocksArray.map(block => {
            if (block.type === 'global-header' || block.type === 'header') {
                let globalData = { ...(block.data || {}) };
                const rawContent = simulatedSiteData.header_content;
                if (rawContent) {
                    try {
                        const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
                        if (Array.isArray(parsed)) {
                            const found = parsed.find(b => b.type === 'header' || b.type === 'global-header');
                            if (found?.data) globalData = { ...globalData, ...found.data };
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            if (parsed["0"] && parsed["0"].data) {
                                globalData = { ...globalData, ...parsed["0"].data };
                            }
                            const rootProps = { ...parsed };
                            delete rootProps["0"]; delete rootProps["type"]; delete rootProps["block_id"];
                            globalData = { ...globalData, ...rootProps };
                        }
                    } catch (e) {
                        console.error("Header parse error", e);
                    }
                }
                const defaultData = getDefaultBlockData('global-header');
                if (Object.keys(globalData).length === 0) {
                    globalData = defaultData;
                } else {
                    if (!globalData.nav_items || globalData.nav_items.length === 0) globalData.nav_items = defaultData.nav_items;
                    if (globalData.site_title === undefined) globalData.site_title = defaultData.site_title;
                }

                return { ...block, type: 'global-header', data: globalData };
            }
            if (block.type === 'global-footer' || block.type === 'footer') {
                let globalData = { ...(block.data || {}) };
                const rawContent = simulatedSiteData.footer_content;
                if (rawContent) {
                    try {
                        const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
                        if (Array.isArray(parsed)) {
                            const found = parsed.find(b => b.type === 'footer' || b.type === 'global-footer');
                            if (found?.data) globalData = { ...globalData, ...found.data };
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            if (parsed["0"] && parsed["0"].data) {
                                globalData = { ...globalData, ...parsed["0"].data };
                            }
                            const rootProps = { ...parsed };
                            delete rootProps["0"]; delete rootProps["type"]; delete rootProps["block_id"];
                            globalData = { ...globalData, ...rootProps };
                        }
                    } catch (e) {
                        console.error("Footer parse error", e);
                    }
                }
                const defaultData = getDefaultBlockData('global-footer');
                if (Object.keys(globalData).length === 0) {
                    globalData = defaultData;
                }
                return { ...block, type: 'global-footer', data: globalData };
            }
            return block;
        });
    }, [simulatedSiteData]);

    const headerBlocks = useMemo(() => {
        let hData = previewData?.header || simulatedSiteData.header_content;
        if (!hData) return [];
        if (Array.isArray(hData) && hData.length > 0 && hData[0].type) {
            return processBlocksWithGlobalData(hData);
        }
        return [];
    }, [previewData, simulatedSiteData, processBlocksWithGlobalData]);
    
    const footerBlocks = useMemo(() => {
        let fData = previewData?.footer || simulatedSiteData.footer_content;
        if (!fData) return [];
        if (Array.isArray(fData) && fData.length > 0 && fData[0].type) {
            return processBlocksWithGlobalData(fData);
        }
        return [];
    }, [previewData, simulatedSiteData, processBlocksWithGlobalData]);

    const mainBlocks = useMemo(() => {
        const activeBlocks = previewData?.pages?.[activePageIndex]?.blocks || currentBlocks || [];
        return processBlocksWithGlobalData(activeBlocks);
    }, [previewData?.pages, activePageIndex, currentBlocks, processBlocksWithGlobalData]);

    const hasCanvasHeader = useMemo(() => mainBlocks.some(block => block.type === 'global-header' || block.type === 'header'), [mainBlocks]);
    const hasCanvasFooter = useMemo(() => mainBlocks.some(block => block.type === 'global-footer' || block.type === 'footer'), [mainBlocks]);
    const previewContent = (
        <div className="flex flex-col min-h-full w-full relative">
            {previewData?.theme && (
                <FontLoader fontHeading={previewData.theme.font_heading} fontBody={previewData.theme.font_body} />
            )}
            <div className="site-wysiwyg-wrapper flex-1 flex flex-col" style={{ backgroundColor: 'transparent' }}>
                {headerBlocks.length > 0 && !hasCanvasHeader && (
                    <BlockRenderer blocks={headerBlocks} siteData={simulatedSiteData} isEditorPreview={false} />
                )}
                <main className="flex-1 flex flex-col">
                    {mainBlocks.length > 0 ? (
                        <BlockRenderer blocks={mainBlocks} siteData={simulatedSiteData} isEditorPreview={false} />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 min-h-[50vh]">
                            <div className="p-4 sm:p-5 rounded-2xl mb-4 sm:mb-5 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--site-text-primary) 5%, transparent)' }}>
                                <Layers size={36} className="sm:w-10.5 sm:h-10.5" strokeWidth={1.5} style={{ color: 'var(--site-text-primary)', opacity: 0.6 }}/>
                            </div>
                            <p className="text-lg sm:text-xl font-medium" style={{ color: 'var(--site-text-primary)' }}>Шаблон порожній</p>
                        </div>
                    )}
                </main>
                {footerBlocks.length > 0 && !hasCanvasFooter && (
                    <BlockRenderer blocks={footerBlocks} siteData={simulatedSiteData} isEditorPreview={false} />
                )}
            </div>
        </div>
    );

    const innerContainerProps = {
        className: `@container flex-1 site-theme-preview overflow-y-auto ${viewMode === 'mobile' ? 'h-full w-full flex flex-col hide-mobile-scrollbar' : 'site-scrollbar'}`,
        'data-site-mode': simulatedSiteData.site_theme_mode,
        'data-site-accent': simulatedSiteData.site_theme_accent,
        style: siteIsolationStyles,
        onClickCapture: handlePreviewInteraction, 
        onSubmitCapture: (e) => e.preventDefault()
    };
    return (
        <div ref={containerRef} className="flex-1 flex flex-col h-full bg-(--platform-bg) relative overflow-hidden min-h-0 min-w-0 pb-16 md:pb-0">
            <style>{`
                .site-theme-preview {
                    font-family: var(--site-font-main);
                    background-color: var(--site-bg);
                    color: var(--site-text-primary);
                }
                .site-theme-preview * { box-sizing: border-box; }
                .site-scrollbar { scrollbar-width: thin; scrollbar-color: var(--site-accent) var(--site-bg); }
                .site-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .site-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .site-scrollbar::-webkit-scrollbar-thumb { background-color: var(--site-accent); border-radius: 10px; }
                .site-scrollbar::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
                .hide-mobile-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
                .hide-mobile-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
            <div className="h-14 bg-(--platform-card-bg) border-b border-(--platform-border-color) flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0 shadow-sm relative z-10 justify-between">
                <div className="hidden xl:flex gap-2 w-16 sm:w-24 shrink-0">
                     <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] opacity-80"></div>
                     <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] opacity-80"></div>
                     <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] opacity-80"></div>
                </div>
                <div className="flex-1 flex items-center gap-2 justify-center xl:justify-start 2xl:justify-center min-w-0">
                     <div className="hidden lg:flex bg-(--platform-input-bg) h-9 rounded-md border border-(--platform-border-color) items-center px-2 sm:px-3 text-xs text-(--platform-text-secondary) shadow-sm transition-all max-w-37.5 xl:max-w-sm flex-1 min-w-0">
                         <span className="text-(--platform-text-secondary) mr-1 sm:mr-2 opacity-50 shrink-0"><Lock size={12} /></span>
                         <span className="text-(--platform-text-primary) truncate">{displayUrl}</span>
                     </div>
                     {pageOptions.length > 1 && (
                         <div className="w-28 sm:w-36 md:w-48 shrink min-w-25 max-w-full">
                             <CustomSelect 
                                 value={activePageIndex}
                                 onChange={(e) => setActivePageIndex(parseInt(e.target.value, 10))}
                                 options={pageOptions}
                                 style={{ margin: 0, height: '36px', minHeight: '36px' }}
                             />
                         </div>
                     )}
                </div>
                <div className="flex items-center justify-end gap-1 shrink-0 ml-auto">
                    <button
                        onClick={() => handleViewModeChange('desktop', false)}
                        disabled={isAutoMobile}
                        className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${viewMode === 'desktop' ? 'bg-(--platform-border-color) text-(--platform-text-primary)' : 'text-(--platform-text-secondary) hover:text-(--platform-text-primary) hover:bg-(--platform-hover-bg)'} ${isAutoMobile ? 'opacity-40 cursor-not-allowed' : ''}`}
                        title={isAutoMobile ? "Недостатньо місця (збільшіть вікно)" : "ПК версія"}
                    >
                        <Monitor size={16} />
                    </button>
                    <button
                        onClick={() => handleViewModeChange('mobile', false)}
                        className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${viewMode === 'mobile' ? 'bg-(--platform-border-color) text-(--platform-text-primary)' : 'text-(--platform-text-secondary) hover:text-(--platform-text-primary) hover:bg-(--platform-hover-bg)'}`}
                        title="Мобільна версія"
                    >
                        <Smartphone size={16} />
                    </button>
                </div>
            </div>
            <div className={`flex-1 overflow-hidden relative min-h-0 flex items-center justify-center transition-all duration-300 ${viewMode === 'mobile' ? 'bg-[#111827] py-4 sm:py-6' : 'p-0'}`}>
                {isSwitchingView ? (
                    <div className={`shadow-2xl overflow-hidden flex flex-col bg-(--platform-bg) mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${viewMode === 'mobile' ? 'w-93.75 sm:w-103.5 max-w-[95%] h-full max-h-212.5 border-12 sm:border-14 border-slate-900 rounded-[2.5rem] sm:rounded-[3rem] ring-1 ring-white/10' : 'w-full h-full'}`}>
                        <div className="h-full flex items-center justify-center w-full">
                            <LoadingState title="Зміна масштабу..." layout="component" iconSize={48} />
                        </div>
                    </div>
                ) : previewData && !isLoading ? (
                    viewMode === 'mobile' ? (
                        <DeviceIframe 
                            className="shadow-2xl overflow-hidden flex flex-col bg-(--site-bg) mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] w-93.75 sm:w-103.5 max-w-[95%] h-full max-h-212.5 border-12 sm:border-14 border-slate-900 rounded-[2.5rem] sm:rounded-[3rem] ring-1 ring-white/10"
                        >
                            <div {...innerContainerProps}>
                                {previewContent}
                            </div>
                        </DeviceIframe>
                    ) : (
                        <div className="shadow-2xl overflow-hidden flex flex-col bg-(--site-bg) mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] w-full h-full">
                            <div {...innerContainerProps}>
                                {previewContent}
                            </div>
                        </div>
                    )
                ) : (
                    <div className="shadow-2xl overflow-hidden flex flex-col bg-(--site-bg) mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] w-full h-full">
                        <div className="h-full flex flex-col items-center justify-center p-8 sm:p-12 min-h-full">
                            <div className="p-4 sm:p-5 rounded-2xl mb-4 sm:mb-5 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--site-text-primary) 5%, transparent)' }}>
                                <Layers size={36} className="sm:w-10.5 sm:h-10.5" strokeWidth={1.5} style={{ color: 'var(--site-text-primary)', opacity: 0.6 }}/>
                            </div>
                            <p className="text-lg sm:text-xl font-medium text-center" style={{ color: 'var(--site-text-primary)' }}>{emptyTitle}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SitePreviewer;