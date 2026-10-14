// frontend/src/modules/profile/tabs/ProfileSecurityTab.jsx
import React, { useState, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../../app/providers/AuthContext';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import apiClient from '../../../shared/api/api';
import { Input, Button } from '../../../shared/ui/elements';
import PasswordStrengthMeter from '../../../shared/ui/complex/PasswordStrengthMeter';
import { analyzePassword } from '../../../shared/utils/validationUtils';
import { useCooldown } from '../../../shared/hooks/useCooldown';
import { Lock, Trash2, AlertCircle, Timer } from 'lucide-react';

const ProfileSecurityTab = () => {
    const { user, login, logout } = useContext(AuthContext);
    const { confirm } = useConfirm(); 
    const [isLoading, setIsLoading] = useState(false);
    const hasPassword = user.has_password === true;
    const isAdmin = user?.role === 'admin';
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [securityCooldown, startSecurityCooldown] = useCooldown('kendr_security_update_cooldown');
    useEffect(() => {
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }, [hasPassword]);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setPasswords(prev => ({ ...prev, [name]: value }));
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (securityCooldown > 0) {
            toast.warning(`Зачекайте ${securityCooldown}с перед наступною зміною.`);
            return;
        }
        if (hasPassword && !passwords.currentPassword) {
            toast.error("Введіть поточний пароль для підтвердження.");
            return;
        }
        if (hasPassword && passwords.currentPassword === passwords.newPassword) {
            toast.warning("Новий пароль не може бути таким самим, як поточний.");
            return;
        }
        const validation = analyzePassword(passwords.newPassword);
        if (validation.isSimple) {
            toast.warning("Пароль містить занадто просту послідовність (наприклад, 123456 або qwerty). Придумайте складніший пароль.");
            return;
        }
        if (!validation.isValid) {
            toast.warning("Пароль має містити мінімум 8 символів, велику літеру, малу літеру та цифру.");
            return;
        }
        if (passwords.newPassword !== passwords.confirmPassword) {
            toast.error("Нові паролі не співпадають");
            return;
        }
        setIsLoading(true);
        try {
            const payload = { newPassword: passwords.newPassword };
            if (hasPassword) {
                payload.currentPassword = passwords.currentPassword;
            }
            const response = await apiClient.put('/users/profile/password', payload);
            toast.success(hasPassword ? "Пароль успішно змінено!" : "Пароль успішно встановлено!");
            const updatedUser = {
                ...user,                  
                ...(response.data.user || {}), 
                has_password: true        
            };
            login(updatedUser, response.data.token); 
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            startSecurityCooldown(30);
        } catch (error) {
            if (error.response?.status === 429) {
                toast.error("Забагато спроб зміни пароля. Спробуйте пізніше через годину.");
            } else {
                toast.error(error.response?.data?.message || "Помилка збереження пароля.");
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDeleteAccount = () => {
        confirm({
            title: 'Видалити акаунт?',
            message: 'Ця дія незворотна. Всі ваші сайти будуть видалені. Напишіть "DELETE" для підтвердження.',
            requireInput: true,
            confirmText: 'Видалити акаунт',
            danger: true,
            onConfirm: async (inputValue) => {
                if (inputValue !== 'DELETE') return toast.error('Невірне підтвердження.');
                try {
                    await apiClient.delete('/users/me', { data: { confirmation: 'DELETE' } });
                    toast.success('Акаунт видалено, у вас є 14 днів на відновлення.');
                    logout();
                } catch (err) {
                    console.error(err);
                    toast.error('Помилка при видаленні акаунту');
                }
            }
        });
    };
    
    return (
        <div className="w-full max-w-200 mx-auto">
            <div className="bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) p-5 sm:p-8 mb-5 sm:mb-6 shadow-sm">
                <div className="text-center mb-6 sm:mb-8">
                    <h3 className="text-lg sm:text-xl font-semibold text-(--platform-text-primary) flex items-center justify-center gap-2.5 mb-2 m-0">
                        <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-(--platform-accent)" />
                        {hasPassword ? 'Зміна паролю' : 'Встановлення паролю'}
                    </h3>
                    <p className="text-sm text-(--platform-text-secondary) m-0 leading-relaxed">
                        {hasPassword 
                            ? 'Введіть поточний пароль, щоб встановити новий.'
                            : 'У вас не встановлено пароль (вхід через Google). Створіть його для входу через Email.'
                        }
                    </p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-100 mx-auto">
                        {hasPassword && (
                            <Input 
                                name="currentPassword" 
                                label="Поточний пароль" 
                                type="password" 
                                placeholder="••••••••" 
                                value={passwords.currentPassword} 
                                onChange={handleChange} 
                                required 
                            />
                        )}
                        <div>
                            <Input 
                                name="newPassword" 
                                label={hasPassword ? "Новий пароль" : "Придумайте пароль"}
                                type="password" 
                                placeholder="••••••••" 
                                value={passwords.newPassword} 
                                onChange={handleChange} 
                                required 
                            />
                            <div className="mt-1 sm:mt-1.5">
                                <PasswordStrengthMeter password={passwords.newPassword} />
                            </div>
                        </div>
                        <Input 
                            name="confirmPassword" 
                            label="Підтвердження" 
                            type="password" 
                            placeholder="••••••••" 
                            value={passwords.confirmPassword} 
                            onChange={handleChange} 
                            required
                            error={passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword ? "Паролі не співпадають" : ""}
                        />
                        <div className="mt-2">
                            <Button 
                                type="submit" 
                                disabled={isLoading || securityCooldown > 0} 
                                className="w-full min-h-11 flex justify-center items-center gap-2"
                            >
                                {isLoading 
                                    ? 'Збереження...' 
                                    : (securityCooldown > 0 
                                        ? <><Timer size={18} /> Зачекайте {securityCooldown}с</>
                                        : (hasPassword ? 'Оновити пароль' : 'Встановити пароль')
                                    )
                                }
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
            {!isAdmin && (
                <div className="rounded-2xl border border-(--platform-danger) p-5 sm:p-8 shadow-sm bg-[color-mix(in_srgb,var(--platform-danger),transparent_95%)]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                        <div className="flex-1">
                            <h3 className="text-lg sm:text-xl font-semibold text-(--platform-danger) flex items-center gap-2.5 mb-1.5 m-0">
                                <AlertCircle className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                                ВИДАЛЕННЯ АКАУНТУ
                            </h3>
                            <p className="text-sm sm:text-[0.9rem] text-(--platform-danger) opacity-80 m-0 leading-relaxed">
                                Видалення акаунту призведе до <strong>незворотної</strong> втрати всіх ваших сайтів та даних.
                            </p>
                        </div>
                        <Button 
                            variant="danger"
                            onClick={handleDeleteAccount}
                            icon={<Trash2 size={18} />}
                            className="w-full sm:w-auto min-h-11 flex items-center justify-center shrink-0"
                        >
                            Видалити акаунт
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileSecurityTab;