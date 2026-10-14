// frontend/src/modules/auth/AuthPage.jsx
import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthContext } from '../../app/providers/AuthContext';
import apiClient from '../../shared/api/api';
import { toast } from 'react-toastify';
import { Input, Button } from '../../shared/ui/elements';
import Avatar from '../../shared/ui/elements/Avatar';
import ImageUploadTrigger from '../../shared/ui/complex/ImageUploadTrigger';
import PasswordStrengthMeter from '../../shared/ui/complex/PasswordStrengthMeter';
import OtpInput from '../../shared/ui/complex/OtpInput';
import { analyzePassword } from '../../shared/utils/validationUtils';
import { GOOGLE_AUTH_URL } from '../../shared/config';
import { useCooldown } from '../../shared/hooks/useCooldown';
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, MailOpen, Trash, Camera, Upload, KeyRound } from 'lucide-react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const TurnstileWidget = React.memo(({ onToken, turnstileRef }) => {
    return (
        <div className="flex justify-center w-full min-h-16.25 sm:scale-100 scale-[0.85] origin-center my-2 sm:my-4 transition-transform">
            <Turnstile 
                siteKey={SITE_KEY} 
                onSuccess={onToken} 
                onExpire={() => onToken('')}
                onError={(err) => {
                    console.warn('Turnstile Error:', err);
                    onToken('');
                }}
                ref={turnstileRef} 
                options={{ retry: 'auto', size: 'normal' }}
            />
        </div>
    );
});

const AuthPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialView = searchParams.get('view') || 'login';
    const [view, setViewInternal] = useState(initialView);
    const [turnstileToken, setTurnstileToken] = useState('');
    const turnstileRef = useRef(null);
    const resetTurnstile = () => {
        setTurnstileToken('');
        turnstileRef.current?.reset();
    };
    const location = useLocation();
    const setView = (newView) => {
        // Стан навігації зберігаємо: з ним сторінка отримала адресу повернення (location.state.from), і перемикання
        // «вхід ↔ реєстрація» не повинно її губити.
        setSearchParams({ view: newView }, { state: location.state });
        setViewInternal(newView);
        resetTurnstile();
    };

    const googleError = searchParams.get('error');
    if (googleError) {
        if (googleError === 'google_auth_failed') {
            toast.error('Не вдалося увійти через Google', { toastId: 'google-err' });
        } else if (googleError === 'auth_failed') {
            toast.error('Помилка авторизації. Будь ласка, перевірте свої дані або спробуйте інший спосіб.', { toastId: 'auth-failed-err' });
        } else if (googleError === 'auth_disabled') {
            toast.error('Авторизація тимчасово призупинена. Ведуться технічні роботи.', { toastId: 'auth-disabled-err' });
        }
        searchParams.delete('error');
        setSearchParams(searchParams);
    }
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();
    const from = location.state?.from || '/';
    const [isLoading, setIsLoading] = useState(false);
    const [isAvatarUploading, setIsAvatarUploading] = useState(false);
    const [resendCooldown, startResendCooldown] = useCooldown('kendr_resend_cooldown');
    const [targetEmail, setTargetEmail] = useState('');
    const [otpPurpose, setOtpPurpose] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isResetCodeVerified, setIsResetCodeVerified] = useState(false);
    useEffect(() => {
        if ((view === 'otp' || view === 'reset_pass') && !targetEmail) {
            setView('login');
        }
    }, [view, targetEmail]);
    const [formData, setFormData] = useState({
        loginInput: '', email: '', username: '', password: '', confirmPassword: '', newPassword: ''
    });
    const [forgotEmail, setForgotEmail] = useState('');
    const [avatarData, setAvatarData] = useState({ file: null, url: null, preview: null });
    const getPageTitle = () => {
        if (view === 'otp') return 'Перевірка пошти | Kendr';
        if (view === 'reset_pass') return 'Створення пароля | Kendr';
        if (view === 'forgot') return 'Відновлення пароля | Kendr';
        if (view === 'register') return 'Реєстрація акаунту | Kendr';
        return 'Вхід до системи | Kendr';
    };

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    const handleGoogleAuth = () => {
        localStorage.setItem('redirectAfterLogin', from);
        window.location.href = GOOGLE_AUTH_URL; 
    };
    
    const handleAvatarUpload = (file) => {
        setIsAvatarUploading(true);
        setAvatarData({ file: file, url: null, preview: URL.createObjectURL(file) });
        setIsAvatarUploading(false);
    };

    const handleRemoveAvatar = (e) => {
        if(e) e.stopPropagation();
        setAvatarData({ file: null, url: null, preview: null });
    };

    const handleError = (error, fallback) => {
        const message = error.response?.data?.message || fallback;
        toast.error(message, { toastId: message });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!turnstileToken) return toast.warning('Будь ласка, пройдіть перевірку безпеки.', { toastId: 'captcha-warn' });
        setIsLoading(true);
        try {
            const res = await apiClient.post('/auth/login', { 
                loginInput: formData.loginInput, 
                password: formData.password,
                turnstileToken
            });
            const isDeleted = res.data.require_restore === true || res.data.user?.status === 'deleted';
            login(res.data.user, res.data.token, isDeleted);
            if (isDeleted) {
                toast.warning(res.data.message || 'Акаунт знаходиться в процесі видалення.', { toastId: 'restore-warn' });
            } else {
                toast.success(`З поверненням, ${res.data.user?.username || ''}!`, { toastId: 'login-success' });
                navigate(from, { replace: true });
            }
        } catch (error) {
            resetTurnstile();
            if (error.response?.status === 403 && error.response?.data?.isNotVerified) {
                setTargetEmail(error.response.data.email);
                setOtpPurpose('VERIFY_EMAIL');
                setOtpCode('');
                setView('otp');
            } else {
                handleError(error, 'Помилка входу');
            }
        } finally { 
            setIsLoading(false); 
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!turnstileToken) return toast.warning('Будь ласка, пройдіть перевірку безпеки.', { toastId: 'captcha-warn' });
        const validation = analyzePassword(formData.password);
        if (validation.isSimple) return toast.warning("Пароль містить надто просту послідовність (123456 або qwerty).", { toastId: 'pass-simple' });
        if (!validation.isValid) return toast.warning("Пароль має містити мінімум 8 символів, велику, малу літеру та цифру.", { toastId: 'pass-invalid' });
        if (formData.password !== formData.confirmPassword) return toast.error("Паролі не співпадають.", { toastId: 'pass-mismatch' });
        setIsLoading(true);
        try {
            const regData = new FormData();
            regData.append('username', formData.username);
            regData.append('email', formData.email);
            regData.append('password', formData.password);
            regData.append('turnstileToken', turnstileToken);
            if (avatarData.file) regData.append('avatar', avatarData.file);
            else if (avatarData.url) regData.append('avatar_url', avatarData.url);
            await apiClient.post('/auth/register', regData);
            setTargetEmail(formData.email);
            setOtpPurpose('VERIFY_EMAIL');
            setOtpCode('');
            setView('otp');
        } catch (error) { 
            resetTurnstile();
            handleError(error, 'Помилка реєстрації'); 
        } finally { setIsLoading(false); }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        if (!forgotEmail) return;
        if (!turnstileToken) return toast.warning('Будь ласка, пройдіть перевірку безпеки.', { toastId: 'captcha-warn' });
        setIsLoading(true);
        try {
            await apiClient.post('/auth/forgot-password', { email: forgotEmail, turnstileToken });
            setTargetEmail(forgotEmail);
            setOtpPurpose('RESET_PASSWORD');
            setOtpCode('');
            setIsResetCodeVerified(false);
            setView('reset_pass');
            toast.success('Код надіслано на вашу пошту!', { toastId: 'forgot-sent' });
        } catch (error) { 
            resetTurnstile();
            handleError(error, 'Помилка'); 
        } finally { setIsLoading(false); }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (otpPurpose === 'VERIFY_EMAIL') {
                await apiClient.post('/auth/verify-email', { email: targetEmail, code: otpCode });
                toast.success('Email успішно підтверджено! Тепер увійдіть.', { toastId: 'verify-success' });
                setView('login');
            }
        } catch (error) { handleError(error, 'Невірний код'); } 
        finally { setIsLoading(false); }
    };

    const handleVerifyResetCodeOnly = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await apiClient.post('/auth/verify-reset-code', { email: targetEmail, code: otpCode });
            setIsResetCodeVerified(true);
        } catch (error) { 
            handleError(error, 'Невірний код підтвердження'); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        const validation = analyzePassword(formData.newPassword);
        if (!validation.isValid) return toast.warning("Пароль має містити мінімум 8 символів, велику літеру та цифру.", { toastId: 'reset-weak' });
        if (formData.newPassword !== formData.confirmPassword) return toast.error("Паролі не співпадають", { toastId: 'reset-mismatch' });
        setIsLoading(true);
        try {
            await apiClient.post('/auth/reset-password', { 
                email: targetEmail, 
                code: otpCode, 
                newPassword: formData.newPassword 
            });
            toast.success('Пароль успішно змінено! Увійдіть.', { toastId: 'reset-success' });
            setFormData(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
            setView('login');
        } catch (error) { handleError(error, 'Невірний код або пароль'); } 
        finally { setIsLoading(false); }
    };

    const handleResendOtp = async (e) => {
        if (e) e.preventDefault();
        if (resendCooldown > 0) return toast.warning(`Зачекайте ${resendCooldown}с.`, { toastId: 'cooldown-warn' });
        setIsLoading(true);
        try {
            await apiClient.post('/auth/resend-otp', { email: targetEmail, purpose: otpPurpose });
            toast.success('Код надіслано повторно!', { toastId: 'resend-success' });
            startResendCooldown(30);
        } catch (error) { handleError(error, 'Помилка відправки'); } 
        finally { setIsLoading(false); }
    };

    if (view === 'otp') {
        return (
            <div className="min-h-[calc(100vh-140px)] w-full flex items-center justify-center p-4 sm:p-5 bg-(--platform-bg)">
                <Helmet><title>{getPageTitle()}</title></Helmet>
                <div className="w-full max-w-105 bg-(--platform-card-bg) p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl border border-(--platform-border-color) shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex flex-col relative mx-auto">
                    <button onClick={() => setView('login')} className="absolute top-4 left-4 sm:top-6 sm:left-6 bg-transparent border-none cursor-pointer text-(--platform-text-secondary) hover:text-(--platform-text-primary) transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="mx-auto mb-4 w-12 h-12 flex items-center justify-center rounded-full bg-blue-100/20 text-(--platform-accent) mt-4 sm:mt-2">
                        <MailOpen size={28} />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-(--platform-text-primary) mb-2 text-center">
                        Перевірте пошту
                    </h2>
                    <p className="text-(--platform-text-secondary) text-xs sm:text-sm mb-6 text-center">
                        Ми відправили 6-значний код на <strong>{targetEmail}</strong>. Введіть його нижче.
                    </p>
                    <form onSubmit={handleVerifyOtp} className="flex flex-col gap-2">
                        <OtpInput length={6} value={otpCode} onChange={setOtpCode} disabled={isLoading} />
                        <Button type="submit" disabled={isLoading || otpCode.length !== 6} className="w-full py-3 sm:py-3.5 mt-4">
                            {isLoading ? 'Перевірка...' : 'Підтвердити'}
                        </Button>
                    </form>
                    <div className="mt-6 text-center">
                        <button onClick={handleResendOtp} disabled={resendCooldown > 0 || isLoading} className="bg-transparent border-none p-0 cursor-pointer text-(--platform-text-secondary) hover:text-(--platform-accent) text-xs sm:text-sm font-medium transition-colors disabled:opacity-50">
                            {resendCooldown > 0 ? `Надіслати повторно через ${resendCooldown}с` : 'Надіслати код повторно'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'reset_pass') {
        return (
            <div className="min-h-[calc(100vh-140px)] w-full flex items-center justify-center p-4 sm:p-5 bg-(--platform-bg)">
                <Helmet><title>{getPageTitle()}</title></Helmet>
                <div className="w-full max-w-105 bg-(--platform-card-bg) p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl border border-(--platform-border-color) shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex flex-col relative mx-auto">
                    <button onClick={() => setView('login')} className="absolute top-4 left-4 sm:top-6 sm:left-6 bg-transparent border-none cursor-pointer text-(--platform-text-secondary) hover:text-(--platform-text-primary) transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="mx-auto mb-4 w-12 h-12 flex items-center justify-center rounded-full bg-yellow-100/30 text-yellow-600 mt-4 sm:mt-2">
                        <KeyRound size={28} />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-(--platform-text-primary) mb-2 text-center">
                        {isResetCodeVerified ? 'Новий пароль' : 'Відновлення пароля'}
                    </h2>
                    <p className="text-(--platform-text-secondary) text-xs sm:text-sm mb-6 text-center">
                        {isResetCodeVerified 
                            ? 'Створіть новий надійний пароль для вашого акаунту.' 
                            : <>Код відправлено на <br className="sm:hidden" /><strong>{targetEmail}</strong>. Введіть його нижче.</>}
                    </p>
                    {!isResetCodeVerified ? (
                        <form onSubmit={handleVerifyResetCodeOnly} className="flex flex-col gap-4 sm:gap-5">
                            <OtpInput length={6} value={otpCode} onChange={setOtpCode} disabled={isLoading} />
                            <Button type="submit" disabled={isLoading || otpCode.length !== 6} className="w-full py-3 sm:py-3.5">
                                {isLoading ? 'Перевірка...' : 'Продовжити'}
                            </Button>
                            <div className="mt-2 text-center">
                                <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || isLoading} className="bg-transparent border-none p-0 cursor-pointer text-(--platform-text-secondary) hover:text-(--platform-accent) text-xs sm:text-sm font-medium transition-colors disabled:opacity-50">
                                    {resendCooldown > 0 ? `Надіслати код через ${resendCooldown}с` : 'Надіслати код повторно'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleResetPassword} className="flex flex-col gap-4 sm:gap-5">
                            <Input 
                                name="newPassword" 
                                label="Новий пароль" 
                                type="password" 
                                placeholder="••••••••" 
                                value={formData.newPassword} 
                                onChange={handleChange} 
                                required 
                            />
                            <Input 
                                name="confirmPassword" 
                                label="Підтвердження пароля" 
                                type="password" 
                                placeholder="••••••••" 
                                value={formData.confirmPassword} 
                                onChange={handleChange} 
                                required 
                                error={formData.confirmPassword && formData.newPassword !== formData.confirmPassword ? "Паролі не співпадають" : ""}
                            />
                            <div className="-mt-2.5 mb-1 sm:mb-2">
                                 <PasswordStrengthMeter password={formData.newPassword} />
                            </div>
                            <Button type="submit" disabled={isLoading || !formData.newPassword || !formData.confirmPassword} className="w-full py-3 sm:py-3.5">
                                {isLoading ? 'Збереження...' : 'Змінити пароль'}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'forgot') {
        return (
            <div className="min-h-[calc(100vh-140px)] w-full flex items-center justify-center p-4 sm:p-5 bg-(--platform-bg)">
                <Helmet><title>{getPageTitle()}</title></Helmet>
                <div className="w-full max-w-105 bg-(--platform-card-bg) p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl border border-(--platform-border-color) shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex flex-col relative mx-auto">
                    <button onClick={() => setView('login')} className="absolute top-4 left-4 sm:top-6 sm:left-6 bg-transparent border-none cursor-pointer text-(--platform-text-secondary) hover:text-(--platform-text-primary) transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="text-xl sm:text-2xl font-bold text-(--platform-text-primary) mb-2 text-center mt-6 sm:mt-4">Відновлення</h2>
                    <p className="text-(--platform-text-secondary) text-xs sm:text-sm mb-6 sm:mb-8 text-center">Введіть email для отримання коду</p>
                    <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                        <Input 
                            name="forgotEmail" 
                            type="email" 
                            placeholder="Ваш Email" 
                            value={forgotEmail} 
                            onChange={(e) => setForgotEmail(e.target.value)} 
                            required 
                        />
                        <TurnstileWidget onToken={setTurnstileToken} turnstileRef={turnstileRef} />
                        <Button type="submit" disabled={isLoading || !turnstileToken} className="w-full py-3">
                            {isLoading ? 'Відправка...' : 'Отримати код'}
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    const isRegister = view === 'register';
    return (
        <div className="min-h-[calc(100vh-140px)] w-full flex items-center justify-center p-4 sm:p-5 bg-(--platform-bg)">
            <Helmet>
                <title>{getPageTitle()}</title>
            </Helmet>
            <div 
                className={`
                    w-full bg-(--platform-card-bg) p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl border border-(--platform-border-color) shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex flex-col relative transition-all duration-300 mx-auto
                    ${isRegister ? 'max-w-225' : 'max-w-105'}
                `}
            >
                <h2 className="text-xl sm:text-2xl font-bold text-(--platform-text-primary) mb-2 text-center">
                    {isRegister ? 'Реєстрація' : 'Вхід'}
                </h2>
                <p className="text-(--platform-text-secondary) text-xs sm:text-sm mb-6 sm:mb-8 text-center">
                    {isRegister ? 'Створіть свій профіль на Kendr' : 'З поверненням до платформи!'}
                </p>
                <button 
                    onClick={handleGoogleAuth} 
                    className="w-full flex items-center justify-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border border-gray-200 bg-white text-gray-800 cursor-pointer font-semibold text-sm sm:text-base transition-all shadow-sm hover:bg-gray-50 hover:-translate-y-px hover:shadow-md"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Продовжити з Google</span>
                </button>
                <div className="flex items-center gap-3 sm:gap-4 my-5 sm:my-6 text-(--platform-text-secondary) text-[10px] sm:text-xs uppercase tracking-wider font-medium">
                    <div className="flex-1 h-px bg-(--platform-border-color)"></div>
                    <span>або</span>
                    <div className="flex-1 h-px bg-(--platform-border-color)"></div>
                </div>
                <form onSubmit={isRegister ? handleRegister : handleLogin}>
                    {isRegister ? (
                        <>
                            <div className="flex justify-center mb-6 sm:mb-8">
                                <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 group mx-auto">
                                    <div className="w-full h-full rounded-full overflow-hidden border border-(--platform-border-color) bg-(--platform-bg) relative">
                                        <ImageUploadTrigger 
                                            onUpload={handleAvatarUpload}
                                            aspect={1}
                                            circularCrop={true}
                                            uploading={isAvatarUploading}
                                            triggerStyle={{ width: '100%', height: '100%', display: 'block' }}
                                        >
                                            <div className="w-full h-full relative flex items-center justify-center">
                                                <Avatar 
                                                    url={avatarData.preview} 
                                                    name={formData.username || 'User'} 
                                                    size={128}
                                                    fontSize="36px"
                                                    className="w-full h-full object-cover shrink-0"
                                                />
                                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer backdrop-blur-[2px]">
                                                    {avatarData.preview ? (
                                                         <Upload size={20} className="sm:w-6 sm:h-6" />
                                                    ) : (
                                                         <div className="flex flex-col items-center">
                                                            <Camera size={24} className="mb-1 sm:w-7 sm:h-7"/>
                                                            <span className="text-[10px] sm:text-[11px] font-medium">Фото</span>
                                                         </div>
                                                    )}
                                                </div>
                                            </div>
                                        </ImageUploadTrigger>
                                    </div>
                                    {avatarData.preview && (
                                        <button
                                            type="button"
                                            onClick={handleRemoveAvatar}
                                            className="absolute top-0 right-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-black/60 text-white border-none cursor-pointer z-20 opacity-0 group-hover:opacity-100 translate-x-[10%] -translate-y-[10%] transition-all hover:bg-(--platform-danger)"
                                            title="Видалити фото"
                                        >
                                            <Trash size={12} className="sm:w-3.5 sm:h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-5 sm:gap-6">
                                <div>
                                    <h4 className="m-0 mb-4 sm:mb-5 text-(--platform-text-primary) text-sm sm:text-base font-semibold pb-2 border-b border-(--platform-border-color)">Особисті дані</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                                        <Input name="username" label="Ім'я користувача" placeholder="Логін" value={formData.username} onChange={handleChange} required />
                                        <Input name="email" label="Email адреса" type="email" placeholder="example@mail.com" value={formData.email} onChange={handleChange} required />
                                    </div>
                                </div>
                                <div>
                                    <h4 className="m-0 mb-4 sm:mb-5 text-(--platform-text-primary) text-sm sm:text-base font-semibold pb-2 border-b border-(--platform-border-color)">Безпека</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-start">
                                        <Input name="password" label="Пароль" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required />
                                        <Input name="confirmPassword" label="Підтвердження" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required error={formData.confirmPassword && formData.password !== formData.confirmPassword ? "Паролі не співпадають" : ""} />
                                    </div>
                                    <div className="mt-3 sm:mt-4">
                                         <PasswordStrengthMeter password={formData.password} />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col gap-3 sm:gap-4">
                            <Input name="loginInput" label="Email або Логін" placeholder="Введіть дані" value={formData.loginInput} onChange={handleChange} required />
                            <Input name="password" label="Пароль" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required />
                            <div className="text-right -mt-1 sm:-mt-1 mb-1 sm:mb-2">
                                <button type="button" onClick={() => setView('forgot')} className="bg-transparent border-none p-0 m-0 cursor-pointer text-(--platform-text-primary) hover:text-(--platform-accent)! text-xs sm:text-sm font-medium transition-colors duration-200 no-underline">Забули пароль?</button>
                            </div>
                        </div>
                    )}
                    <TurnstileWidget onToken={setTurnstileToken} turnstileRef={turnstileRef} />
                    <div className="mt-2 sm:mt-4">
                        <Button type="submit" disabled={isLoading || !turnstileToken} className="w-full py-3 sm:py-3.5 text-sm sm:text-base rounded-xl">
                            {isLoading ? 'Обробка...' : (isRegister ? 'Створити акаунт' : 'Увійти')}
                        </Button>
                        {isRegister && (
                            <p className="text-[10px] sm:text-xs text-(--platform-text-secondary) mt-4 sm:mt-5 text-center leading-relaxed">
                                Натискаючи кнопку "Створити акаунт", ви погоджуєтесь з <Link to="/rules" target="_blank" className="text-(--platform-text-primary) hover:text-(--platform-accent)! font-semibold transition-colors duration-200 no-underline cursor-pointer">Умовами використання</Link> та <Link to="/rules" target="_blank" className="text-(--platform-text-primary) hover:text-(--platform-accent)! font-semibold transition-colors duration-200 no-underline cursor-pointer">Політикою конфіденційності</Link>.
                            </p>
                        )}
                    </div>
                </form>
                <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setView(view === 'login' ? 'register' : 'login')} 
                    className="mt-4 sm:mt-6 w-full py-2.5 sm:py-3 rounded-xl text-sm sm:text-base"
                >
                    {view === 'login' ? 'Немає акаунту? Реєстрація' : 'Вже є акаунт? Увійти'}
                </Button>
            </div>
        </div>
    );
};

export default AuthPage;