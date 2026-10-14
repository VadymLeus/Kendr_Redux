// frontend/src/modules/profile/tabs/ProfileGeneralTab.jsx
import React, { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../app/providers/AuthContext';
import apiClient from '../../../shared/api/api';
import { toast } from 'react-toastify';
import { Input, Button } from '../../../shared/ui/elements';
import Avatar from '../../../shared/ui/elements/Avatar';
import ImageUploadTrigger from '../../../shared/ui/complex/ImageUploadTrigger';
import ConfirmModal from '../../../shared/ui/complex/ConfirmModal';
import { TEXT_LIMITS } from '../../../shared/config/limits';
import { useCooldown } from '../../../shared/hooks/useCooldown';
import { User, Mail, Phone, Trash2, Camera, LogOut, Check, BarChart2, Zap, LayoutTemplate, HardDrive, Timer, Eye, ShieldAlert, Loader2, ArrowUpRight } from 'lucide-react';

const ProfileGeneralTab = () => {
    const { user, updateUser, logout, refreshUserToken } = useContext(AuthContext);
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        username: '',
        phone_number: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isAvatarUploading, setIsAvatarUploading] = useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [updateCooldown, startUpdateCooldown] = useCooldown('kendr_profile_update_cooldown');
    const hasNotifiedUpgrade = useRef(false);
    const [statsData, setStatsData] = useState({
        siteCount: 0,
        mediaCount: 0,
        totalViews: 0,
        warningCount: 0,
        limits: null
    });

    useEffect(() => {
        if (user) {
            setFormData({
                username: user.username,
                phone_number: user.phone_number || ''
            });
            const fetchStats = async () => {
                try {
                    const [sitesRes, limitsRes, profileRes] = await Promise.all([
                        apiClient.get('/sites/catalog', { params: { scope: 'my' } }),
                        apiClient.get('/media/limits'),
                        apiClient.get(`/users/${user.slug || user.username}`)
                    ]);
                    if (profileRes.data && profileRes.data.plan && profileRes.data.plan !== user.plan) {
                        if (!hasNotifiedUpgrade.current) {
                            hasNotifiedUpgrade.current = true;
                            await refreshUserToken();
                            toast.success('Ваш тариф успішно оновлено до PLUS!');
                        }
                    }
                    const sites = Array.isArray(sitesRes.data) ? sitesRes.data : [];
                    const calculatedViews = sites.reduce((sum, site) => sum + (site.view_count || 0), 0);
                    setStatsData({
                        siteCount: sites.length,
                        mediaCount: limitsRes.data.currentFiles || 0,
                        limits: limitsRes.data,
                        totalViews: profileRes.data?.totalViews !== undefined ? profileRes.data.totalViews : calculatedViews,
                        warningCount: profileRes.data?.warning_count || 0
                    });
                } catch (error) {
                    console.error("Failed to fetch stats", error);
                }
            };
            fetchStats();
        }
    }, [user, refreshUserToken]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (updateCooldown > 0) {
            toast.warning(`Зачекайте ${updateCooldown}с перед наступним оновленням.`);
            return;
        }
        if (!formData.username || formData.username.trim().length < 3) {
            toast.warn('Нікнейм повинен містити мінімум 3 символи');
            return;
        }
        const phoneRegex = /^[0-9+\-\(\)\s]*$/;
        if (formData.phone_number && !phoneRegex.test(formData.phone_number)) {
            toast.error('Некоректний формат телефону. Використовуйте лише цифри та символи + ( ) -');
            return;
        }
        setIsLoading(true);
        try {
            const response = await apiClient.put('/users/profile', formData);
            updateUser(response.data.user);
            toast.success('Профіль оновлено!');
            startUpdateCooldown(30);
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || 'Помилка оновлення');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAvatarUpload = async (file) => {
        setIsAvatarUploading(true);
        try {
            const data = new FormData();
            data.append('avatar', file);
            const response = await apiClient.post('/users/profile/avatar', data);
            updateUser(response.data.user);
            toast.success('Фото профілю оновлено!');
        } catch (err) {
            toast.error('Помилка завантаження фото');
        } finally {
            setIsAvatarUploading(false);
        }
    };

    const handleDeleteAvatar = async (e) => {
        if (e) e.stopPropagation();
        try {
            const response = await apiClient.delete('/users/profile/avatar');
            updateUser(response.data.user);
            toast.success('Фото видалено');
        } catch (err) {
            toast.error('Не вдалося видалити фото');
        }
    };

    const handleLogout = () => {
        setIsLogoutModalOpen(false);
        logout();
        navigate('/login');
        toast.info("Ви вийшли з системи");
    };

    if (!user) return null;
    const isStaff = user?.role === 'admin' || user?.role === 'moderator';
    const isPlanAdmin = isStaff || (user.plan && String(user.plan).trim().toUpperCase() === 'ADMIN');
    const isPremium = isPlanAdmin || user.plan === 'PLUS';
    const maxSitesDisplay = isPlanAdmin ? '∞' : (statsData.limits ? statsData.limits.maxSites : '...');
    const maxMediaDisplay = isPlanAdmin ? '∞' : (statsData.limits ? statsData.limits.maxFiles : '...');
    const isSiteLimitReached = !isPlanAdmin && statsData.limits && statsData.siteCount >= statsData.limits.maxSites;
    const isMediaLimitReached = !isPlanAdmin && statsData.limits && statsData.mediaCount >= statsData.limits.maxFiles;
    return (
        <div className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-start">
                <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 flex flex-col h-full shadow-sm">
                    <div className="mb-6 text-center sm:text-left">
                        <h3 className="text-lg sm:text-xl font-semibold text-(--platform-text-primary) m-0 flex items-center justify-center sm:justify-start gap-2.5 mb-1.5">
                            <Camera className="w-5 h-5 text-(--platform-accent)" />
                            Фото профілю
                        </h3>
                        <p className="text-sm text-(--platform-text-secondary) m-0">
                            Формати: JPG, PNG, WEBP. Макс: 2 МБ.
                        </p>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-2">
                        <div className="relative w-32 h-32 sm:w-40 sm:h-40 shrink-0 mx-auto">
                            <div className={`w-full h-full rounded-full overflow-hidden border border-(--platform-border-color) bg-(--platform-bg) shadow-sm flex items-center justify-center transition-opacity ${isAvatarUploading ? 'opacity-50' : 'opacity-100'}`}>
                                <Avatar 
                                    url={user.avatar_url} 
                                    name={user.username} 
                                    size={160}
                                    fontSize="56px"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                            {isAvatarUploading && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-(--platform-accent) animate-spin" />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-3 w-full mt-1">
                            <ImageUploadTrigger 
                                onUpload={handleAvatarUpload}
                                aspect={1}
                                circularCrop={true}
                                uploading={isAvatarUploading}
                                maxSizeMB={2}
                            >
                                <Button 
                                    type="button" 
                                    variant="secondary"
                                    disabled={isAvatarUploading}
                                    icon={<Camera size={18} />}
                                    className="min-h-11 px-4 sm:px-6"
                                >
                                    Змінити фото
                                </Button>
                            </ImageUploadTrigger>
                            {user.avatar_url && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleDeleteAvatar}
                                    disabled={isAvatarUploading}
                                    icon={<Trash2 size={18} />}
                                    className="min-h-11 px-3 sm:px-4 text-(--platform-danger) border-red-200 hover:bg-red-50 hover:border-red-300"
                                    title="Видалити фото"
                                />
                            )}
                        </div>
                        <div className="text-center mt-2">
                            <div className="text-xl sm:text-2xl font-bold text-(--platform-text-primary) break-all px-2">
                                {user.username}
                            </div>
                            {!isStaff && (
                                <div className="text-sm sm:text-base text-(--platform-text-secondary) mt-1 break-all px-2">
                                    {user.email}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 flex flex-col h-full shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-lg sm:text-xl font-semibold text-(--platform-text-primary) m-0 flex items-center gap-2.5 mb-1.5">
                            <User className="w-5 h-5 text-(--platform-accent)" />
                            Особисті дані
                        </h3>
                        <p className="text-sm text-(--platform-text-secondary) m-0">
                            Керуйте своїм публічним іменем та контактами.
                        </p>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5 flex-1">
                        <Input 
                            name="username" 
                            label="Нікнейм" 
                            value={formData.username} 
                            onChange={handleChange} 
                            leftIcon={<User size={18} />} 
                            maxLength={TEXT_LIMITS.USERNAME}
                            showCounter={true}
                            helperText="Мінімум 3 символи"
                        />
                        {!isStaff && (
                            <Input 
                                name="email" 
                                label="Email" 
                                value={user.email} 
                                disabled 
                                leftIcon={<Mail size={18} />}
                                className="opacity-70 cursor-not-allowed"
                            />
                        )}
                        <Input 
                            name="phone_number" 
                            label="Телефон" 
                            value={formData.phone_number} 
                            onChange={handleChange}
                            leftIcon={<Phone size={18} />}
                            placeholder="+380..."
                            maxLength={20}
                        />
                        <div className="mt-auto pt-4 flex justify-center w-full">
                            <Button 
                                type="submit" 
                                disabled={isLoading || updateCooldown > 0} 
                                icon={isLoading ? null : (updateCooldown > 0 ? <Timer size={18} /> : <Check size={18} />)}
                                className="w-full sm:w-auto min-h-11"
                            >
                                {isLoading ? 'Збереження...' : (updateCooldown > 0 ? `Зачекайте ${updateCooldown}с` : 'Зберегти зміни')}
                            </Button>
                        </div>
                    </form>
                </div>
                <div className="md:col-span-2 bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-6 shadow-sm">
                    <div className="mb-5 sm:mb-6">
                        <h3 className="text-lg sm:text-xl font-semibold text-(--platform-text-primary) m-0 flex items-center gap-2.5 mb-1.5">
                            <BarChart2 className="w-5 h-5 text-(--platform-accent)" />
                            Статистика та Ліміти
                        </h3>
                        <p className="text-sm text-(--platform-text-secondary) m-0">
                            Поточний стан вашого акаунту та використання ресурсів.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-(--platform-bg) border border-(--platform-border-color) rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-(--platform-text-primary) min-w-0">
                                <Zap className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${isPremium ? 'text-(--platform-accent)' : 'text-(--platform-text-secondary)'}`} />
                                <span className="truncate">Тариф</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-2 py-1 rounded-lg text-xs font-bold tracking-wide ${isPremium ? 'bg-(--platform-accent) text-white' : 'bg-(--platform-border-color) text-(--platform-text-primary)'}`}>
                                    {user.plan || 'FREE'}
                                </span>
                                {!isPremium && (
                                    <button 
                                        type="button" 
                                        onClick={() => navigate('/upgrade')}
                                        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-(--platform-accent) text-white hover:opacity-90 transition-all shadow-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-(--platform-accent)/50"
                                        title="Покращити тариф"
                                    >
                                        <ArrowUpRight size={18} strokeWidth={2.5} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-(--platform-bg) border border-(--platform-border-color) rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-(--platform-text-primary) min-w-0">
                                <LayoutTemplate className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-(--platform-text-secondary)" />
                                <span className="truncate">Створено сайтів</span>
                            </div>
                            <div className={`font-semibold text-sm sm:text-base shrink-0 ${isSiteLimitReached ? 'text-(--platform-danger)' : 'text-(--platform-text-primary)'}`}>
                                {statsData.siteCount} / {maxSitesDisplay}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-(--platform-bg) border border-(--platform-border-color) rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-(--platform-text-primary) min-w-0">
                                <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-(--platform-text-secondary)" />
                                <span className="truncate">Медіафайли</span>
                            </div>
                            <div className={`font-semibold text-sm sm:text-base shrink-0 ${isMediaLimitReached ? 'text-(--platform-danger)' : 'text-(--platform-text-primary)'}`}>
                                {statsData.mediaCount} / {maxMediaDisplay}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-(--platform-bg) border border-(--platform-border-color) rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-(--platform-text-primary) min-w-0">
                                <Eye className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-(--platform-text-secondary)" />
                                <span className="truncate">Всього переглядів</span>
                            </div>
                            <div className="font-semibold text-sm sm:text-base text-(--platform-text-primary) shrink-0">
                                {statsData.totalViews}
                            </div>
                        </div>
                        <div className="md:col-span-2 flex items-center justify-between gap-2 p-3 sm:p-4 bg-(--platform-bg) border border-(--platform-border-color) rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-(--platform-text-primary) min-w-0">
                                <ShieldAlert className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${statsData.warningCount > 0 ? 'text-(--platform-danger)' : 'text-(--platform-text-secondary)'}`} />
                                <span className="truncate">Активні страйки</span>
                            </div>
                            <div className={`font-semibold text-sm sm:text-base shrink-0 ${statsData.warningCount > 0 ? 'text-(--platform-danger)' : 'text-(--platform-text-primary)'}`}>
                                {statsData.warningCount} / 3
                            </div>
                        </div>
                    </div>
                </div>
                <div className="md:col-span-2 bg-(--platform-card-bg) border border-(--platform-border-color) rounded-2xl p-5 sm:p-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                        <div className="flex-1">
                            <h3 className="text-lg sm:text-xl font-semibold text-(--platform-text-primary) m-0 flex items-center gap-2.5 mb-1.5">
                                <LogOut className="w-5 h-5 text-(--platform-text-secondary)" />
                                Вихід з акаунту
                            </h3>
                            <p className="text-sm text-(--platform-text-secondary) m-0">
                                Це завершить вашу поточну сесію в цьому браузері.
                            </p>
                        </div>
                        <Button 
                            variant="secondary" 
                            onClick={() => setIsLogoutModalOpen(true)} 
                            icon={<LogOut size={18} />}
                            className="w-full sm:w-auto text-(--platform-danger) hover:bg-red-50 border-red-200 min-h-11 shrink-0"
                        >
                            Вийти з системи
                        </Button>
                    </div>
                </div>
            </div>
            <ConfirmModal 
                isOpen={isLogoutModalOpen}
                title="Вихід"
                message="Ви впевнені, що хочете вийти з акаунту?"
                confirmLabel="Вийти"
                cancelLabel="Скасувати"
                onConfirm={handleLogout}
                onCancel={() => setIsLogoutModalOpen(false)}
                type="danger"
            />
        </div>
    );
};

export default ProfileGeneralTab;