// frontend/src/modules/shop/CartPage.jsx
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { CartContext } from '../../app/providers/CartContext';
import { AuthContext } from '../../app/providers/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../shared/api/api';
import { toast } from 'react-toastify';
import { BASE_URL } from '../../shared/config';
import { Input } from '../../shared/ui/elements/Input';
import { Button } from '../../shared/ui/elements/Button';
import EmptyState from '../../shared/ui/complex/EmptyState';
import ConfirmModal from '../../shared/ui/complex/ConfirmModal';
import LoadingState from '../../shared/ui/complex/LoadingState';
import NovaPoshtaMapModal from '../../shared/ui/complex/NovaPoshtaMapModal';
import PaymentMethodModal from '../../shared/ui/complex/PaymentMethodModal';
import { Trash2, Minus, Plus, Store, CreditCard, AlertCircle, PackageOpen, User, MapPin, Map, Wallet, CheckCircle2, Loader2, ShoppingBag, Download } from 'lucide-react';

const CartPage = () => {
    const { cartItems, removeFromCart, clearCart, updateQuantity, isLoaded } = useContext(CartContext);
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [customerData, setCustomerData] = useState(() => {
        const savedData = localStorage.getItem('cartCustomerData');
        if (savedData) {
            try { return JSON.parse(savedData); } catch (e) { console.error('Error parsing customer data', e); }
        }
        return { name: '', email: '', phone: '', address: '' };
    });
    const [paymentMethod, setPaymentMethod] = useState(() => {
        return localStorage.getItem('cartPaymentMethod') || 'online';
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [activeSiteId, setActiveSiteId] = useState(null);
    const [resolvedSettings, setResolvedSettings] = useState({});
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [pendingPaymentOrder, setPendingPaymentOrder] = useState(null);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false, actionType: null, targetId: null, title: '', message: ''
    });
    const currencyMap = { 'UAH': '₴', 'USD': '$', 'EUR': '€' };
    useEffect(() => {
        localStorage.setItem('cartCustomerData', JSON.stringify(customerData));
    }, [customerData]);
    useEffect(() => {
        localStorage.setItem('cartPaymentMethod', paymentMethod);
    }, [paymentMethod]);
    useEffect(() => {
        if (user) {
            setCustomerData(prev => ({
                ...prev,
                name: prev.name || user.username || '',
                email: prev.email || user.email || '' 
            }));
        }
    }, [user]);
    useEffect(() => {
        const fetchSettings = async () => {
            const missingIds = cartItems.map(item => item.site_id).filter(id => id && !resolvedSettings[id]);
            const uniqueMissingIds = [...new Set(missingIds)];
            if (uniqueMissingIds.length === 0) return;
            const newSettings = { ...resolvedSettings };
            for (const id of uniqueMissingIds) {
                try {
                    const res = await apiClient.get(`/sites/info/${id}`);
                    if (res.data) {
                        newSettings[id] = {
                            path: res.data.site_path || '',
                            isOnlineEnabled: Boolean(res.data.is_online_payment_enabled ?? true),
                            isCodEnabled: Boolean(res.data.is_cod_enabled ?? true),
                            siteOwnerId: res.data.user_id,
                            team: res.data.collaborators || res.data.team || [],
                            isCollaboratorFlag: res.data.is_collaborator === true || res.data.role === 'collaborator' || res.data.role === 'editor'
                        };
                    }
                } catch (e) {
                    newSettings[id] = { path: null, isOnlineEnabled: true, isCodEnabled: true, team: [] };
                }
            }
            setResolvedSettings(newSettings);
        };
        fetchSettings();
    }, [cartItems, resolvedSettings]);

    const groupedItems = useMemo(() => {
        const groups = {};
        cartItems.forEach(item => {
            const siteId = item.site_id || 'unknown';
            const siteSettings = resolvedSettings[siteId] || { path: null, isOnlineEnabled: true, isCodEnabled: true, team: [] };
            const sitePath = item.site_path || siteSettings.path || siteId; 
            const itemCurrency = item.currency || 'UAH';
            if (!groups[siteId]) {
                const isOwner = user && siteSettings.siteOwnerId && String(user.id) === String(siteSettings.siteOwnerId);
                const isCollaborator = user && (
                    siteSettings.isCollaboratorFlag || 
                    (Array.isArray(siteSettings.team) && siteSettings.team.some(c => String(c.id) === String(user.id) || String(c.user_id) === String(user.id)))
                );
                const isForbidden = isOwner || isCollaborator;
                groups[siteId] = {
                    siteName: item.site_name || `Магазин #${siteId}`,
                    siteId: siteId, 
                    sitePath: sitePath,
                    currency: itemCurrency, 
                    currencySymbol: currencyMap[itemCurrency] || '₴',
                    isOnlineEnabled: Boolean(siteSettings.isOnlineEnabled),
                    isCodEnabled: Boolean(siteSettings.isCodEnabled),
                    isForbidden: Boolean(isForbidden),
                    isOwner: Boolean(isOwner),
                    items: [], total: 0, totalOriginal: 0, isDigitalOnly: true
                };
            }
            groups[siteId].items.push(item);
            const quantity = item.quantity;
            const price = parseFloat(item.price);
            const origPrice = item.originalPrice ? parseFloat(item.originalPrice) : price;
            groups[siteId].total += price * quantity;
            groups[siteId].totalOriginal += origPrice * quantity;
            if (item.type !== 'digital') groups[siteId].isDigitalOnly = false;
        });
        return Object.values(groups).map(group => ({
            ...group, totalDiscount: group.totalOriginal - group.total
        }));
    }, [cartItems, resolvedSettings, user]);
    
    useEffect(() => {
        if (groupedItems.length > 0) {
            const isCurrentValid = groupedItems.some(g => g.siteId === activeSiteId);
            if (!isCurrentValid) setActiveSiteId(groupedItems[0].siteId);
            const currentGroup = groupedItems.find(g => g.siteId === (isCurrentValid ? activeSiteId : groupedItems[0].siteId));
            if (currentGroup) {
                if (currentGroup.isDigitalOnly) {
                    setPaymentMethod('online');
                } else if (!currentGroup.isOnlineEnabled && currentGroup.isCodEnabled) {
                    setPaymentMethod('cod');
                } else if (currentGroup.isOnlineEnabled && !currentGroup.isCodEnabled) {
                    setPaymentMethod('online');
                }
            }
        } else {
            setActiveSiteId(null);
        }
    }, [groupedItems, activeSiteId]);
    
    const activeGroup = useMemo(() => groupedItems.find(g => g.siteId === activeSiteId) || null, [groupedItems, activeSiteId]);
    const clearCartForSite = (siteId) => {
        const itemsToRemove = cartItems.filter(item => item.site_id === siteId);
        itemsToRemove.forEach(item => removeFromCart(item.cartItemId));
    };

    const promptRemoveItem = (item) => {
        setConfirmModal({
            isOpen: true, actionType: 'remove', targetId: item.cartItemId,
            title: 'Видалити товар', message: `Ви впевнені, що хочете видалити "${item.name}" з кошика?`
        });
    };

    const promptClearCart = () => {
        setConfirmModal({
            isOpen: true, actionType: 'clear', targetId: null,
            title: 'Очистити кошик', message: 'Ви впевнені, що хочете повністю очистити кошик? Цю дію неможливо скасувати.'
        });
    };

    const handleConfirmAction = () => {
        if (confirmModal.actionType === 'remove' && confirmModal.targetId) {
            removeFromCart(confirmModal.targetId);
        } else if (confirmModal.actionType === 'clear') {
            clearCart();
        }
        setConfirmModal({ ...confirmModal, isOpen: false });
    };

    const clearSavedCheckoutData = () => {
        localStorage.removeItem('cartCustomerData');
        localStorage.removeItem('cartPaymentMethod');
    };

    const handleCheckout = async (e) => {
        e.preventDefault();
        if (!activeGroup) return;
        if (activeGroup.isForbidden) return toast.error("Ви не можете оформлювати замовлення у власному магазині або як співавтор.");
        if (paymentMethod === 'online' && !activeGroup.isOnlineEnabled) return toast.error('Продавець тимчасово не приймає онлайн оплату.');
        if (paymentMethod === 'cod' && !activeGroup.isCodEnabled) return toast.error('Продавець не відправляє товари післяплатою.');
        if (paymentMethod === 'cod' && activeGroup.isDigitalOnly) return toast.error('Цифрові товари доступні тільки за умови онлайн оплати.');
        if (!customerData.name.trim() || !customerData.email.trim() || !customerData.phone.trim()) return toast.error('Будь ласка, заповніть всі обов\'язкові поля');
        const phoneRegex = /^[0-9+\-\(\)\s]*$/;
        if (customerData.phone && !phoneRegex.test(customerData.phone)) return toast.error('Некоректний формат телефону.');
        if (!activeGroup.isDigitalOnly && !customerData.address.trim()) return toast.error('Будь ласка, оберіть відділення доставки');
        const outOfStockItem = activeGroup.items.find(item => item.type !== 'digital' && item.stock_quantity != null && item.quantity > item.stock_quantity);
        if (outOfStockItem) return toast.error(`Товару "${outOfStockItem.name}" недостатньо на складі.`);
        setIsSubmitting(true);
        try {
            const formattedItems = activeGroup.items.map(item => ({
                id: item.id, quantity: item.quantity, options: item.selectedOptions
            }));
            const payload = { siteId: activeGroup.siteId, items: formattedItems, customerData, paymentMethod };
            const response = await apiClient.post('/orders/checkout', payload, { suppressToast: true });
            if (paymentMethod === 'online') {
                setPendingPaymentOrder({
                    orderId: response.data.orderId,
                    totalAmount: activeGroup.total.toFixed(2).toString(),
                    siteTitle: activeGroup.siteName || 'Kendr Store',
                    currencySymbol: activeGroup.currencySymbol,
                    liqpayData: response.data.liqpayData,
                    liqpaySignature: response.data.liqpaySignature
                });
                clearCartForSite(activeGroup.siteId);
                clearSavedCheckoutData();
                setIsSubmitting(false); 
            } else {
                toast.success(`Замовлення #${response.data.orderId || ''} успішно оформлено!`);
                clearCartForSite(activeGroup.siteId);
                clearSavedCheckoutData();
                navigate('/my-orders');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Помилка оформлення замовлення');
            setIsSubmitting(false);
        }
    };

    const handleLiqPaySelect = () => {
        if (!pendingPaymentOrder?.liqpayData || !pendingPaymentOrder?.liqpaySignature) {
            toast.error("Продавець ще не налаштував LiqPay для цього магазину.");
            return;
        }
        setIsSubmitting(true);
        try {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = 'https://www.liqpay.ua/api/3/checkout';
            form.style.display = 'none';
            const dataInput = document.createElement('input');
            dataInput.name = 'data';
            dataInput.value = pendingPaymentOrder.liqpayData;
            form.appendChild(dataInput);
            const signatureInput = document.createElement('input');
            signatureInput.name = 'signature';
            signatureInput.value = pendingPaymentOrder.liqpaySignature;
            form.appendChild(signatureInput);
            document.body.appendChild(form);
            form.submit();
        } catch (error) {
            console.error("LiqPay Form Error:", error);
            setIsSubmitting(false);
        }
    };

    const handleClosePaymentModal = () => {
        toast.info('Ви зможете оплатити замовлення пізніше в розділі "Мої замовлення".');
        setPendingPaymentOrder(null);
        navigate('/my-orders');
    };

    const getImageUrl = (item) => {
        let gallery = item.image_gallery || item.image_path || item.image;
        let targetPath = null;
        if (Array.isArray(gallery) && gallery.length > 0) targetPath = gallery[0];
        else if (typeof gallery === 'string') {
            try { targetPath = gallery.startsWith('[') ? JSON.parse(gallery)[0] : gallery; } 
            catch (e) { targetPath = gallery; }
        }
        if (!targetPath) return 'https://placehold.co/120x120?text=No+Image';
        if (targetPath.startsWith('http')) return targetPath;
        return `${BASE_URL}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
    };

    const renderCheckoutForm = () => {
        if (!activeGroup) return null;
        const noPaymentAvailable = (!activeGroup.isOnlineEnabled && !activeGroup.isCodEnabled) || 
                                   (activeGroup.isDigitalOnly && !activeGroup.isOnlineEnabled);
        return (
            <form onSubmit={handleCheckout} className="space-y-6">
                <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-4 text-(--platform-text-primary) flex items-center gap-2">
                        <User className="text-(--platform-accent)" size={20}/> 1. Ваші дані
                    </h3>
                    <div className="space-y-4">
                        <Input 
                            label="ПІБ отримувача" placeholder="Прізвище та ім'я"
                            value={customerData.name}
                            onChange={(e) => setCustomerData({...customerData, name: e.target.value})}
                            required
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Телефон" type="tel" placeholder="+380..."
                                value={customerData.phone}
                                onChange={(e) => setCustomerData({...customerData, phone: e.target.value})}
                                required
                            />
                            <Input 
                                label="Email" type="email"
                                value={customerData.email} disabled={true} 
                                helperText={activeGroup.isDigitalOnly ? "Сюди ми надішлемо доступ" : "Для чеку"}
                            />
                        </div>
                    </div>
                </div>
                {!activeGroup.isDigitalOnly && (
                    <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h3 className="text-lg font-bold mb-4 text-(--platform-text-primary) flex items-center gap-2">
                            <MapPin className="text-(--platform-accent)" size={20}/> 2. Доставка
                        </h3>
                        <div className="border border-(--platform-border-color) rounded-xl overflow-hidden relative">
                            {customerData.address ? (
                                <div className="p-4 sm:p-5 bg-(--platform-accent)/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="p-2.5 bg-white dark:bg-black/20 text-(--platform-accent) rounded-xl shrink-0 shadow-sm border border-(--platform-accent)/20">
                                            <MapPin size={22} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-(--platform-text-secondary) uppercase tracking-wider mb-0.5">Відділення Нової Пошти</p>
                                            <p className="text-sm font-semibold text-(--platform-text-primary) leading-snug truncate whitespace-normal line-clamp-2">
                                                {customerData.address.replace('Нова Пошта: ', '')}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsMapModalOpen(true)} 
                                        className="shrink-0 w-full sm:w-auto px-4 py-2 bg-(--platform-card-bg) border border-(--platform-border-color) hover:border-(--platform-accent) text-(--platform-text-primary) hover:text-(--platform-accent) text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 group"
                                    >
                                        <Map size={16} className="text-(--platform-text-secondary) group-hover:text-(--platform-accent) transition-colors" />
                                        Змінити
                                    </button>
                                </div>
                            ) : (
                                <div className="p-6 text-center flex flex-col items-center">
                                    <Map size={40} className="text-(--platform-text-secondary) opacity-50 mb-3" />
                                    <p className="text-(--platform-text-secondary) mb-4 text-sm">Оберіть зручне відділення для доставки вашого замовлення.</p>
                                    <Button type="button" onClick={() => setIsMapModalOpen(true)} className="bg-(--platform-accent) text-white hover:opacity-90 transition-all border-none w-full sm:w-auto">
                                        <MapPin size={18} className="mr-2" /> Вибрати на карті
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 shadow-sm sticky top-24">
                    <h3 className="text-lg font-bold mb-4 text-(--platform-text-primary) flex items-center gap-2">
                        <CreditCard className="text-(--platform-accent)" size={20}/> {activeGroup.isDigitalOnly ? '2.' : '3.'} Оплата
                    </h3>
                    <div className="mb-6 space-y-3">
                        <h4 className="text-sm font-semibold text-(--platform-text-secondary) uppercase tracking-wider">Спосіб оплати</h4>
                        {noPaymentAvailable ? (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 flex items-center gap-3">
                                <AlertCircle size={20} className="shrink-0" />
                                <span className="text-sm font-medium">Цей магазин тимчасово не має доступних способів оплати для цих товарів.</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {Boolean(activeGroup.isOnlineEnabled) && (
                                    <label className={`flex items-center p-3 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'online' ? 'border-(--platform-accent) bg-(--platform-accent)/5' : 'border-(--platform-border-color) hover:bg-(--platform-hover-bg)'}`}>
                                        <input 
                                            type="radio" 
                                            name="paymentMethod" 
                                            value="online"
                                            checked={paymentMethod === 'online'}
                                            onChange={() => setPaymentMethod('online')}
                                            className="hidden"
                                        />
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 ${paymentMethod === 'online' ? 'border-(--platform-accent)' : 'border-gray-400'}`}>
                                            {paymentMethod === 'online' && <div className="w-2.5 h-2.5 bg-(--platform-accent) rounded-full"></div>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <CreditCard size={18} className="text-(--platform-text-primary)" />
                                            <span className="font-medium text-(--platform-text-primary)">Оплата онлайн</span>
                                        </div>
                                    </label>
                                )}
                                {!activeGroup.isDigitalOnly && Boolean(activeGroup.isCodEnabled) && (
                                    <label className={`flex items-center p-3 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'cod' ? 'border-(--platform-accent) bg-(--platform-accent)/5' : 'border-(--platform-border-color) hover:bg-(--platform-hover-bg)'}`}>
                                        <input 
                                            type="radio" 
                                            name="paymentMethod" 
                                            value="cod"
                                            checked={paymentMethod === 'cod'}
                                            onChange={() => setPaymentMethod('cod')}
                                            className="hidden"
                                        />
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 ${paymentMethod === 'cod' ? 'border-(--platform-accent)' : 'border-gray-400'}`}>
                                            {paymentMethod === 'cod' && <div className="w-2.5 h-2.5 bg-(--platform-accent) rounded-full"></div>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Wallet size={18} className="text-(--platform-text-primary)" />
                                            <span className="font-medium text-(--platform-text-primary)">Оплата при отриманні</span>
                                        </div>
                                    </label>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="space-y-3 mb-6 bg-black/5 dark:bg-white/5 p-4 rounded-xl">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-(--platform-text-primary)">Вартість товарів:</span>
                            <span className="text-2xl font-bold text-(--platform-text-primary)">
                                {activeGroup.total.toFixed(0)} {activeGroup.currencySymbol}
                            </span>
                        </div>
                        {activeGroup.totalDiscount > 0 && (
                            <div className="flex justify-between text-sm text-green-500 font-medium pt-2 border-t border-(--platform-border-color)/50">
                                <span>Економія (знижка):</span>
                                <span>-{activeGroup.totalDiscount.toFixed(0)} {activeGroup.currencySymbol}</span>
                            </div>
                        )}
                        {!activeGroup.isDigitalOnly && (
                            <div className="flex justify-between text-sm text-(--platform-text-secondary) pt-2 border-t border-(--platform-border-color)/50">
                                <span>{paymentMethod === 'cod' ? 'Доставка та комісія НП:' : 'Доставка (Нова Пошта):'}</span>
                                <span>Оплачується при отриманні</span>
                            </div>
                        )}
                    </div>
                    {activeGroup.isForbidden && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 flex items-center gap-3 shadow-sm">
                            <AlertCircle size={24} className="shrink-0" />
                            <span className="text-sm font-semibold">
                                Ви не можете оформити замовлення {activeGroup.isOwner ? 'у власному магазині' : 'на сайті, де ви є співавтором'}.
                            </span>
                        </div>
                    )}
                    <Button 
                        type="submit" 
                        className="w-full h-14 text-lg font-bold bg-(--platform-accent) hover:opacity-90 text-white border-none shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSubmitting || noPaymentAvailable || activeGroup.isForbidden}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="animate-spin mr-2" /> Обробка...</>
                        ) : (
                            <>{paymentMethod === 'online' ? 'Створити та оплатити' : 'Підтвердити замовлення'}</>
                        )}
                    </Button>
                </div>
            </form>
        );
    };

    const renderEmptyFormState = () => (
        <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-8 text-center shadow-sm h-full flex flex-col items-center justify-center min-h-100">
            <Store size={64} className="text-(--platform-text-secondary) opacity-20 mb-6" />
            <h3 className="text-xl font-bold text-(--platform-text-primary) mb-2">
                Оформлення замовлення
            </h3>
            <p className="text-(--platform-text-secondary) text-sm max-w-xs mx-auto">
                Виберіть магазин у списку ліворуч, щоб переглянути деталі та оформити замовлення.
            </p>
        </div>
    );

    if (!isLoaded || isRedirecting) return <LoadingState layout="page" />;
    return (
        <>
            <div className="p-4 md:p-8 max-w-360 mx-auto w-full h-full flex flex-col">
                <div className="shrink-0 mb-6">
                    <h1 className="text-3xl font-extrabold text-(--platform-text-primary) tracking-tight flex items-center gap-3">
                        <ShoppingBag className="text-(--platform-accent)" size={32}/> Кошик
                    </h1>
                </div>
                {cartItems.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                        <EmptyState 
                            icon={PackageOpen} 
                            title="Ваш кошик порожній" 
                            description="Знайдіть товари в каталозі та додайте їх сюди." 
                        />
                    </div>
                ) : (
                    <div className="grid lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-7 xl:col-span-7 space-y-6">
                            {groupedItems.map((group) => {
                                const isActive = activeSiteId === group.siteId;
                                return (
                                    <div 
                                        key={group.siteId} 
                                        onClick={() => setActiveSiteId(group.siteId)}
                                        className={`bg-(--platform-card-bg) border-2 rounded-2xl overflow-hidden shadow-sm cursor-pointer transition-all duration-300 ${
                                            isActive 
                                                ? 'border-(--platform-accent) shadow-md' 
                                                : 'border-(--platform-border-color) hover:border-(--platform-accent)/50'
                                        }`}
                                    >
                                        <div className="px-5 py-4 border-b border-(--platform-border-color) flex items-center justify-between bg-black/5">
                                            <div className="flex items-center gap-3">
                                                <Store size={22} className={isActive ? 'text-(--platform-accent)' : 'text-(--platform-text-secondary)'} />
                                                <Link 
                                                    to={`/site/${group.sitePath}`} onClick={(e) => e.stopPropagation()}
                                                    className={`text-lg font-bold uppercase tracking-wide hover:underline ${isActive ? 'text-(--platform-text-primary)' : 'text-(--platform-text-secondary)'}`}
                                                >
                                                    {group.siteName}
                                                </Link>
                                            </div>
                                            {isActive && (
                                                <div className="flex items-center gap-1.5 text-sm font-bold text-(--platform-accent)">
                                                    <CheckCircle2 size={18} /> Оформлюємо
                                                </div>
                                            )}
                                        </div>
                                        <div className="divide-y divide-(--platform-border-color)">
                                            {group.items.map((item) => (
                                                <div key={item.cartItemId} className="p-5 flex flex-col sm:flex-row gap-5 items-start">
                                                    <div className="w-24 h-24 bg-(--platform-bg) rounded-xl border border-(--platform-border-color) overflow-hidden shrink-0 flex items-center justify-center p-2">
                                                        <img src={getImageUrl(item)} alt={item.name} className="w-full h-full object-contain" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 w-full flex flex-col">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <div>
                                                                <Link 
                                                                    to={`/site/${group.sitePath}/product/${item.id}`} onClick={(e) => e.stopPropagation()} 
                                                                    className="text-lg font-bold text-(--platform-text-primary) hover:text-(--platform-accent) leading-tight block mb-1"
                                                                >
                                                                    {item.name}
                                                                </Link>
                                                                {item.type === 'digital' && (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs font-bold uppercase">
                                                                        <Download size={12}/> Цифровий
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                {item.originalPrice && parseFloat(item.originalPrice) > parseFloat(item.price) && (
                                                                    <p className="text-xs text-(--platform-text-secondary) line-through m-0">
                                                                        {(item.originalPrice * item.quantity).toFixed(0)} {group.currencySymbol}
                                                                    </p>
                                                                )}
                                                                <p className="text-xl font-bold text-(--platform-text-primary) m-0">
                                                                    {(item.price * item.quantity).toFixed(0)} {group.currencySymbol}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 flex items-center justify-between">
                                                            <div className="flex items-center bg-(--platform-bg) border border-(--platform-border-color) rounded-lg p-1" onClick={e => e.stopPropagation()}>
                                                                <button 
                                                                    className="p-1.5 text-(--platform-text-secondary) hover:text-(--platform-accent) disabled:opacity-30"
                                                                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.cartItemId, item.quantity - 1); }}
                                                                    disabled={item.quantity <= 1} type="button"
                                                                >
                                                                    <Minus size={16} />
                                                                </button>
                                                                <span className="w-10 text-center font-bold text-(--platform-text-primary)">{item.quantity}</span>
                                                                <button 
                                                                    className="p-1.5 text-(--platform-text-secondary) hover:text-(--platform-accent) disabled:opacity-30"
                                                                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.cartItemId, item.quantity + 1); }}
                                                                    disabled={item.type !== 'digital' && item.stock_quantity != null && item.quantity >= item.stock_quantity}
                                                                    type="button"
                                                                >
                                                                    <Plus size={16} />
                                                                </button>
                                                            </div>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); promptRemoveItem(item); }}
                                                                className="text-sm flex items-center gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                                                                type="button"
                                                            >
                                                                <Trash2 size={16} /> Видалити
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {isActive && (
                                            <div className="lg:hidden bg-(--platform-bg) border-t-2 border-(--platform-accent) p-4 sm:p-6">
                                                {renderCheckoutForm()}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div className="pt-2 flex justify-end">
                                <Button variant="ghost" onClick={promptClearCart} className="text-red-500 hover:bg-red-500/10">
                                    <Trash2 size={16} className="mr-2" /> Очистити весь кошик
                                </Button>
                            </div>
                        </div>
                        <div className="hidden lg:block lg:col-span-5 xl:col-span-5 h-full relative">
                            {renderCheckoutForm()}
                        </div>
                    </div>
                )}
            </div>
            <ConfirmModal
                isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message}
                confirmLabel="Видалити" cancelLabel="Скасувати" type="danger"
                onConfirm={handleConfirmAction} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
            />
            <NovaPoshtaMapModal 
                isOpen={isMapModalOpen}
                onClose={() => setIsMapModalOpen(false)}
                onSelect={(addressString) => {
                    setCustomerData({...customerData, address: addressString});
                }}
            />
            <PaymentMethodModal 
                isOpen={!!pendingPaymentOrder}
                onClose={handleClosePaymentModal}
                amount={pendingPaymentOrder?.totalAmount}
                currencySymbol={pendingPaymentOrder?.currencySymbol}
                isLoading={isSubmitting}
                onSelectLiqPay={handleLiqPaySelect}
            />
        </>
    );
};

export default CartPage;