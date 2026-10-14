// frontend/src/shared/ui/complex/SiteGridCard.jsx
import React, { useState, useRef, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import SiteCoverDisplay from './SiteCoverDisplay';
import ReportModal from './ReportModal';
import { AuthContext } from '../../../app/providers/AuthContext';
import { BASE_URL } from '../../config';
import apiClient from '../../api/api';
import { useCooldown } from '../../hooks/useCooldown';
import { useConfirm } from '../../hooks/useConfirm';
import { MoreVertical, ExternalLink, Trash, Edit, Globe, GlobeLock, Eye, Calendar, Star, Pause, FileText, Flag, Lock, AlertTriangle, Construction, Wrench, Gavel, Users, UserMinus } from 'lucide-react';

const SiteStatusBadge = ({ status }) => {
    const config = {
        published: { label: 'Опубліковано', isAccent: true, icon: Globe },
        maintenance: { label: 'Тех. Роботи', isAccent: true, icon: Construction },
        suspended: { label: 'Призупинено', isAccent: false, customColor: '#4f46e5', icon: Pause },
        private: { label: 'Прихований', isAccent: true, icon: Lock },
        probation: { label: 'На модерації', isAccent: true, icon: AlertTriangle }
    };
    const s = config[status] || config.maintenance;
    const Icon = s.icon;
    const dynamicStyle = s.isAccent 
        ? {
            color: 'var(--platform-accent)',
            backgroundColor: 'color-mix(in srgb, var(--platform-accent) 15%, transparent)',
            borderColor: 'color-mix(in srgb, var(--platform-accent) 30%, transparent)'
          }
        : {
            color: s.customColor,
            backgroundColor: `color-mix(in srgb, ${s.customColor} 15%, transparent)`,
            borderColor: `color-mix(in srgb, ${s.customColor} 30%, transparent)`
          };

    return (
        <div 
            className="px-2 py-1 rounded-md text-xs font-semibold border flex items-center gap-1 w-fit shrink-0 whitespace-nowrap"
            style={dynamicStyle}
        >
            <Icon size={12} className="shrink-0" /> {s.label}
        </div>
    );
};

const MenuItem = ({ icon: Icon, label, onClick, href, className, style = {}, disabled }) => {
    const baseClass = "text-left px-3 py-2 bg-transparent border-none text-(--platform-text-primary) text-sm flex items-center gap-2 w-full no-underline box-border rounded hover:bg-(--platform-bg) transition-colors";
    const content = (
        <>
            <Icon size={14} className="shrink-0" /> {label}
        </>
    );
    if (href) {
        return (
            <a 
                href={disabled ? undefined : href} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`${baseClass} ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${className || ''}`}
                style={style}
                onClick={(e) => { if (!disabled && onClick) onClick(e); }}
            >
                {content}
            </a>
        );
    }
    return (
        <button 
            onClick={(e) => { if (!disabled && onClick) onClick(e); }}
            disabled={disabled}
            className={`${baseClass} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className || ''}`}
            style={style}
        >
            {content}
        </button>
    );
};

const CardMenu = ({ site, isOwner, isCollaborator, canEdit, isAdmin, onToggleStatus, onDelete, onLeave, onReport, statusCooldown }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    const isLocked = site.status === 'suspended' || site.status === 'probation';
    const isStatusDisabled = statusCooldown > 0;
    return (
        <div ref={menuRef}>
            <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`
                    absolute top-2.5 right-2.5 z-20 bg-(--platform-card-bg) shadow-md rounded-full w-8 h-8 
                    flex items-center justify-center cursor-pointer border transition-colors p-0
                    hover:text-(--platform-accent) hover:border-(--platform-accent)
                    ${isOpen ? 'text-(--platform-accent) border-(--platform-accent)' : 'text-(--platform-text-secondary) border-(--platform-border-color)'}
                `}
                title="Меню"
            >
                <MoreVertical size={16} />
            </button>
            {isOpen && (
                <div 
                    className="absolute top-11.5 right-2.5 bg-(--platform-card-bg) border border-(--platform-border-color) rounded-lg shadow-lg min-w-50 p-1 flex flex-col z-30 animate-in fade-in slide-in-from-top-1 duration-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    <MenuItem 
                        icon={ExternalLink} 
                        label="Відвідати" 
                        href={`/site/${site.site_path}`}
                        onClick={() => setIsOpen(false)}
                    />
                    {!canEdit && !isAdmin && (
                        <MenuItem 
                            icon={Flag} 
                            label="Поскаржитись" 
                            onClick={() => { setIsOpen(false); onReport(); }}
                        />
                    )}
                    {isOwner && !isAdmin && (
                        <>
                            {!isLocked && (
                                <>
                                    <MenuItem 
                                        icon={site.status === 'published' ? GlobeLock : Globe} 
                                        label={isStatusDisabled ? `Зачекайте ${statusCooldown}с` : (site.status === 'published' ? 'Зняти з публікації' : 'Опублікувати')}
                                        disabled={isStatusDisabled}
                                        onClick={(e) => { 
                                            setIsOpen(false); 
                                            onToggleStatus(site, site.status === 'published' ? 'maintenance' : 'published'); 
                                        }}
                                    />
                                    {site.status !== 'private' ? (
                                        <MenuItem 
                                            icon={Lock} 
                                            label={isStatusDisabled ? `Зачекайте ${statusCooldown}с` : "Приховати"}
                                            disabled={isStatusDisabled}
                                            onClick={(e) => { 
                                                setIsOpen(false); 
                                                onToggleStatus(site, 'private'); 
                                            }}
                                        />
                                    ) : (
                                        <MenuItem 
                                            icon={FileText} 
                                            label={isStatusDisabled ? `Зачекайте ${statusCooldown}с` : "Технічні роботи"}
                                            disabled={isStatusDisabled}
                                            onClick={(e) => { 
                                                setIsOpen(false); 
                                                onToggleStatus(site, 'maintenance'); 
                                            }}
                                        />
                                    )}
                                </>
                            )}
                            {isLocked && (
                                <div className="px-3 py-2 text-[11px] text-(--platform-danger) italic text-center">
                                    Зміна статусу заблокована
                                </div>
                            )}
                            <div className="h-px bg-(--platform-border-color) my-1" />
                        </>
                    )}
                    {isCollaborator && (
                        <MenuItem 
                            icon={UserMinus} 
                            label="Покинути команду" 
                            style={{ color: 'var(--platform-danger)' }}
                            onClick={(e) => { setIsOpen(false); onLeave(e); }}
                        />
                    )}
                    {((isOwner && !isLocked) || isAdmin) && (
                        <MenuItem 
                            icon={Trash} 
                            label="Видалити" 
                            style={{ color: 'var(--platform-danger)' }}
                            onClick={(e) => { setIsOpen(false); onDelete(e, site.site_path, site.title); }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

const SiteGridCard = ({ 
    site, 
    variant = 'public',
    onTagClick, 
    onDelete, 
    onToggleStatus, 
    onTogglePin, 
    onToggleFavorite, 
    isFavorite,
    formatDate 
}) => {
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [statusCooldown, startStatusCooldown] = useCooldown('kendr_status_cooldown');
    const { user } = useContext(AuthContext);
    const { confirm } = useConfirm();
    const coverContainerRef = useRef(null);
    const [scaleFactor, setScaleFactor] = useState(1);
    const isStaff = user?.role === 'admin' || user?.role === 'moderator';
    const isOwner = variant === 'owner';
    const isCollaborator = variant === 'collaborator';
    const canEdit = isOwner || isCollaborator; 
    const isEffectiveAdmin = variant === 'admin' || isStaff;
    const mainLink = canEdit ? `/dashboard/${site.site_path}` : `/site/${site.site_path}`;
    const isPinnedOrFav = canEdit ? site.is_pinned : isFavorite;
    const isSuspended = site.status === 'suspended';
    const isMaintenance = site.status === 'maintenance';
    useEffect(() => {
        const node = coverContainerRef.current;
        if (!node) return;
        const observer = new ResizeObserver((entries) => {
            const { width } = entries[0].contentRect;
            if (width > 0) setScaleFactor(width / 440);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const getImageUrl = (src) => {
        if (!src) return '';
        if (typeof src === 'string') {
            if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) return src;
            if (src.startsWith('/logos/')) return src;
            if (src.includes('/src/') || src.includes('/assets/') || src.includes('@fs')) return src;
            const cleanSrc = src.startsWith('/') ? src : `/${src}`;
            return `${BASE_URL}${cleanSrc}`;
        }
        return '';
    };

    const handleToggleStatusWithCooldown = (siteObj, newStatus) => {
        if (statusCooldown > 0) {
            toast.warning(`Зачекайте ${statusCooldown}с перед наступною зміною статусу.`);
            return;
        }
        onToggleStatus(siteObj, newStatus);
        startStatusCooldown(30);
    };

    const handleDeleteWithConfirm = (e, sitePath, title) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        confirm({
            title: 'Видалити сайт?',
            message: `Ви збираєтесь назавжди видалити сайт "${title}". Цю дію неможливо скасувати. Введіть "DELETE" для підтвердження.`,
            requireInput: true, expectedInput: 'DELETE', confirmText: 'Видалити сайт', type: 'danger',
            onConfirm: (inputValue) => {
                if (inputValue !== 'DELETE') return toast.error('Невірне підтвердження.');
                if (onDelete) onDelete(e, sitePath, title);
            }
        });
    };

    const handleLeaveTeam = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        confirm({
            title: 'Покинути проєкт?',
            message: `Ви дійсно хочете покинути команду сайту "${site.title}"? Ви втратите доступ до редагування.`,
            confirmText: 'Так, покинути',
            type: 'danger',
            onConfirm: async () => {
                try {
                    await apiClient.delete(`/team/${site.id}/collaborators/${user.id}`);
                    toast.success('Ви успішно покинули проєкт');
                    setTimeout(() => window.location.reload(), 500); 
                } catch (err) {
                    toast.error(err.response?.data?.message || 'Помилка виходу з команди');
                }
            }
        });
    };

    return (
        <>
            <div className={`
                bg-(--platform-card-bg) rounded-xl border border-(--platform-border-color) overflow-hidden flex flex-col relative h-full transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg
                ${isMaintenance ? 'border-dashed border-(--platform-border-color) bg-[repeating-linear-gradient(45deg,var(--platform-card-bg),var(--platform-card-bg)_10px,var(--platform-bg)_10px,var(--platform-bg)_20px)]' : ''}
            `}>
                <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2">
                    {!isCollaborator && (
                        <button 
                            className="bg-(--platform-card-bg) shadow-md rounded-full w-8 h-8 flex items-center justify-center cursor-pointer border transition-colors p-0 hover:border-(--platform-accent) hover:text-(--platform-accent) shrink-0"
                            onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (canEdit && onTogglePin) onTogglePin(site.id);
                                if (!canEdit && onToggleFavorite) onToggleFavorite(site.id);
                            }}
                            title={canEdit ? "Закріпити" : "В обране"}
                            style={{ 
                                color: isPinnedOrFav ? 'var(--platform-accent)' : 'var(--platform-text-secondary)',
                                borderColor: isPinnedOrFav ? 'var(--platform-accent)' : 'var(--platform-border-color)'
                            }}
                        >
                            <Star size={16} fill={isPinnedOrFav ? "currentColor" : "none"} />
                        </button>
                    )}
                    {isCollaborator && (
                        <span 
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-(--platform-card-bg) shadow-md rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 whitespace-nowrap"
                            style={{ 
                                color: 'var(--platform-accent)',
                                borderColor: 'var(--platform-accent)'
                            }}
                        >
                            <Users size={12} className="shrink-0" /> Співавтор
                        </span>
                    )}
                </div>
                <CardMenu 
                    site={site} 
                    isOwner={isOwner} 
                    isCollaborator={isCollaborator}
                    canEdit={canEdit}
                    isAdmin={isEffectiveAdmin} 
                    onToggleStatus={handleToggleStatusWithCooldown} 
                    onDelete={handleDeleteWithConfirm}
                    onLeave={handleLeaveTeam}
                    onReport={() => setIsReportOpen(true)}
                    statusCooldown={statusCooldown}
                />
                <Link 
                    ref={coverContainerRef}
                    to={isSuspended ? '#' : mainLink} 
                    className={`
                        block w-full overflow-hidden border-b border-(--platform-border-color) relative shrink-0 @container
                        ${isSuspended ? 'cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    style={{ aspectRatio: '16 / 11' }}
                >
                    <SiteCoverDisplay 
                        site={{
                            ...site,
                            logo_url: getImageUrl(site.logo_url),
                            cover_image: getImageUrl(site.cover_image),
                            cover_logo_size: (site.cover_logo_size || 60) * scaleFactor,
                            cover_title_size: (site.cover_title_size || 24) * scaleFactor,
                        }} 
                        className="w-full h-full object-cover"
                        style={{ filter: isSuspended ? 'grayscale(1)' : (isMaintenance ? 'blur(1px) grayscale(0.3)' : 'none') }} 
                    />
                    {isMaintenance && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-(--platform-accent) backdrop-blur-[2px] text-center p-4 z-10 transition-opacity duration-200 group-hover:bg-black/75">
                            <Construction size={40} className="mb-2 shrink-0" />
                            <div className="font-bold text-lg uppercase tracking-widest text-white">Технічні роботи</div>
                            <div className="text-xs text-white opacity-90 mt-1">Сайт оновлюється</div>
                        </div>
                    )}
                </Link>
                <div className="p-4 flex-1 flex flex-col gap-3 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                        <div className="overflow-hidden min-w-0 flex-1">
                            <Link 
                                to={isSuspended ? '#' : mainLink} 
                                className={`block no-underline text-inherit ${isSuspended ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                <h3 
                                    className={`m-0 text-lg font-semibold whitespace-nowrap overflow-hidden text-ellipsis no-underline ${isMaintenance ? 'opacity-80' : ''}`}
                                    title={site.title}
                                >
                                    {site.title}
                                </h3>
                            </Link>
                            <div className="text-xs text-(--platform-text-secondary) mt-1.5 flex items-center justify-between w-full">
                                {!isOwner && (
                                    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden w-full">
                                        <span className="shrink-0">Автор:</span>
                                        <Link 
                                            to={`/profile/${site.author_slug || site.author}`} 
                                            className="text-(--platform-text-primary) hover:text-(--platform-accent)! text-sm font-bold transition-colors duration-200 no-underline cursor-pointer truncate"
                                            onClick={(e) => e.stopPropagation()}
                                            title={site.author}
                                        >
                                            {site.author}
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                        {canEdit && <SiteStatusBadge status={site.status} />}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-sm text-(--platform-text-secondary)">
                        <div className="flex items-center gap-1.5 shrink-0"><Calendar size={14} className="shrink-0"/> <span className="truncate">{formatDate(site.created_at)}</span></div>
                        <div className="flex items-center gap-1.5 shrink-0"><Eye size={14} className="shrink-0"/> <span className="truncate">{site.view_count || 0}</span></div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap min-h-6.5">
                        {site.tags && site.tags.length > 0 ? site.tags.slice(0, 4).map(tag => (
                            <span 
                                key={tag.id}
                                className="h-7 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition-colors flex items-center shrink-0 cursor-pointer border-(--platform-border-color) text-(--platform-text-secondary) bg-(--platform-card-bg) hover:border-(--platform-accent) hover:text-(--platform-accent)"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick && onTagClick(tag.id); }}
                            >
                                #{tag.name}
                            </span>
                        )) : (
                            <span className="text-xs text-(--platform-text-secondary) opacity-50 whitespace-nowrap flex items-center h-7">Без тегів</span>
                        )}
                    </div>
                    <div className="mt-auto pt-3">
                        {canEdit ? (
                            isSuspended ? (
                                <Link 
                                    to="/support/appeal"
                                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-lg bg-[color-mix(in_srgb,var(--platform-danger),transparent_85%)] text-(--platform-danger) hover:bg-(--platform-danger) hover:text-white border border-(--platform-danger) font-medium text-sm transition-all no-underline outline-none"
                                >
                                    <Gavel size={16} className="shrink-0" /> <span className="truncate">Оскаржити блокування</span>
                                </Link>
                            ) : (
                                <Link 
                                    to={`/dashboard/${site.site_path}`}
                                    className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-lg bg-(--platform-accent) text-white border-none font-medium text-sm cursor-pointer transition-all hover:bg-(--platform-accent-hover) no-underline outline-none"
                                >
                                    {isMaintenance ? (
                                        <><Wrench size={16} className="shrink-0" /> <span className="truncate">Налаштувати</span></>
                                    ) : (
                                        <><Edit size={16} className="shrink-0" /> <span className="truncate">Редагувати</span></>
                                    )}
                                </Link>
                            )
                        ) : (
                            <a 
                                href={`/site/${site.site_path}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={`
                                    flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-lg border-none font-medium text-sm cursor-pointer transition-all no-underline outline-none
                                    ${isMaintenance ? 'bg-(--platform-border-color) text-(--platform-text-secondary) cursor-not-allowed opacity-80' : 'bg-(--platform-accent) text-white hover:bg-(--platform-accent-hover)'}
                                `}
                            >
                                {isMaintenance ? <><Construction size={16} className="shrink-0"/> <span className="truncate">Роботи</span></> : <><ExternalLink size={16} className="shrink-0"/> <span className="truncate">Відвідати</span></>}
                            </a>
                        )}
                    </div>
                </div>
            </div>
            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} siteId={site.id} />
        </>
    );
};

export default SiteGridCard;