// frontend/src/pages/UpgradePage.jsx
import React, { useContext, useState } from 'react';
import { AuthContext } from '../app/providers/AuthContext';
import { Button } from '../shared/ui/elements';
import apiClient from '../shared/api/api';
import { toast } from 'react-toastify';
import PaymentMethodModal from '../shared/ui/complex/PaymentMethodModal';
import { Check, Zap, Star, Loader2 } from 'lucide-react';

const UpgradePage = () => {
    const { user } = useContext(AuthContext);
    const [isLoading, setIsLoading] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const handleLiqPaySelect = async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.post('/transactions/upgrade');
            const { data, signature } = res.data;
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = 'https://www.liqpay.ua/api/3/checkout';
            form.style.display = 'none';
            const dataInput = document.createElement('input');
            dataInput.name = 'data';
            dataInput.value = data;
            form.appendChild(dataInput);
            const signatureInput = document.createElement('input');
            signatureInput.name = 'signature';
            signatureInput.value = signature;
            form.appendChild(signatureInput);
            document.body.appendChild(form);
            form.submit();
        } catch (error) {
            console.error("Помилка генерації платежу:", error);
            toast.error(error.response?.data?.message || 'Не вдалося створити платіж LiqPay.');
            setIsLoading(false);
        }
    };

    if (!user) return null;
    const isPremium = user.plan === 'PLUS' || user.plan === 'ADMIN';
    return (
        <div className="max-w-5xl mx-auto w-full pt-4 pb-12">
            <div className="text-center mb-12 mt-4">
                <div className="inline-flex items-center justify-center p-3 bg-(--platform-accent)/10 rounded-2xl mb-4 text-(--platform-accent)">
                    <Star size={32} />
                </div>
                <h1 className="text-3xl md:text-5xl font-extrabold text-(--platform-text-primary) mb-4 tracking-tight">
                    Розширте свої ліміти з <span className="text-(--platform-accent)">Kendr PLUS</span>
                </h1>
                <p className="text-lg text-(--platform-text-secondary) max-w-2xl mx-auto">
                    Отримайте більше сайтів, збільшені ліміти для товарів та розширене сховище для медіа. 
                    Ідеальне рішення для повноцінної роботи ваших проектів.
                </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-3xl p-8 flex flex-col opacity-80">
                    <h3 className="text-xl font-bold text-(--platform-text-primary) mb-2">FREE</h3>
                    <p className="text-(--platform-text-secondary) text-sm mb-6 pb-6 border-b border-(--platform-border-color)">
                        Базові можливості для старту
                    </p>
                    <div className="flex-1 space-y-4 mb-8">
                        <FeatureItem text={<>До <strong>3</strong> активних сайтів</>} />
                        <FeatureItem text={<>До <strong>50</strong> товарів на магазин</>} />
                        <FeatureItem text={<>До <strong>20</strong> категорій</>} />
                        <FeatureItem text={<><strong>50</strong> медіафайлів (макс. <strong>5 МБ</strong>)</>} />
                    </div>
                    <div className="text-center py-4 text-(--platform-text-secondary) font-medium bg-black/5 dark:bg-white/5 rounded-xl">
                        Ваш поточний тариф
                    </div>
                </div>
                <div className="bg-(--platform-card-bg) border-2 border-(--platform-accent) rounded-3xl p-8 flex flex-col relative shadow-xl shadow-(--platform-accent)/10 transform md:-translate-y-4">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-(--platform-accent) text-white text-xs font-bold uppercase tracking-wider py-1 px-4 rounded-full flex items-center gap-1">
                        <Zap size={14} /> Рекомендовано
                    </div>
                    <h3 className="text-2xl font-bold text-(--platform-accent) mb-2">PLUS</h3>
                    <div className="flex items-end gap-1 mb-6 pb-6 border-b border-(--platform-border-color)">
                        <span className="text-4xl font-extrabold text-(--platform-text-primary)">299</span>
                        <span className="text-(--platform-text-secondary) font-medium mb-1">грн <span className="text-xs">/ назавжди</span></span>
                    </div>
                    <div className="flex-1 space-y-4 mb-8">
                        <FeatureItem text={<>До <strong>8</strong> активних сайтів</>} active />
                        <FeatureItem text={<>До <strong>200</strong> товарів на магазин</>} active />
                        <FeatureItem text={<>До <strong>100</strong> категорій</>} active />
                        <FeatureItem text={<><strong>150</strong> медіафайлів (макс. <strong>15 МБ</strong>)</>} active />
                    </div>
                    <Button 
                        size="lg" 
                        className={`w-full text-lg font-bold min-h-14 border-none shadow-md ${isPremium ? 'bg-(--platform-border-color) text-(--platform-text-secondary)' : 'bg-(--platform-accent) text-white hover:opacity-90'}`}
                        onClick={() => setIsPaymentModalOpen(true)}
                        disabled={isPremium || isLoading}
                    >
                        {isPremium ? 'Ви вже маєте цей тариф' : 'Оплатити доступ'}
                    </Button>
                </div>
            </div>
            <PaymentMethodModal 
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                amount="299.00"
                isLoading={isLoading}
                onSelectLiqPay={handleLiqPaySelect}
            />
        </div>
    );
};

const FeatureItem = ({ text, active = false }) => (
    <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-full shrink-0 ${active ? 'bg-(--platform-accent)/20 text-(--platform-accent)' : 'bg-(--platform-text-secondary)/20 text-(--platform-text-secondary)'}`}>
            <Check size={14} strokeWidth={3} />
        </div>
        <span className={`${active ? 'text-(--platform-text-primary)' : 'text-(--platform-text-secondary)'} text-[15px]`}>
            {text}
        </span>
    </div>
);

export default UpgradePage;