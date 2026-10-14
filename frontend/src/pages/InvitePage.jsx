// frontend/src/pages/InvitePage.jsx
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../app/providers/AuthContext';
import apiClient from '../shared/api/api';
import { toast } from 'react-toastify';
import { Button } from '../shared/ui/elements';
import { Loader, Users, CheckCircle, XCircle } from 'lucide-react';

const InvitePage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, isLoading: isAuthLoading } = useContext(AuthContext);
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const hasRequested = useRef(false);
    useEffect(() => {
        if (isAuthLoading) return;
        if (!isAuthenticated) {
            setStatus('unauth');
            return;
        }
        if (hasRequested.current) return;
        hasRequested.current = true;
        acceptInvite();
    }, [isAuthenticated, isAuthLoading, token]);
    
    const acceptInvite = async () => {
        setStatus('loading');
        try {
            await apiClient.post('/team/invite/accept', { token });
            setStatus('success');
            toast.success('Ви успішно приєдналися до проєкту!');
            setTimeout(() => {
                navigate('/my-sites');
            }, 2000);
        } catch (error) {
            setStatus('error');
            setErrorMessage(error.response?.data?.message || 'Помилка прийняття запрошення');
        }
    };
    
    const handleAuthRedirect = () => {
        // Адресу повернення читає AuthPage зі стану навігації (location.state.from), тож передаємо її так (D-CON-03).
        navigate('/login', { state: { from: `/invite/${token}` } });
    };
    
    if (isAuthLoading) {
        return (
            <div className="min-h-screen bg-(--platform-bg) flex items-center justify-center">
                <Loader className="animate-spin text-(--platform-accent)" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-(--platform-bg) flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-(--platform-card-bg) border border-(--platform-border-color) rounded-3xl shadow-xl p-8 text-center animate-in fade-in zoom-in-95 duration-300">
                {status === 'loading' && (
                    <div className="flex flex-col items-center">
                        <Loader size={48} className="animate-spin text-(--platform-accent) mb-5" />
                        <h2 className="text-xl font-bold text-(--platform-text-primary) mb-2">Перевірка запрошення...</h2>
                        <p className="text-(--platform-text-secondary)">Будь ласка, зачекайте</p>
                    </div>
                )}
                {status === 'unauth' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-(--platform-accent)/10 rounded-full flex items-center justify-center mb-6">
                            <Users size={36} className="text-(--platform-accent)" />
                        </div>
                        <h2 className="text-2xl font-bold text-(--platform-text-primary) mb-3">Вас запросили до команди!</h2>
                        <p className="text-(--platform-text-secondary) mb-8">
                            Вам потрібно увійти або зареєструватися, щоб прийняти це запрошення та почати редагувати сайт.
                        </p>
                        <Button onClick={handleAuthRedirect} className="w-full h-12 text-base">
                            Увійти / Зареєструватися
                        </Button>
                    </div>
                )}
                {status === 'success' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-(--platform-accent)/10 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle size={40} className="text-(--platform-accent)" />
                        </div>
                        <h2 className="text-2xl font-bold text-(--platform-text-primary) mb-3">Запрошення прийнято!</h2>
                        <p className="text-(--platform-text-secondary) mb-8">
                            Тепер ви маєте доступ до цього сайту. Перенаправляємо вас до панелі керування...
                        </p>
                        <Button onClick={() => navigate('/my-sites')} variant="outline" className="w-full h-12 text-base">
                            Перейти до моїх сайтів
                        </Button>
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-(--platform-accent)/10 rounded-full flex items-center justify-center mb-6">
                            <XCircle size={40} className="text-(--platform-accent)" />
                        </div>
                        <h2 className="text-2xl font-bold text-(--platform-text-primary) mb-3">Упс, помилка</h2>
                        <p className="text-(--platform-text-secondary) mb-8">{errorMessage}</p>
                        <Button onClick={() => navigate('/')} variant="outline" className="w-full h-12 text-base">
                            На головну
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvitePage;