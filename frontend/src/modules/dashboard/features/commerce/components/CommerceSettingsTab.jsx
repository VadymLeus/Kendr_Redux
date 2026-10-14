// frontend/src/modules/dashboard/features/commerce/components/CommerceSettingsTab.jsx
import React, { useState, useEffect } from 'react';
import { Button, Input, Switch } from '../../../../../shared/ui/elements';
import CustomSelect from '../../../../../shared/ui/elements/CustomSelect';
import apiClient from '../../../../../shared/api/api';
import { toast } from 'react-toastify';
import { CreditCard, Key, Lock, AlertCircle, Banknote, Wallet, Info } from 'lucide-react';

const CURRENCY_OPTIONS = [
    { value: 'UAH', label: 'Гривня – ₴', icon: Banknote },
    { value: 'USD', label: 'Долар – $', icon: Banknote },
    { value: 'EUR', label: 'Євро – €', icon: Banknote }
];

const CommerceSettingsTab = ({ siteData, onSavingChange }) => {
    const [currency, setCurrency] = useState(siteData?.currency || 'UAH');
    const [localPayment, setLocalPayment] = useState({
        public: siteData?.liqpay_public_key || '',
        private: siteData?.liqpay_private_key || '',
        isOnlineEnabled: siteData?.is_online_payment_enabled ?? true,
        isCodEnabled: siteData?.is_cod_enabled ?? true
    });
    const [savedPayment, setSavedPayment] = useState({
        public: siteData?.liqpay_public_key || '',
        private: siteData?.liqpay_private_key || '',
        isOnlineEnabled: siteData?.is_online_payment_enabled ?? true,
        isCodEnabled: siteData?.is_cod_enabled ?? true
    });

    useEffect(() => {
        const newData = {
            public: siteData?.liqpay_public_key || '',
            private: siteData?.liqpay_private_key || '',
            isOnlineEnabled: siteData?.is_online_payment_enabled ?? true,
            isCodEnabled: siteData?.is_cod_enabled ?? true
        };
        setLocalPayment(newData);
        setSavedPayment(newData);
    }, [siteData]);

    const handleCurrencyChange = async (e) => {
        const newCurrency = e.target.value;
        setCurrency(newCurrency);
        onSavingChange(true);
        try {
            await apiClient.put(`/sites/${siteData.site_path}/settings`, { currency: newCurrency });
            toast.success("Валюту магазину оновлено!");
        } catch (error) {
            console.error(error);
            toast.error("Не вдалося оновити валюту.");
            setCurrency(siteData.currency || 'UAH');
        } finally {
            onSavingChange(false);
        }
    };

    const handlePaymentToggle = (field) => {
        setLocalPayment(prev => {
            const newState = { ...prev, [field]: !prev[field] };
            if (!newState.isOnlineEnabled && !newState.isCodEnabled) {
                toast.warning('Має бути увімкнений хоча б один спосіб оплати!');
                return prev;
            }
            return newState;
        });
    };

    const handlePaymentSave = async () => {
        onSavingChange(true);
        try {
            await apiClient.put(`/sites/${siteData.site_path}/settings`, {
                liqpay_public_key: localPayment.public,
                liqpay_private_key: localPayment.private,
                is_online_payment_enabled: localPayment.isOnlineEnabled ? 1 : 0,
                is_cod_enabled: localPayment.isCodEnabled ? 1 : 0
            });
            setSavedPayment({ ...localPayment });
            toast.success('Налаштування оплати успішно збережено!');
        } catch (error) {
            console.error(error);
            toast.error('Не вдалося зберегти налаштування оплати.');
        } finally {
            onSavingChange(false);
        }
    };

    const isPaymentDirty = 
        localPayment.public !== savedPayment.public || 
        localPayment.private !== savedPayment.private ||
        localPayment.isOnlineEnabled !== savedPayment.isOnlineEnabled ||
        localPayment.isCodEnabled !== savedPayment.isCodEnabled;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-1 flex flex-col gap-6">
            <div className="bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) p-8 shadow-sm w-full max-w-3xl mx-auto">
                <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-semibold text-(--platform-text-primary) m-0 mb-1 flex items-center gap-2.5">
                            <Banknote size={22} className="text-(--platform-accent)" /> Валюта магазину
                        </h3>
                        <p className="text-sm text-(--platform-text-secondary) m-0 leading-relaxed">
                            Оберіть основну валюту, в якій будуть відображатися ціни на товари та суми замовлень.
                        </p>
                    </div>
                </div>
                <div className="max-w-xs mx-auto">
                    <label className="block mb-2 font-medium text-(--platform-text-primary) text-sm text-center w-full">
                        Поточна валюта
                    </label>
                    <CustomSelect 
                        value={currency} 
                        onChange={handleCurrencyChange}
                        options={CURRENCY_OPTIONS}
                    />
                </div>
            </div>
            <div className="bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) p-8 shadow-sm w-full max-w-3xl mx-auto">
                <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-semibold text-(--platform-text-primary) m-0 mb-1 flex items-center gap-2.5">
                            <CreditCard size={22} className="text-(--platform-accent)" /> Варіанти оплати
                        </h3>
                        <p className="text-sm text-(--platform-text-secondary) m-0 leading-relaxed">
                            Налаштуйте, як клієнти зможуть розраховуватися за ваші товари.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-6 max-w-xl mx-auto w-full">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-(--platform-border-color) bg-(--platform-bg)">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                                <Wallet size={20} />
                            </div>
                            <div>
                                <h4 className="font-semibold text-(--platform-text-primary) text-sm m-0">Оплата при отриманні</h4>
                                <p className="text-xs text-(--platform-text-secondary) m-0 mt-0.5">Клієнт платить на пошті (Накладений платіж).</p>
                            </div>
                        </div>
                        <Switch 
                            checked={localPayment.isCodEnabled} 
                            onChange={() => handlePaymentToggle('isCodEnabled')} 
                        />
                    </div>
                    <div className={`flex flex-col rounded-xl border transition-colors ${localPayment.isOnlineEnabled ? 'border-blue-500/30 bg-blue-500/5' : 'border-(--platform-border-color) bg-(--platform-bg)'}`}>
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${localPayment.isOnlineEnabled ? 'bg-blue-500/10 text-blue-500' : 'bg-(--platform-border-color) text-(--platform-text-secondary)'}`}>
                                    <CreditCard size={20} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-(--platform-text-primary) text-sm m-0">Онлайн оплата (Картка)</h4>
                                    <p className="text-xs text-(--platform-text-secondary) m-0 mt-0.5">
                                        Прийом платежів карткою через LiqPay на сайті.
                                    </p>
                                </div>
                            </div>
                            <Switch 
                                checked={localPayment.isOnlineEnabled} 
                                onChange={() => handlePaymentToggle('isOnlineEnabled')} 
                            />
                        </div>
                        {localPayment.isOnlineEnabled && (
                            <div className="p-4 border-t border-blue-500/20 flex flex-col gap-4 bg-(--platform-bg) rounded-b-xl">
                                <div>
                                    <Input
                                        label="LiqPay Public Key"
                                        value={localPayment.public}
                                        onChange={(e) => setLocalPayment(prev => ({ ...prev, public: e.target.value }))}
                                        placeholder="sandbox_..."
                                        leftIcon={<Key size={16}/>}
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="LiqPay Private Key"
                                        value={localPayment.private}
                                        onChange={(e) => setLocalPayment(prev => ({ ...prev, private: e.target.value }))}
                                        placeholder="sandbox_..."
                                        leftIcon={<Lock size={16}/>}
                                        type="password"
                                    />
                                </div>
                                
                                {(!savedPayment.public || !savedPayment.private) && (
                                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500 flex gap-2 items-center justify-center text-center">
                                        <AlertCircle size={16} className="shrink-0" />
                                        <span>Ключі не налаштовані. Онлайн оплата не працюватиме.</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-center mt-6">
                    <Button 
                        type="button" 
                        onClick={handlePaymentSave}
                        disabled={!isPaymentDirty}
                        className="px-8"
                    >
                        Зберегти налаштування оплати
                    </Button>
                </div>
            </div>
            
        </div>
    );
};

export default CommerceSettingsTab;