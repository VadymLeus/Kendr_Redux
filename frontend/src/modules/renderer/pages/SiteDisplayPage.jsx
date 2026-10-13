// frontend/src/modules/renderer/pages/SiteDisplayPage.jsx
import React, { useContext, useEffect, useState, useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import apiClient from '../../../shared/api/api';
import BlockRenderer from '../../editor/core/BlockRenderer';
import { AuthContext } from '../../../app/providers/AuthContext';
import NotFoundPage from '../../../pages/NotFoundPage';
import MaintenancePage from '../../../pages/MaintenancePage';
import useScrollToHash from '../../../shared/hooks/useScrollToHash';
import CookieBanner from '../components/CookieBanner';
import FontLoader from '../components/FontLoader';
import SiteControls from '../components/SiteControls';
import ReportModal from '../../../shared/ui/complex/ReportModal';
import { BASE_URL } from '../../../shared/config';
import { normalizeGlobalBlocks } from '../../editor/core/globalBlocks';
import { isHeaderType } from '../../editor/core/globalBlockTypes';
import { resolveAccentColor } from '../../../shared/utils/themeUtils';
import { Loader2, Layers } from 'lucide-react';

const SiteDisplayPage = () => {
    const { siteData, isSiteLoading } = useOutletContext();
    const { site_path } = useParams();
    const { user } = useContext(AuthContext);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [show404, setShow404] = useState(false);
    useScrollToHash();
    const themeSettings = useMemo(() => {
        if (!siteData) return {};
        let ts = siteData.theme_settings;
        if (typeof ts === 'string') {
            try { ts = JSON.parse(ts); } catch (e) { ts = {}; }
        }
        return ts || {};
    }, [siteData]);

    const isSiteDark = siteData?.site_theme_mode === 'dark';
    const siteBg = isSiteDark ? '#1a202c' : '#f7fafc';
    const siteText = isSiteDark ? '#f7fafc' : '#1a202c';
    const siteCardBg = isSiteDark ? '#2d3748' : '#ffffff';
    const siteBorder = isSiteDark ? '#4a5568' : '#e2e8f0';
    const siteAccent = resolveAccentColor(siteData?.site_theme_accent || 'orange');
    const siteIsolationStyles = { 
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
        siteIsolationStyles['--site-accent-rgb'] = `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
    }
    
    useEffect(() => {
        if (!isSiteLoading && siteData && siteData.page && siteData.page.is_homepage) {
            apiClient.get(`/sites/${site_path}`, { params: { increment_view: 'true' } })
                .catch(err => console.warn("View counter error:", err));
        }
    }, [isSiteLoading, siteData, site_path]);
    
    const isMissingData = !siteData || !siteData.page;
    useEffect(() => {
        let timer;
        if (!isSiteLoading && isMissingData) {
            timer = setTimeout(() => setShow404(true), 300);
        } else {
            setShow404(false);
        }
        return () => clearTimeout(timer);
    }, [isSiteLoading, isMissingData]);
    
    if (isSiteLoading || (isMissingData && !show404)) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', paddingTop: '20vh', color: 'var(--platform-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Loader2 size={40} className="animate-spin mb-4" />
                <p>Завантаження сторінки...</p>
            </div>
        );
    }
    
    if (isMissingData && show404) return <NotFoundPage />;
    const isOwner = user && user.id === siteData.user_id;
    const isStaff = user && (user.role === 'admin' || user.role === 'moderator');
    if (siteData.status === 'private' && !isOwner && !isStaff) {
        return <NotFoundPage />;
    }
    if ((siteData.status === 'maintenance' || siteData.status === 'suspended') && !isOwner && !isStaff) {
        return <MaintenancePage logoUrl={siteData.logo_url} siteName={siteData.title} />;
    }
    const page = siteData.page;
    const titlePart = page.seo_title || page.name;
    const sitePart = siteData.site_title_seo || siteData.title;
    const finalTitle = `${titlePart} | ${sitePart}`;
    const description = page.seo_description || `Сторінка ${page.name} на сайті ${siteData.title}`;
    const favicon = siteData.favicon_url
        ? (siteData.favicon_url.startsWith('http')
            ? siteData.favicon_url
            : `${BASE_URL}${siteData.favicon_url.startsWith('/') ? '' : '/'}${siteData.favicon_url}`)
        : '/icon-light.webp';
        
    let pageBlocks = [];
    try {
        let parsedBlocks = Array.isArray(siteData.page.block_content)
            ? siteData.page.block_content
            : JSON.parse(siteData.page.block_content || '[]');
        pageBlocks = normalizeGlobalBlocks(parsedBlocks, siteData);
    } catch (e) {
        console.error("Error parsing blocks:", e);
    }

    const hasHeader = pageBlocks.some(block => isHeaderType(block.type));
    const layoutStyle = {
        display: 'flex', flexDirection: 'column', minHeight: '100dvh',
        width: '100%', margin: 0, padding: 0,
        backgroundColor: 'var(--site-bg)', 
        color: 'var(--site-text-primary)'
    };

    const mainContentStyle = {
        flex: '1', display: 'flex', flexDirection: 'column',
        width: '100%', marginBottom: '0'
    };

    const footerStyle = {
        flexShrink: 0, backgroundColor: 'var(--site-bg)',
        borderTop: '1px solid var(--site-border-color)',
        width: '100%', margin: 0, padding: 0, marginTop: '0'
    };

    const copyrightStyle = {
        textAlign: 'center', padding: '1.5rem', fontSize: '0.8rem',
        color: 'var(--site-text-secondary)', width: '100%', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
    };

    return (
        <div
            className="@container site-root relative site-theme-context site-theme-preview" 
            style={{ ...layoutStyle, ...siteIsolationStyles }}
        >
            <Helmet>
                <title>{finalTitle}</title>
                <meta name="description" content={description} />
                {page.seo_keywords && <meta name="keywords" content={page.seo_keywords} />}
                <link rel="icon" type="image/webp" href={favicon} />
                <meta property="og:title" content={finalTitle} />
                <meta property="og:description" content={description} />
                <meta property="og:image" content={siteData.logo_url ? (siteData.logo_url.startsWith('http') ? siteData.logo_url : `${BASE_URL}${siteData.logo_url}`) : favicon} />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={window.location.href} />
            </Helmet>
            <style>
                {`
                .site-theme-preview { font-family: var(--site-font-main); }
                .site-theme-preview * { box-sizing: border-box; }
                .site-theme-preview .site-block { background: var(--site-bg); color: var(--site-text-primary); font-family: var(--site-font-main); }
                .site-theme-preview .site-heading { font-family: var(--site-font-headings); color: var(--site-text-primary); }
                `}
            </style>
            {!hasHeader && <SiteControls siteData={siteData} />}
            {siteData && siteData.theme_settings && (
                <FontLoader fontHeading={siteData.theme_settings.font_heading} fontBody={siteData.theme_settings.font_body} />
            )}
            <main 
                className="site-wysiwyg-wrapper flex-1 flex flex-col" 
                style={mainContentStyle}
            >
                {pageBlocks && pageBlocks.length > 0 ? (
                    <BlockRenderer blocks={pageBlocks} siteData={siteData} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[60vh] w-full" style={{ backgroundColor: 'var(--site-bg)' }}>
                        <div className="mb-6 opacity-40">
                            <Layers size={64} style={{ color: 'var(--site-text-primary)' }} />
                        </div>
                        <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--site-text-primary)' }}>Сторінка в розробці</h1>
                        <p className="max-w-md mx-auto text-[1.05rem]" style={{ color: 'var(--site-text-secondary)' }}>
                            Власник сайту ще не додав контент на цю сторінку. Завітайте сюди трохи згодом!
                        </p>
                    </div>
                )}
            </main>
            <footer style={footerStyle}>
                <div style={copyrightStyle}>
                    <span>Powered by Kendr</span>
                    {!isOwner && (
                        <>
                            <span>•</span>
                            <button
                                onClick={() => setIsReportOpen(true)}
                                style={{ background: 'transparent', border: 'none', color: 'inherit', textDecoration: 'none', cursor: 'pointer', fontSize: 'inherit', opacity: 0.8, padding: 0 }}
                                onMouseEnter={(e) => e.target.style.color = 'var(--site-danger, #ef4444)'}
                                onMouseLeave={(e) => e.target.style.color = 'inherit'}
                                title="Report Abuse / Поскаржитись"
                            >
                                Report
                            </button>
                        </>
                    )}
                </div>
            </footer>
            <CookieBanner 
                enabled={siteData?.cookie_banner_enabled} 
                text={siteData?.cookie_banner_text} 
                siteId={siteData?.id} 
                size={siteData?.cookie_banner_size}
                position={siteData?.cookie_banner_position}
                blur={siteData?.cookie_banner_blur}
            />
            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} siteId={siteData.id} />
        </div>
    );
};

export default SiteDisplayPage;