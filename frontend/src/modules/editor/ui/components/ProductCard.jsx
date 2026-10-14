// frontend/src/modules/editor/ui/components/ProductCard.jsx
import React, { useState, useMemo, useContext, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { CartContext } from '../../../../app/providers/CartContext';
import { AuthContext } from '../../../../app/providers/AuthContext';
import { BASE_URL } from '../../../../shared/config';
import { useConfirm } from '../../../../shared/hooks/useConfirm';
import { ShoppingCart, Settings, Download } from 'lucide-react';
import { toast } from 'react-toastify';

const ProductCard = ({ product, isEditorPreview, siteData, fontStyles }) => {
    const cartContext = useContext(CartContext);
    const authContext = useContext(AuthContext);
    const addToCart = cartContext?.addToCart || (() => console.warn('Cart Context is missing'));
    const user = authContext?.user || null;
    const navigate = useNavigate();
    const location = useLocation();
    const { confirm } = useConfirm();
    const [activeImgIndex, setActiveImgIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const intervalRef = useRef(null);
    const images = useMemo(() => {
        if (product.image_gallery) {
            let gallery = [];
            if (typeof product.image_gallery === 'string') {
                try {
                    gallery = JSON.parse(product.image_gallery);
                } catch (e) {
                    console.error("Failed to parse image_gallery:", e);
                    gallery = [];
                }
            } else if (Array.isArray(product.image_gallery)) {
                gallery = product.image_gallery;
            }
            if (gallery.length > 0) {
                return gallery.map(img => 
                    img.startsWith('http') ? img : `${BASE_URL}${img}`
                );
            }
        }
        return ['https://placehold.co/400?text=No+Image'];
    }, [product.image_gallery]);
    const isOwner = user && siteData && String(user.id) === String(siteData.user_id);
    const isStaff = user && (user.role === 'admin' || user.role === 'moderator');
    const isCollaborator = user && siteData && (
        siteData.is_collaborator === true || 
        siteData.role === 'collaborator' || 
        siteData.role === 'editor' || 
        (Array.isArray(siteData.collaborators) && siteData.collaborators.some(c => String(c.id) === String(user.id) || String(c.user_id) === String(user.id))) ||
        (Array.isArray(siteData.team) && siteData.team.some(c => String(c.id) === String(user.id) || String(c.user_id) === String(user.id)))
    );
    
    const isForbiddenToBuy = isOwner || isStaff || isCollaborator;
    const categoryDiscount = Array.isArray(product.categories)
        ? product.categories.reduce((max, c) => Math.max(max, parseFloat(c.discount_percentage) || 0), 0)
        : 0;
    const discountPercent = product.sale_percentage > 0 ? product.sale_percentage : categoryDiscount;
    const hasDiscount = discountPercent > 0;
    const finalPrice = product.price ? Math.round(product.price * (1 - discountPercent / 100)) : 0;
    const isSoldOut = product.stock_quantity === 0 && product.type !== 'digital';
    const hasVariants = product.variants && Array.isArray(product.variants) && product.variants.length > 0;
    const sitePath = siteData?.site_path || product.site_path;
    const productLink = sitePath 
        ? `/site/${sitePath}/product/${product.id}` 
        : `/product/${product.id}`;
    const currencyMap = {
        'UAH': '₴',
        'USD': '$',
        'EUR': '€'
    };
    const siteCurrency = siteData?.currency || 'UAH';
    const currencySymbol = currencyMap[siteCurrency] || '₴';
    const categoryDisplay = product.categories && product.categories.length > 0
        ? product.categories.map(c => c.name).join(', ')
        : '';
    const handleMouseEnter = () => {
        setIsHovered(true);
        if (isEditorPreview || images.length <= 1) return;
        intervalRef.current = setInterval(() => {
            setActiveImgIndex(prev => (prev + 1) % images.length);
        }, 1200);
    };
    
    const handleMouseLeave = () => {
        setIsHovered(false);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setActiveImgIndex(0);
    };

    const handleAction = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isEditorPreview) return;
        if (hasVariants) {
            navigate(productLink);
            return;
        }
        if (isForbiddenToBuy) {
            toast.error("Не можна додавати власні товари в кошик.");
            return;
        }
        if (!user) {
            const isConfirmed = await confirm({
                title: 'Потрібна авторизація',
                message: 'Щоб купити, потрібно увійти. Перейти на сторінку входу?',
                confirmLabel: 'Увійти',
                cancelLabel: 'Скасувати',
                type: 'warning'
            });
            if (isConfirmed) {
                navigate('/login', { state: { from: location.pathname + location.search } });
            }
            return;
        }
        
        if (addToCart) {
            const productForCart = {
                ...product,
                site_path: siteData?.site_path || product.site_path,
                site_name: siteData?.title || product.site_name,
                currency: siteCurrency
            };
            addToCart(productForCart, {}, { finalPrice, originalPrice: product.price, discount: discountPercent });
        }
    };

    return (
        <Link 
            to={isEditorPreview ? '#' : productLink}
            onClick={(e) => isEditorPreview && e.preventDefault()}
            className={`
                block h-full w-full min-w-0 no-underline text-inherit group
                ${isEditorPreview ? 'pointer-events-none' : 'pointer-events-auto'}
            `}
        >
            <div 
                className={`
                    border border-(--site-border-color) rounded-2xl overflow-hidden bg-(--site-card-bg) 
                    h-full w-full flex flex-col relative transition-all duration-300 box-border
                `}
                style={{
                    transform: (!isEditorPreview && isHovered) ? 'translateY(-6px)' : 'translateY(0)',
                    boxShadow: (!isEditorPreview && isHovered) ? '0 12px 24px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.02)'
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="relative pt-[100%] overflow-hidden bg-(--site-bg) border-b border-(--site-border-color)/50">
                    {images.map((imgSrc, idx) => (
                        <img 
                            key={idx}
                            src={imgSrc} 
                            alt={product.name}
                            className={`
                                absolute top-0 left-0 w-full h-full object-cover transition-all duration-700 ease-out
                            `}
                            style={{
                                opacity: idx === activeImgIndex ? 1 : 0,
                                transform: `scale(${idx === activeImgIndex && isHovered ? 1.08 : 1})`,
                                filter: isSoldOut ? 'grayscale(100%) opacity(70%)' : 'none',
                            }}
                        />
                    ))}
                    {images.length > 1 && !isSoldOut && (
                        <div className={`
                            absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10 transition-opacity duration-300
                        `} style={{ opacity: isHovered ? 1 : 0 }}>
                            {images.map((_, idx) => (
                                <div key={idx} 
                                    className="h-1.5 rounded-full transition-all duration-300 shadow-sm"
                                    style={{
                                        width: idx === activeImgIndex ? '16px' : '6px',
                                        background: idx === activeImgIndex ? 'var(--site-accent)' : 'rgba(255,255,255,0.7)'
                                    }} 
                                />
                            ))}
                        </div>
                    )}
                    {hasDiscount && !isSoldOut && (
                        <div className="absolute top-3 left-3 bg-red-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide z-10 shadow-sm">
                            -{discountPercent}%
                        </div>
                    )}
                    {product.type === 'digital' && !isSoldOut && (
                        <div className={`absolute top-3 ${hasDiscount ? 'left-14' : 'left-3'} bg-(--site-bg)/90 backdrop-blur-sm text-(--site-text-primary) px-2 py-1 rounded-lg text-[0.65rem] uppercase font-bold tracking-wider z-10 shadow-sm border border-(--site-border-color) flex items-center gap-1`}>
                            <Download size={10} /> Цифровий
                        </div>
                    )}
                    {isSoldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-(--site-bg)/80 backdrop-blur-sm z-10">
                            <span className="bg-(--site-card-bg) text-(--site-text-primary) border border-(--site-border-color) px-4 py-2 rounded-xl text-sm font-bold shadow-sm uppercase tracking-wider">
                                Немає в наявності
                            </span>
                        </div>
                    )}
                </div>
                <div className="p-5 flex-1 flex flex-col min-w-0 gap-2">
                    <div className="min-h-4">
                        {categoryDisplay ? (
                            <div className="text-[0.65rem] uppercase tracking-wider font-bold text-(--site-text-secondary) truncate opacity-80">
                                {categoryDisplay}
                            </div>
                        ) : (
                            <div className="text-[0.65rem] opacity-0 h-full">_</div>
                        )}
                    </div>
                    <h4 
                        className="m-0 text-[1.1rem] text-(--site-text-primary) font-medium leading-snug line-clamp-2 overflow-hidden transition-colors duration-200 group-hover:text-(--site-accent)"
                        style={{ fontFamily: fontStyles?.content || 'inherit' }}
                        title={product.name}
                    >
                        {product.name}
                    </h4>
                    <div className="mt-auto flex justify-between items-end pt-3">
                        <div className="min-w-0 flex-1 overflow-hidden flex flex-col justify-end">
                            {hasDiscount ? (
                                <>
                                    <span className="text-xs text-(--site-text-secondary) line-through mb-0.5 opacity-70 decoration-red-500/50">
                                        {product.price} {currencySymbol}
                                    </span>
                                    <span className="text-red-500 font-bold text-[1.25rem] leading-none">
                                        {finalPrice} {currencySymbol}
                                    </span>
                                </>
                            ) : (
                                <span className="text-(--site-text-primary) font-bold text-[1.25rem] leading-none mt-auto">
                                    {product.price} {currencySymbol}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleAction}
                            disabled={isSoldOut}
                            className={`
                                h-10 w-10 flex items-center justify-center rounded-xl ml-3 shrink-0 transition-all duration-300 shadow-sm
                                ${isSoldOut ? 'cursor-default opacity-50' : 'cursor-pointer hover:scale-105 active:scale-95'}
                            `}
                            style={{
                                background: 'var(--site-accent)',
                                color: 'var(--site-accent-text)',
                                border: 'none',
                            }}
                            title={hasVariants ? "Вибрати опції" : "Додати в кошик"}
                        >
                            {hasVariants ? <Settings size={18} /> : <ShoppingCart size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default ProductCard;