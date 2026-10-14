// frontend/src/modules/dashboard/features/commerce/components/OrdersTab.jsx
import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../../../../shared/api/api';
import { toast } from 'react-toastify';
import CustomSelect from '../../../../../shared/ui/elements/CustomSelect';
import { Input } from '../../../../../shared/ui/elements/Input';
import { Button } from '../../../../../shared/ui/elements/Button';
import DateRangePicker from '../../../../../shared/ui/elements/DateRangePicker';
import EmptyState from '../../../../../shared/ui/complex/EmptyState';
import LoadingState from '../../../../../shared/ui/complex/LoadingState';
import { Package, MapPin, User, Calendar, Search, CreditCard, Wallet } from 'lucide-react';

const STATUS_MAP = {
    'pending': { label: 'Очікує оплати', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-500' },
    'paid': { label: 'Оплачено (В обробці)', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-500' },
    'shipped': { label: 'Відправлено', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-500' },
    'completed': { label: 'Виконано', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-500' },
    'cancelled': { label: 'Скасовано', color: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-500' }
};

const PAYMENT_METHOD_MAP = {
    online: { label: 'Оплата картою (LiqPay)', icon: CreditCard, color: 'text-blue-600 dark:text-blue-400' },
    cod: { label: 'Оплата при отриманні', icon: Wallet, color: 'text-amber-600 dark:text-amber-500' }
};

const STATUS_OPTIONS = Object.entries(STATUS_MAP)
    .filter(([key]) => key !== 'pending')
    .map(([key, val]) => ({
        value: key,
        label: val.label
    }));

const FILTER_STATUS_OPTIONS = [
    { value: 'all', label: 'Всі статуси' },
    ...Object.entries(STATUS_MAP).map(([key, val]) => ({
        value: key,
        label: val.label
    }))
];

const FILTER_TYPE_OPTIONS = [
    { value: 'all', label: 'Всі типи' },
    { value: 'digital', label: 'Тільки цифрові' },
    { value: 'physical', label: 'Містять фізичні' }
];

const SORT_FIELDS = [
    { value: 'date', label: 'За датою' },
    { value: 'amount', label: 'За сумою' },
    { value: 'id', label: 'За номером' }
];

const OrdersTab = ({ site, siteData }) => {
    const currentSite = site || siteData;
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const currencyMap = { 'UAH': '₴', 'USD': '$', 'EUR': '€' };
    const siteCurrency = currentSite?.currency || 'UAH';
    const currencySymbol = currencyMap[siteCurrency] || '₴';
    useEffect(() => {
        if (!currentSite?.id) {
            setLoading(false);
            return;
        }
        const fetchOrders = async () => {
            setLoading(true);
            try {
                const res = await apiClient.get(`/orders/site/${currentSite.id}`);
                setOrders(res.data || []);
            } catch (err) {
                console.error(err);
                toast.error('Не вдалося завантажити замовлення');
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, [currentSite]);

    const handleStatusChange = async (orderId, newStatus) => {
        try {
            await apiClient.put(`/orders/${orderId}/status`, { status: newStatus });
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            toast.success('Статус замовлення оновлено');
        } catch (error) {
            console.error('Помилка оновлення статусу:', error);
            toast.error('Не вдалося оновити статус');
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} о ${hours}:${minutes}`;
    };

    const clearFilters = () => {
        search && setSearch('');
        statusFilter !== 'all' && setStatusFilter('all');
        typeFilter !== 'all' && setTypeFilter('all');
        startDate && setStartDate('');
        endDate && setEndDate('');
    };

    const getStatusControl = (order) => {
        const hasItems = order.items && order.items.length > 0;
        const isDigitalOnly = hasItems && order.items.every(item => item.type === 'digital');
        const isDisabled = (order.status === 'pending' && order.payment_method === 'online') || isDigitalOnly || order.status === 'cancelled';
        let config = STATUS_MAP[order.status] || STATUS_MAP['pending'];
        if (order.status === 'pending' && order.payment_method === 'cod') {
            config = { label: 'Нове замовлення (Наложка)', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
        }

        if (isDisabled) {
            return (
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${config.color} shadow-sm`}>
                    {config.label}
                    {isDigitalOnly && order.status !== 'pending' && order.status !== 'cancelled' && (
                        <span className="opacity-75 text-[10px] uppercase tracking-wider bg-black/5 dark:bg-white/10 px-1.5 rounded">(Авто)</span>
                    )}
                </span>
            );
        }
        return (
            <div className="w-56">
                <CustomSelect
                    name="status"
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    options={order.status === 'pending' ? [{ value: 'pending', label: 'Нове замовлення' }, ...STATUS_OPTIONS] : STATUS_OPTIONS}
                />
            </div>
        );
    };

    const processedOrders = useMemo(() => {
        let result = [...orders];
        if (search.trim()) {
            const query = search.toLowerCase();
            result = result.filter(o =>
                o.id.toString().toLowerCase().includes(query) ||
                (o.customer_name || '').toLowerCase().includes(query) ||
                (o.customer_email || '').toLowerCase().includes(query) ||
                (o.customer_phone || '').includes(query)
            );
        }
        if (statusFilter !== 'all') {
            result = result.filter(o => o.status === statusFilter);
        }
        if (typeFilter === 'digital') {
            result = result.filter(o => o.items && o.items.length > 0 && o.items.every(item => item.type === 'digital'));
        } else if (typeFilter === 'physical') {
            result = result.filter(o => o.items && o.items.some(item => item.type !== 'digital'));
        }
        if (startDate) {
            const start = new Date(`${startDate}T00:00:00`);
            result = result.filter(o => new Date(o.created_at) >= start);
        }
        if (endDate) {
            const end = new Date(`${endDate}T23:59:59`);
            result = result.filter(o => new Date(o.created_at) <= end);
        }
        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'date') {
                comparison = new Date(a.created_at) - new Date(b.created_at);
            } else if (sortBy === 'amount') {
                comparison = parseFloat(a.total_amount) - parseFloat(b.total_amount);
            } else if (sortBy === 'id') {
                comparison = a.id.toString().localeCompare(b.id.toString());
            }
            return sortOrder === 'asc' ? comparison : comparison * -1;
        });
        return result;
    }, [orders, search, statusFilter, typeFilter, startDate, endDate, sortBy, sortOrder]);

    const toggleSortOrder = () => {
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    };

    if (loading) {
        return <LoadingState title="Завантаження замовлень..." />;
    }

    const hasActiveFilters = search || statusFilter !== 'all' || typeFilter !== 'all' || startDate || endDate;
    return (
        <div className="flex flex-col h-full bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) overflow-hidden">
            <div className="min-h-18 p-3 sm:px-5 border-b border-(--platform-border-color) flex justify-between items-center gap-3 flex-wrap bg-(--platform-bg) shrink-0">
                <div className="flex gap-2 flex-1 items-center flex-wrap">
                    <Input
                        leftIcon={<Search size={16} />}
                        placeholder="Пошук..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        wrapperStyle={{ margin: 0, flex: '1 1 180px' }}
                    />
                    <DateRangePicker 
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                        onClear={() => {setStartDate(''); setEndDate('');}}
                    />
                    <div className="w-44">
                        <CustomSelect
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            options={FILTER_STATUS_OPTIONS}
                        />
                    </div>
                    <div className="w-44">
                        <CustomSelect
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            options={FILTER_TYPE_OPTIONS}
                        />
                    </div>
                    <div className="flex gap-1 items-center">
                        <div className="w-40">
                            <CustomSelect
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                options={SORT_FIELDS}
                            />
                        </div>
                        <Button 
                            variant="outline" 
                            onClick={toggleSortOrder} 
                            className="w-10.5 h-10.5 p-0 flex items-center justify-center shrink-0"
                            title={sortOrder === 'desc' ? "За спаданням" : "За зростанням"}
                        >
                            <span className="text-lg leading-none">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                        </Button>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                {processedOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10">
                        <EmptyState 
                            title={orders.length === 0 ? "Замовлень поки немає" : "Замовлень не знайдено"}
                            description={
                                orders.length === 0 
                                ? "Коли клієнти зроблять покупку, вони з'являться тут." 
                                : "За вашим запитом або фільтрами нічого не знайдено. Спробуйте змінити критерії пошуку."
                            }
                            icon={orders.length === 0 ? Package : Search}
                            action={
                                hasActiveFilters && (
                                    <Button variant="ghost" onClick={clearFilters}>
                                        Очистити фільтри
                                    </Button>
                                )
                            }
                        />
                    </div>
                ) : (
                    <div className="flex flex-col gap-5">
                        {processedOrders.map(order => {
                            const paymentConfig = PAYMENT_METHOD_MAP[order.payment_method] || PAYMENT_METHOD_MAP.online;
                            const PaymentIcon = paymentConfig.icon;
                            return (
                                <div key={order.id} className="bg-(--platform-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:shadow-md hover:border-(--platform-text-secondary)/30">
                                    <div className="flex justify-between items-start border-b border-(--platform-border-color)/60 pb-5 mb-5 flex-wrap gap-4">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <span className="font-bold text-xl text-(--platform-text-primary)">
                                                    Замовлення #{order.id}
                                                </span>
                                                {getStatusControl(order)}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-(--platform-text-secondary) font-medium">
                                                <Calendar size={14} className="text-(--platform-text-secondary)"/>
                                                <span>{formatDate(order.created_at)}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-4 flex-wrap justify-end">
                                            <div className="text-right bg-(--platform-card-bg) border border-(--platform-border-color) rounded-xl px-4 py-3 shadow-sm flex flex-col justify-center">
                                                <div className="text-xs font-medium text-(--platform-text-secondary) mb-1 uppercase tracking-wide">Спосіб оплати</div>
                                                <div className={`text-sm font-bold flex items-center justify-end gap-1.5 ${paymentConfig.color}`}>
                                                    <PaymentIcon size={16} />
                                                    {paymentConfig.label}
                                                </div>
                                            </div>
                                            <div className="text-right bg-(--platform-card-bg) border border-(--platform-border-color) rounded-xl px-5 py-3 shadow-sm">
                                                <div className="text-xs font-medium text-(--platform-text-secondary) mb-1 uppercase tracking-wide">Сума замовлення</div>
                                                <div className="text-2xl font-bold text-(--platform-accent)">
                                                    {parseFloat(order.total_amount).toFixed(2)} {currencySymbol}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-(--platform-card-bg) border border-(--platform-border-color) p-5 rounded-xl text-sm text-(--platform-text-primary) shadow-sm">
                                            <h4 className="font-bold text-base mb-4 flex items-center gap-2 pb-3 border-b border-(--platform-border-color)/60">
                                                <User size={18} className="text-(--platform-text-secondary)"/> 
                                                Дані клієнта
                                            </h4>
                                            <div className="flex flex-col gap-3">
                                                <div className="flex gap-3 items-center">
                                                    <span className="text-(--platform-text-secondary) w-20 font-medium">Ім'я:</span> 
                                                    <span className="font-semibold">{order.customer_name}</span>
                                                </div>
                                                <div className="flex gap-3 items-center">
                                                    <span className="text-(--platform-text-secondary) w-20 font-medium">Email:</span> 
                                                    <a href={`mailto:${order.customer_email}`} className="text-(--platform-accent) hover:underline font-medium">
                                                        {order.customer_email}
                                                    </a>
                                                </div>
                                                <div className="flex gap-3 items-center">
                                                    <span className="text-(--platform-text-secondary) w-20 font-medium">Телефон:</span> 
                                                    <span className="font-medium">{order.customer_phone || '—'}</span>
                                                </div>
                                                <div className="flex gap-3 mt-2 pt-3 border-t border-(--platform-border-color)/60">
                                                    <MapPin size={16} className="text-(--platform-text-secondary) shrink-0 mt-0.5"/> 
                                                    <span className={`${order.delivery_address === 'Цифрова доставка' ? 'text-blue-500 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-md text-xs uppercase tracking-wide border border-blue-500/20' : 'font-medium'}`}>
                                                        {order.delivery_address || 'Не вказано'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-(--platform-card-bg) border border-(--platform-border-color) p-5 rounded-xl shadow-sm">
                                            <h4 className="font-bold text-base mb-4 flex items-center gap-2 pb-3 border-b border-(--platform-border-color)/60 text-(--platform-text-primary)">
                                                <Package size={18} className="text-(--platform-text-secondary)"/>
                                                Товари ({order.items?.length || 0})
                                            </h4>
                                            <div className="flex flex-col gap-3">
                                                {order.items?.map(item => {
                                                    const opts = item.options ? (typeof item.options === 'string' ? JSON.parse(item.options) : item.options) : {};
                                                    return (
                                                        <div key={item.id} className="flex justify-between items-start text-sm p-4 border border-(--platform-border-color) rounded-lg bg-(--platform-bg)">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-(--platform-text-primary) text-base flex items-center flex-wrap gap-2">
                                                                    {item.product_name}
                                                                    {item.type === 'digital' && (
                                                                        <span className="text-[10px] bg-blue-500/10 text-blue-600 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Цифр.</span>
                                                                    )}
                                                                </span>
                                                                {Object.entries(opts).length > 0 && (
                                                                    <div className="text-xs text-(--platform-text-secondary) mt-1.5 font-medium bg-(--platform-card-bg) inline-block px-2 py-1 rounded border border-(--platform-border-color)">
                                                                        {Object.entries(opts).map(([k,v]) => `${k}: ${v.label || v}`).join(', ')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-right ml-4 shrink-0 flex flex-col justify-center">
                                                                <div className="font-bold text-(--platform-text-primary) text-base">{item.quantity} шт.</div>
                                                                <div className="text-(--platform-text-secondary) text-xs font-medium mt-0.5">
                                                                    {parseFloat(item.price).toFixed(0)} {currencySymbol}/шт.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrdersTab;