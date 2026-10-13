// frontend/src/modules/shop/ProductDetailPage.jsx
import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import apiClient from '../../shared/api/api';
import { CartContext } from '../../app/providers/CartContext';
import { AuthContext } from '../../app/providers/AuthContext';
import BlockRenderer from '../editor/core/BlockRenderer';
import ProductCard from '../editor/ui/components/ProductCard'; 
import MaintenancePage from '../../pages/MaintenancePage'; 
import NotFoundPage from '../../pages/NotFoundPage';
import CookieBanner from '../renderer/components/CookieBanner';
import FontLoader from '../renderer/components/FontLoader';
import SiteControls from '../renderer/components/SiteControls';
import ReportModal from '../../shared/ui/complex/ReportModal';
import LoadingState from '../../shared/ui/complex/LoadingState';
import { getDefaultBlockData } from '../editor/core/blockRegistry';
import { resolveAccentColor } from '../../shared/utils/themeUtils';
import { BASE_URL } from '../../shared/config';
import { toast } from 'react-toastify';
import { Folder, Grid, Tag, ShoppingBag, Package, Star, Heart, Home, Gift, Truck, Zap, Camera, Music, Smartphone, Coffee, Briefcase, MapPin, Image as ImageIcon, Video, User, MessageSquare, Trash2 } from 'lucide-react';

const ICON_MAP = {
    folder: Folder, grid: Grid, tag: Tag, bag: ShoppingBag,
    box: Package, star: Star, heart: Heart, home: Home,
    gift: Gift, truck: Truck, zap: Zap, camera: Camera,
    music: Music, phone: Smartphone, coffee: Coffee, briefcase: Briefcase,
    map: MapPin, image: ImageIcon, video: Video, user: User
};

const safeParseFloat = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
};

const ProductDetailPage = () => {
    const { productId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToCart, cartItems } = useContext(CartContext);
    const { user } = useContext(AuthContext);
    const outletContext = useOutletContext() || {};
    const { siteData = null, isSiteLoading = false } = outletContext;
    const [product, setProduct] = useState(null);
    const [relatedProducts, setRelatedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isNotFound, setIsNotFound] = useState(false);
    const [isRestricted, setIsRestricted] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reviews, setReviews] = useState([]);
    const [visibleReviews, setVisibleReviews] = useState(5);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [purchaseStatus, setPurchaseStatus] = useState({ hasPurchased: false, hasReviewed: false });
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [imageScale, setImageScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
    const [isHovering, setIsHovering] = useState(false);
    const imageContainerRef = useRef(null);
    const [selectedOptions, setSelectedOptions] = useState({});
    const [priceData, setPriceData] = useState({
        finalPrice: 0, originalPrice: 0, activeDiscount: 0, isDiscounted: false
    });
    let pageBlocks = [];
    try {
        let parsedBlocks = Array.isArray(siteData?.page?.block_content)
            ? siteData.page.block_content
            : JSON.parse(siteData?.page?.block_content || '[]');
        pageBlocks = parsedBlocks;
    } catch (e) {
        console.error("Error parsing blocks:", e);
    }
    const hasHeader = pageBlocks.some(block => block.type === 'header' || block.type === 'global-header');
    const hasFooter = pageBlocks.some(block => block.type === 'footer' || block.type === 'global-footer');
    const headerBlocks = useMemo(() => {
        if (!hasHeader) return [];
        let globalData = typeof siteData?.header_content === 'string' 
            ? JSON.parse(siteData.header_content || '{}') 
            : (siteData?.header_content || {});
        if (Object.keys(globalData).length === 0) globalData = getDefaultBlockData('global-header');
        return [{ block_id: 'sys-global-header', type: 'global-header', data: globalData }];
    }, [siteData?.header_content, hasHeader]);
    const footerBlocks = useMemo(() => {
        if (!hasFooter) return [];
        let globalData = typeof siteData?.footer_content === 'string' 
            ? JSON.parse(siteData.footer_content || '{}') 
            : (siteData?.footer_content || {});
        if (Object.keys(globalData).length === 0) globalData = getDefaultBlockData('global-footer');
        return [{ block_id: 'sys-global-footer', type: 'global-footer', data: globalData }];
    }, [siteData?.footer_content, hasFooter]);
    const isSiteDark = siteData?.site_theme_mode === 'dark';
    const siteBg = isSiteDark ? '#1a202c' : '#f7fafc';
    const siteText = isSiteDark ? '#f7fafc' : '#1a202c';
    const siteCardBg = isSiteDark ? '#2d3748' : '#ffffff';
    const siteBorder = isSiteDark ? '#4a5568' : '#e2e8f0';
    const siteAccent = resolveAccentColor(siteData?.site_theme_accent || 'orange');
    const themeSettings = useMemo(() => {
        if (!siteData) return {};
        let ts = siteData.theme_settings;
        if (typeof ts === 'string') {
            try { ts = JSON.parse(ts); } catch (e) { ts = {}; }
        }
        return ts || {};
    }, [siteData]);
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
    const isOwner = user && siteData && String(user.id) === String(siteData.user_id);
    const isStaff = user && (user.role === 'admin' || user.role === 'moderator');
    const isCollaborator = user && siteData && (
        siteData.is_collaborator === true || 
        siteData.role === 'collaborator' || 
        siteData.role === 'editor'
    );
    const isForbiddenToBuy = isOwner || isStaff || isCollaborator;
    const isSiteHidden = siteData && siteData.status === 'maintenance' && !isOwner && !isCollaborator && !isStaff;
    const isSoldOut = product ? product.stock_quantity === 0 : false;
    const currencyMap = { 'UAH': '₴', 'USD': '$', 'EUR': '€' };
    const siteCurrency = siteData?.currency || 'UAH';
    const currencySymbol = currencyMap[siteCurrency] || '₴';
    const currentCartItemId = product ? `${product.id}-${JSON.stringify(selectedOptions, Object.keys(selectedOptions).sort())}` : null;
    const isInCart = cartItems?.some(item => item.cartItemId === currentCartItemId);
    const canReview = user && !isForbiddenToBuy && purchaseStatus.hasPurchased && !purchaseStatus.hasReviewed;
    useEffect(() => {
        if (isSiteHidden) {
            setLoading(false);
            return;
        }
        const fetchProduct = async () => {
            try {
                setLoading(true);
                setIsNotFound(false);
                setIsRestricted(false);
                if (!productId) throw new Error("No ID");
                const response = await apiClient.get(`/products/${productId}`);
                const prod = response.data;
                if (!prod || Object.keys(prod).length === 0) throw new Error("Empty product");
                ['variants', 'image_gallery'].forEach(key => {
                    if (prod[key] && typeof prod[key] === 'string') {
                        try { prod[key] = JSON.parse(prod[key]); } catch (e) { prod[key] = null; }
                    }
                });
                setProduct(prod);
                setActiveImageIndex(0);
                if (Array.isArray(prod.variants) && prod.variants.length > 0) {
                    const defaults = {};
                    prod.variants.forEach(v => {
                        if (v?.name && v.values?.[0]) defaults[v.name] = v.values[0].label;
                    });
                    setSelectedOptions(defaults);
                }
                const primaryCategoryId = (prod.categories && prod.categories.length > 0) ? prod.categories[0].id : null;
                if (prod.site_id) fetchRecommendations(prod.site_id, primaryCategoryId, prod.id);
            } catch (err) {
                console.error("Product load error:", err);
                if (err.response && (err.response.status === 403 || err.response.data?.code === 'SITE_MAINTENANCE_MODE' || err.response.data?.code === 'SITE_DRAFT_MODE')) {
                    setIsRestricted(true);
                } else {
                    setIsNotFound(true);
                }
            } finally {
                setLoading(false);
            }
        };
        if (!isSiteLoading) fetchProduct();
    }, [productId, isSiteHidden, isSiteLoading]);

    useEffect(() => {
        if (!productId || isSiteHidden || isRestricted || isSiteLoading) return;
        const fetchReviewsData = async () => {
            setReviewsLoading(true);
            try {
                const revRes = await apiClient.get(`/products/${productId}/reviews`);
                setReviews(revRes.data);
                
                if (user && !isForbiddenToBuy) {
                    const statusRes = await apiClient.get(`/products/${productId}/purchase-status`);
                    setPurchaseStatus(statusRes.data);
                }
            } catch (e) {
                console.error("Failed to load reviews", e);
            } finally {
                setReviewsLoading(false);
            }
        };
        fetchReviewsData();
    }, [productId, user, isSiteHidden, isRestricted, isSiteLoading, isForbiddenToBuy]);

    const fetchRecommendations = async (siteId, categoryId, currentId) => {
        try {
            const res = await apiClient.get(`/products/site/${siteId}`);
            if (Array.isArray(res.data)) {
                const others = res.data
                    .filter(p => p.id !== currentId)
                    .sort((a, b) => {
                        const aHasCat = a.category_ids?.includes(String(categoryId)) ? 1 : 0;
                        const bHasCat = b.category_ids?.includes(String(categoryId)) ? 1 : 0;
                        return bHasCat - aHasCat;
                    })
                    .slice(0, 6);
                setRelatedProducts(others);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (!product) return;
        let basePrice = safeParseFloat(product.price);
        let maxVariantDiscount = 0;
        if (Array.isArray(product.variants)) {
            product.variants.forEach(v => {
                if (!v) return;
                const selectedVal = selectedOptions[v.name];
                const optionObj = v.values?.find(val => val.label === selectedVal);
                if (optionObj) {
                    if (optionObj.priceModifier) basePrice += safeParseFloat(optionObj.priceModifier);
                    if (optionObj.salePercentage > 0) maxVariantDiscount = Math.max(maxVariantDiscount, safeParseFloat(optionObj.salePercentage));
                }
            });
        }
        const prodSale = safeParseFloat(product.sale_percentage);
        let maxCategoryDiscount = 0;
        if (product.categories && product.categories.length > 0) {
             maxCategoryDiscount = Math.max(...product.categories.map(c => safeParseFloat(c.discount_percentage)));
        }
        let activeDiscount = maxVariantDiscount || prodSale || maxCategoryDiscount || 0;
        const finalPrice = Math.round(basePrice * (1 - activeDiscount / 100));
        setPriceData({
            finalPrice, originalPrice: basePrice, activeDiscount, isDiscounted: activeDiscount > 0
        });
    }, [selectedOptions, product]);

    const handleZoom = useCallback((direction) => {
        setImageScale(prev => {
            let newScale = direction === 'in' ? Math.min(prev + 0.25, 5) : Math.max(prev - 0.25, 0.5);
            if (direction === 'reset') newScale = 1;
            if (newScale === 1) setImagePosition({ x: 0, y: 0 });
            return newScale;
        });
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (isDragging && imageScale > 1) {
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;
            const maxDrag = 200 * imageScale;
            setImagePosition({
                x: Math.max(Math.min(newX, maxDrag), -maxDrag),
                y: Math.max(Math.min(newY, maxDrag), -maxDrag)
            });
            e.preventDefault();
            return;
        }
        if (imageContainerRef.current && imageScale > 1 && !isDragging) {
            const { left, top, width, height } = imageContainerRef.current.getBoundingClientRect();
            const x = e.clientX - left;
            const y = e.clientY - top;
            const factor = imageScale - 1;
            const maxMove = 150 * imageScale;
            setImagePosition({ 
                x: Math.max(Math.min((width / 2 - x) * factor, maxMove), -maxMove), 
                y: Math.max(Math.min((height / 2 - y) * factor, maxMove), -maxMove) 
            });
        }
    }, [isDragging, dragStart, imageScale]);

    const handleTouchStart = (e) => {
        if (imageScale > 1) {
            setIsDragging(true);
            const touch = e.touches[0];
            setDragStart({ x: touch.clientX - imagePosition.x, y: touch.clientY - imagePosition.y });
        }
    };

    const handleTouchMove = (e) => {
        if (isDragging && imageScale > 1) {
            const touch = e.touches[0];
            const newX = touch.clientX - dragStart.x;
            const newY = touch.clientY - dragStart.y;
            const maxDrag = 200 * imageScale;
            setImagePosition({
                x: Math.max(Math.min(newX, maxDrag), -maxDrag),
                y: Math.max(Math.min(newY, maxDrag), -maxDrag)
            });
        }
    };

    const handlePrimaryAction = () => {
        if (isForbiddenToBuy) {
            toast.error("Не можна додавати власні товари в кошик.");
            return;
        }
        if (isInCart) { navigate('/cart'); return; }
        if (!user) {
            if (window.confirm("Щоб додати товар до кошика, необхідно увійти. Перейти на сторінку входу?")) {
                navigate('/login', { state: { from: location.pathname + location.search } });
            }
            return;
        }
        const productForCart = { ...product, site_path: siteData?.site_path, site_name: siteData?.title, currency: siteCurrency };
        addToCart(productForCart, selectedOptions, { finalPrice: priceData.finalPrice, originalPrice: priceData.originalPrice, discount: priceData.activeDiscount });
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!reviewComment.trim() || reviewRating < 1 || reviewRating > 5) return;
        setIsSubmittingReview(true);
        try {
            await apiClient.post(`/products/${productId}/reviews`, { rating: reviewRating, comment: reviewComment });
            const revRes = await apiClient.get(`/products/${productId}/reviews`);
            setReviews(revRes.data);
            setPurchaseStatus(prev => ({ ...prev, hasReviewed: true }));
            setReviewComment('');
            const prodRes = await apiClient.get(`/products/${productId}`);
            setProduct(prev => ({ ...prev, average_rating: prodRes.data.average_rating, review_count: prodRes.data.review_count }));
        } catch (err) {
            alert(err.response?.data?.message || "Помилка при додаванні відгуку");
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleDeleteReview = async (reviewId) => {
        if (!window.confirm("Ви впевнені, що хочете видалити свій відгук?")) return;
        try {
            await apiClient.delete(`/products/${productId}/reviews/${reviewId}`);
            const revRes = await apiClient.get(`/products/${productId}/reviews`);
            setReviews(revRes.data);
            setPurchaseStatus(prev => ({ ...prev, hasReviewed: false }));
            const prodRes = await apiClient.get(`/products/${productId}`);
            setProduct(prev => ({ ...prev, average_rating: prodRes.data.average_rating, review_count: prodRes.data.review_count }));
        } catch (err) {
            alert(err.response?.data?.message || "Помилка при видаленні відгуку");
        }
    };
    if (loading || isSiteLoading) return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-12 w-full">
            <LoadingState title="Завантаження товару..." />
        </div>
    );
    if (isSiteHidden || isRestricted) return <MaintenancePage logoUrl={siteData?.logo_url} siteName={siteData?.title || 'Site'} themeSettings={siteData?.theme_settings} />;
    if (isNotFound || !product || Object.keys(product).length === 0) return <NotFoundPage />;
    const galleryImages = (product.image_gallery && Array.isArray(product.image_gallery) && product.image_gallery.length > 0)
        ? product.image_gallery.map(img => img.startsWith('http') ? img : `${BASE_URL}${img}`)
        : ['https://placehold.co/600x600?text=No+Image'];
    const faviconUrl = siteData?.favicon_url?.startsWith('http') ? siteData.favicon_url : `${BASE_URL}${siteData?.favicon_url || '/icon-light.webp'}`;
    const pageTitle = `${product.name || 'Товар'} | ${siteData?.site_title_seo || siteData?.title || 'Kendr Store'}`;
    const avgRating = Math.round(product.average_rating || 0);
    const zoomControlsBg = isSiteDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)';
    const zoomControlsBorder = isSiteDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
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
            className="@container site-root relative site-theme-context site-theme-preview min-h-screen flex flex-col"
            style={siteIsolationStyles}
        >
            <Helmet>
                <title>{pageTitle}</title>
                <link rel="icon" type="image/webp" href={faviconUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:image" content={galleryImages[0]} />
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
            {hasHeader && headerBlocks.length > 0 && (
                <div className="w-full shrink-0 z-50">
                    <BlockRenderer blocks={headerBlocks} siteData={siteData} isEditorPreview={false} />
                </div>
            )}
            <main className="flex-1 max-w-350 mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-start">
                    <div className="flex flex-col-reverse lg:flex-row gap-4 h-auto lg:h-150 min-h-87.5">
                        {galleryImages.length > 1 && (
                            <div className="flex flex-row lg:flex-col gap-2.5 w-full lg:w-20 shrink-0 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto custom-scrollbar pb-2 lg:pb-0 lg:pr-1">
                                {galleryImages.map((src, idx) => (
                                    <div 
                                        key={idx}
                                        className={`w-16 lg:w-full aspect-square rounded-md overflow-hidden cursor-pointer opacity-80 hover:opacity-100 shrink-0 border bg-(--site-bg) transition-all ${activeImageIndex === idx ? 'border-2 border-(--site-accent) opacity-100' : 'border-(--site-border-color)'}`}
                                        onClick={() => { setActiveImageIndex(idx); handleZoom('reset'); }}
                                    >
                                        <img src={src} alt="thumb" className="w-full h-full object-contain" />
                                    </div>
                                ))}
                            </div>
                        )}
                        <div 
                            ref={imageContainerRef}
                            className={`flex-1 border border-(--site-border-color) rounded-xl relative overflow-hidden flex items-center justify-center select-none bg-(--site-bg) ${imageScale > 1 ? (isDragging ? 'gallery-dragging' : 'gallery-draggable') : 'gallery-zoomable'}`}
                            style={{ touchAction: imageScale > 1 ? 'none' : 'auto' }}
                            onMouseDown={(e) => { if (imageScale > 1) { setIsDragging(true); setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y }); } e.preventDefault(); }}
                            onMouseMove={handleMouseMove}
                            onMouseUp={() => setIsDragging(false)}
                            onMouseLeave={() => { setIsHovering(false); if(imageScale > 1) handleZoom('reset'); setIsDragging(false); }}
                            onMouseEnter={() => { setIsHovering(true); if(imageScale === 1) handleZoom('in'); }}
                            onClick={() => imageScale === 1 ? handleZoom('in') : handleZoom('reset')}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={() => setIsDragging(false)}
                        >
                            <img 
                                src={galleryImages[activeImageIndex]} 
                                alt={product.name || 'Product'} 
                                className="gallery-image-main"
                                style={{ transform: `scale(${imageScale}) translate(${imagePosition.x}px, ${imagePosition.y}px)` }}
                                draggable="false"
                            />
                            <div className="absolute top-4 left-4 text-(--site-text-primary) px-3 py-1.5 rounded-lg text-sm font-semibold backdrop-blur-md z-10 border" style={{backgroundColor: zoomControlsBg, borderColor: zoomControlsBorder}}>
                                {Math.round(imageScale * 100)}%
                            </div>
                            <div className="absolute bottom-4 right-4 flex gap-2 rounded-xl p-2 backdrop-blur-md z-10 border shadow-lg" style={{backgroundColor: zoomControlsBg, borderColor: zoomControlsBorder}}>
                                <button onClick={(e) => { e.stopPropagation(); handleZoom('out'); }} disabled={imageScale <= 0.5} className="w-10 h-10 rounded-lg border-none bg-(--site-accent) text-(--site-accent-text) text-xl font-bold cursor-pointer transition-transform hover:scale-110 disabled:bg-(--site-text-secondary) disabled:text-(--site-bg) disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed">−</button>
                                <button onClick={(e) => { e.stopPropagation(); handleZoom('reset'); }} className="w-10 h-10 rounded-lg border-none bg-(--site-accent) text-(--site-accent-text) text-sm font-bold cursor-pointer transition-transform hover:scale-110">1:1</button>
                                <button onClick={(e) => { e.stopPropagation(); handleZoom('in'); }} disabled={imageScale >= 5} className="w-10 h-10 rounded-lg border-none bg-(--site-accent) text-(--site-accent-text) text-xl font-bold cursor-pointer transition-transform hover:scale-110 disabled:bg-(--site-text-secondary) disabled:text-(--site-bg) disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed">+</button>
                            </div>
                            {product.sale_percentage > 0 && !isSoldOut && (
                                <div className="absolute top-4 right-4 bg-(--site-accent) text-(--site-accent-text) font-bold px-3 py-1 rounded-md z-10 text-sm shadow-sm">
                                    -{product.sale_percentage}%
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 text-(--site-text-primary) leading-tight">{product.name || 'Товар'}</h1>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star 
                                        key={star} size={18} strokeWidth={1.5}
                                        fill={star <= avgRating ? "var(--site-accent)" : "transparent"} 
                                        color={star <= avgRating ? "var(--site-accent)" : "var(--site-text-secondary)"} 
                                    />
                                ))}
                            </div>
                            <a href="#reviews" className="text-sm text-(--site-text-secondary) underline underline-offset-4 hover:text-(--site-accent) transition-colors">
                                {product.review_count || 0} відгуків
                            </a>
                        </div>
                        <div className="flex items-center gap-4 mb-5 flex-wrap">
                            <div className={`inline-flex items-center px-3 py-1.5 rounded-md font-semibold text-sm ${isSoldOut ? 'bg-[color-mix(in_srgb,var(--site-text-secondary),transparent_90%)] text-(--site-text-secondary)' : 'bg-[color-mix(in_srgb,var(--site-accent),transparent_85%)] text-(--site-accent)'}`}>
                                {isSoldOut ? 'Закінчився' : 'В наявності'}
                            </div>
                            {product.categories?.map(c => {
                                const CatIcon = ICON_MAP[c.icon] || Folder;
                                return (
                                    <div key={c.id} className="text-(--site-text-secondary) flex items-center gap-2 font-medium text-sm pl-4 border-l border-(--site-border-color)">
                                        <CatIcon size={16} color="var(--site-accent)" />
                                        <span>{c.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-end gap-4 mb-6 flex-wrap">
                            {priceData.isDiscounted ? (
                                <>
                                    <span className="text-4xl lg:text-5xl font-bold text-(--site-text-primary) leading-none">{priceData.finalPrice} {currencySymbol}</span>
                                    <span className="line-through text-(--site-text-secondary) text-xl mb-1">{priceData.originalPrice} {currencySymbol}</span>
                                </>
                            ) : (
                                <span className="text-4xl lg:text-5xl font-bold text-(--site-text-primary) leading-none">{priceData.finalPrice} {currencySymbol}</span>
                            )}
                        </div>
                        {product.variants?.map((variant, idx) => (
                            <div key={idx} className="mb-5">
                                <label className="block mb-2.5 font-semibold text-(--site-text-secondary)">{variant.name}:</label>
                                <div className="flex gap-2.5 flex-wrap">
                                    {variant.values.map((val, valIdx) => {
                                        const isActive = selectedOptions[variant.name] === val.label;
                                        return (
                                            <button
                                                key={valIdx}
                                                className={`px-4 py-2 rounded-md border transition-all text-sm lg:text-base min-w-15 ${isActive ? 'border-2 border-(--site-accent) bg-[color-mix(in_srgb,var(--site-accent),transparent_95%)] text-(--site-accent) font-semibold' : 'border-(--site-border-color) bg-(--site-bg) text-(--site-text-primary) hover:border-(--site-accent)'}`}
                                                onClick={() => setSelectedOptions(prev => ({ ...prev, [variant.name]: val.label }))}
                                            >
                                                {val.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="mt-4">
                            <button
                                onClick={handlePrimaryAction}
                                disabled={isSoldOut && !isInCart}
                                className={`site-btn w-full py-4 text-lg uppercase rounded-xl ${(isSoldOut && !isInCart) ? 'bg-(--site-text-secondary) text-(--site-bg)' : 'site-btn-primary'}`}
                            >
                                {isInCart ? 'Перейти до кошику' : isSoldOut ? 'Немає в наявності' : 'Додати в кошик'}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="col-span-full bg-(--site-bg) border border-(--site-border-color) rounded-xl mt-10 overflow-hidden">
                    <div className="bg-(--site-bg) border-b border-(--site-border-color) px-6 py-5 text-lg font-bold text-(--site-text-primary)">
                        Характеристики та опис
                    </div>
                    <div className="max-h-87.5 overflow-y-auto p-6 leading-relaxed text-(--site-text-secondary) whitespace-pre-wrap text-base custom-scrollbar">
                        {product.description || 'Опис відсутній'}
                    </div>
                </div>
                <div id="reviews" className="col-span-full mt-10 border border-(--site-border-color) rounded-xl bg-(--site-bg) overflow-hidden">
                    <div className="bg-(--site-bg) border-b border-(--site-border-color) px-6 py-5 flex justify-between items-center flex-wrap gap-4">
                        <h2 className="text-xl lg:text-2xl font-bold m-0 text-(--site-text-primary)">Відгуки покупців</h2>
                        <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--site-accent),transparent_90%)] px-4 py-2 rounded-lg">
                            <Star size={20} fill="var(--site-accent)" color="var(--site-accent)" strokeWidth={1} />
                            <span className="text-xl font-bold text-(--site-text-primary)">{product.average_rating ? Number(product.average_rating).toFixed(1) : '0.0'}</span>
                            <span className="text-sm text-(--site-text-secondary)">({product.review_count || 0})</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-6 lg:p-8">
                        <div className={`${canReview ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-5`}>
                            {reviewsLoading ? (
                                <div className="text-(--site-text-secondary) italic p-4 text-center">Завантаження відгуків...</div>
                            ) : reviews.length > 0 ? (
                                <>
                                    {reviews.slice(0, visibleReviews).map(review => {
                                        const isMyReview = user && user.id === review.user_id;
                                        return (
                                            <div key={review.id} className="site-review-card p-6 rounded-xl border border-[color-mix(in_srgb,var(--site-text-primary),transparent_85%)] bg-[color-mix(in_srgb,var(--site-text-secondary),transparent_98%)]">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <img 
                                                            src={review.avatar_url ? (review.avatar_url.startsWith('http') ? review.avatar_url : `${BASE_URL}${review.avatar_url}`) : `https://ui-avatars.com/api/?name=${review.username}&background=random`} 
                                                            alt={review.username} 
                                                            className="w-10 h-10 rounded-full object-cover"
                                                        />
                                                        <div>
                                                            <div className="font-semibold text-base text-(--site-text-primary)">{review.username}</div>
                                                            <div className="text-xs text-(--site-text-secondary) mt-0.5">{new Date(review.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex gap-0.5">
                                                            {[1, 2, 3, 4, 5].map((star) => (
                                                                <Star key={star} size={14} fill={star <= review.rating ? "var(--site-accent)" : "transparent"} color={star <= review.rating ? "var(--site-accent)" : "var(--site-text-secondary)"} />
                                                            ))}
                                                        </div>
                                                        {isMyReview && (
                                                            <button 
                                                                className="text-(--site-accent) opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--site-accent),transparent_90%)] p-1.5 rounded transition-all" 
                                                                onClick={() => handleDeleteReview(review.id)}
                                                                title="Видалити свій відгук"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-(--site-text-primary) leading-relaxed text-[0.95rem] whitespace-pre-wrap">{review.comment}</div>
                                                {review.owner_reply && (
                                                    <div className="mt-4 p-3 bg-[color-mix(in_srgb,var(--site-text-secondary),transparent_95%)] border-l-4 border-(--site-accent) rounded-r-lg">
                                                        <div className="flex items-center gap-1.5 font-semibold text-sm text-(--site-text-secondary) mb-1.5"><MessageSquare size={14} />Відповідь магазину:</div>
                                                        <div className="text-sm text-(--site-text-primary) leading-relaxed">{review.owner_reply}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {reviews.length > visibleReviews && (
                                        <button 
                                            onClick={() => setVisibleReviews(prev => prev + 5)}
                                            className="mt-2 py-3 px-6 rounded-xl font-semibold border-2 border-(--site-accent) text-(--site-accent) bg-transparent hover:bg-[color-mix(in_srgb,var(--site-accent),transparent_90%)] transition-colors self-center flex flex-col items-center gap-1"
                                        >
                                            <span>Показати ще відгуки ({reviews.length - visibleReviews})</span>
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="text-(--site-text-secondary) italic p-5 text-center w-full mt-4">
                                    Ще немає відгуків. Будьте першим, хто поділиться враженнями!
                                </div>
                            )}
                        </div>
                        {canReview && (
                            <div className="lg:col-span-1 bg-[color-mix(in_srgb,var(--site-border-color),transparent_80%)] border border-(--site-border-color) p-6 rounded-2xl h-fit sticky top-6 shadow-sm">
                                <h3 className="m-0 mb-5 text-xl font-bold text-(--site-text-primary)">Залишити відгук</h3>
                                <form onSubmit={handleReviewSubmit} className="flex flex-col gap-5">
                                    <div>
                                        <label className="block mb-2.5 font-semibold text-[0.95rem] text-(--site-text-primary) pl-0.5">Ваша оцінка *</label>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <button key={star} type="button" onClick={() => setReviewRating(star)} className="bg-transparent border-none p-0 cursor-pointer transition-transform hover:scale-110">
                                                    <Star size={32} fill={star <= reviewRating ? "var(--site-accent)" : "transparent"} color={star <= reviewRating ? "var(--site-accent)" : "var(--site-text-secondary)"} strokeWidth={1.5} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block mb-2.5 font-semibold text-[0.95rem] text-(--site-text-primary) pl-0.5">Повідомлення *</label>
                                        <div className="relative">
                                            <textarea 
                                                value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                                                placeholder="Напишіть ваше повідомлення тут..." required minLength={5} maxLength={1000}
                                                className="peer w-full min-h-35 p-3.5 pl-11 border-2 border-(--site-border-color) rounded-xl bg-[color-mix(in_srgb,var(--site-text-secondary),transparent_96%)] text-(--site-text-primary) text-base font-medium resize-y transition-all outline-none focus:bg-transparent focus:border-(--site-accent) focus:ring-4 focus:ring-[color-mix(in_srgb,var(--site-accent),transparent_85%)] hover:border-(--site-text-secondary) placeholder:text-(--site-text-secondary) placeholder:opacity-60 placeholder:font-normal custom-scrollbar"
                                            />
                                            <MessageSquare size={18} strokeWidth={2.5} className="absolute left-3.5 top-3.5 text-(--site-text-secondary) opacity-60 pointer-events-none transition-all peer-focus:text-(--site-accent) peer-focus:opacity-100" />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={isSubmittingReview || !reviewComment.trim()} className="site-btn site-btn-primary w-full py-3.5 text-base mt-1">
                                        {isSubmittingReview ? 'Надсилання...' : 'Надіслати'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
                {relatedProducts.length > 0 && (
                    <div className="mt-12 lg:mt-16 border-t border-(--site-border-color) pt-8">
                        <h2 className="text-center mb-8 text-(--site-text-primary) text-2xl lg:text-3xl font-bold">Інші товари</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            {relatedProducts.map(relProd => (
                                <div key={relProd.id} className="h-full min-w-0">
                                    <ProductCard product={relProd} isEditorPreview={false} siteData={siteData} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            {hasFooter && footerBlocks.length > 0 && (
                <div className="w-full shrink-0">
                    <BlockRenderer blocks={footerBlocks} siteData={siteData} isEditorPreview={false} />
                </div>
            )}
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
            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} siteId={siteData?.id} />
        </div>
    );
};

export default ProductDetailPage;