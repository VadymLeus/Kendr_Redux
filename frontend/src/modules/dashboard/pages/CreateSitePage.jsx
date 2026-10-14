// frontend/src/modules/dashboard/pages/CreateSitePage.jsx
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import apiClient from '../../../shared/api/api';
import { Input } from '../../../shared/ui/elements/Input';
import { Button } from '../../../shared/ui/elements/Button';
import ConfirmModal from '../../../shared/ui/complex/ConfirmModal';
import TemplateModal from '../components/TemplateModal';
import UniversalMediaInput from '../../../shared/ui/complex/UniversalMediaInput';
import EmptyState from '../../../shared/ui/complex/EmptyState';
import SitePreviewer from '../../../shared/ui/complex/SitePreviewer';
import LoadingState from '../../../shared/ui/complex/LoadingState';
import TemplateCard from '../../../shared/ui/complex/TemplateCard';
import TemplateFilters from '../../../shared/ui/complex/TemplateFilters';
import TemplateBadge from '../../../shared/ui/complex/TemplateBadge';
import { AuthContext } from '../../../app/providers/AuthContext';
import { BASE_URL } from '../../../shared/config';
import { TEXT_LIMITS } from '../../../shared/config/limits';
import { validateSiteSlug, validateSiteTitle } from '../../../shared/utils/validationUtils';
import { useTemplateManager } from '../../../shared/hooks/useTemplateManager';
import { getTemplatePreviewData } from '../../../shared/utils/templateUtils';
import { Layout, Check, Loader, AlertCircle, Trash, Info, Palette, Sparkles, Globe, Image, ChevronLeft, ChevronRight, Copy, Edit, ArrowLeft } from 'lucide-react';

const logosModules = import.meta.glob('../../../shared/assets/CreateLogos/*.{png,jpg,jpeg,webp,svg}', { 
    eager: true, 
    as: 'url' 
});
const LOCAL_DEFAULT_LOGOS = Object.values(logosModules);
const CreateSitePage = () => {
    const navigate = useNavigate();
    const { isAdmin, plan, user } = useContext(AuthContext);
    const manager = useTemplateManager({ isAdmin, initialSourceTab: 'system' });
    const [currentSiteCount, setCurrentSiteCount] = useState(0);
    const [limits, setLimits] = useState(null);
    const [isLoadingMeta, setIsLoadingMeta] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [panelTab, setPanelTab] = useState('info'); 
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [formData, setFormData] = useState({ title: '', slug: '' });
    const [titleError, setTitleError] = useState(null);
    const [slugError, setSlugError] = useState(null);
    const [slugStatus, setSlugStatus] = useState('idle');
    const [customLogo, setCustomLogo] = useState(null);
    const [defaultRandomLogo, setDefaultRandomLogo] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentPreviewSlug, setCurrentPreviewSlug] = useState('home');
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [sitesRes, limitsRes] = await Promise.allSettled([
                    apiClient.get('/sites/catalog', { params: { scope: 'my' } }),
                    apiClient.get('/media/limits')
                ]);
                if (sitesRes.status === 'fulfilled') setCurrentSiteCount(Array.isArray(sitesRes.value.data) ? sitesRes.value.data.length : 0);
                if (limitsRes.status === 'fulfilled') setLimits(limitsRes.value.data);
                if (LOCAL_DEFAULT_LOGOS.length > 0 && !defaultRandomLogo) {
                    setDefaultRandomLogo(LOCAL_DEFAULT_LOGOS[Math.floor(Math.random() * LOCAL_DEFAULT_LOGOS.length)]);
                }
            } catch (err) {
                toast.error('Не вдалося завантажити ліміти');
            } finally {
                setIsLoadingMeta(false);
            }
        };
        fetchMeta();
    }, []);

    useEffect(() => {
        if (!isLoadingMeta && !manager.isLoading) {
            if (isInitialLoad) {
                setIsInitialLoad(false);
                if (!manager.selectedTemplateId) {
                    manager.setSelectedTemplateId('blank');
                }
            }
        }
    }, [isLoadingMeta, manager.isLoading, isInitialLoad, manager.selectedTemplateId, manager]);

    const isPlanAdmin = plan && String(plan).trim().toUpperCase() === 'ADMIN';
    const maxSitesDisplay = isPlanAdmin ? '∞' : (limits ? limits.maxSites : '...');
    const isLimitReached = !isPlanAdmin && limits && currentSiteCount >= limits.maxSites;
    useEffect(() => {
        const checkSlug = async () => {
            const currentSlug = formData.slug;
            if (!currentSlug) {
                setSlugStatus('idle'); setSlugError(null); return;
            }
            const validation = validateSiteSlug(currentSlug);
            if (!validation.isValid) {
                setSlugStatus(validation.status); setSlugError(validation.error); return;
            }
            setSlugStatus('checking'); setSlugError(null);
            try {
                const res = await apiClient.get(`/sites/check-slug?slug=${currentSlug}`);
                if (res.data.isAvailable) setSlugStatus('available');
                else { setSlugStatus('taken'); setSlugError(res.data.message || 'Ця адреса вже зайнята'); }
            } catch (err) { 
                setSlugStatus('idle'); setSlugError('Помилка перевірки адреси');
            }
        };
        const timer = setTimeout(checkSlug, 500);
        return () => clearTimeout(timer);
    }, [formData.slug]);

    const displayTemplates = useMemo(() => {
        if (manager.filters.templateSourceTab === 'system') {
            return [{ id: 'blank', isBlank: true }, ...manager.templates];
        }
        return manager.templates;
    }, [manager.templates, manager.filters.templateSourceTab]);

    const previewData = useMemo(() => {
        if (manager.selectedTemplateId === 'blank') {
            return { 
                pages: [{ slug: 'home', name: 'Головна', blocks: [] }], 
                theme: { mode: 'light', accent: 'blue' }, 
                header: [], 
                footer: [], 
                siteData: {} 
            };
        }
        const data = getTemplatePreviewData(manager.selectedTemplate);
        return data || { pages: [], theme: { mode: 'light', accent: 'blue' }, header: [], footer: [], siteData: {} };
    }, [manager.selectedTemplate, manager.selectedTemplateId]);

    useEffect(() => {
        if (previewData.pages.length > 0) {
            const hasHomePage = previewData.pages.find(p => p.slug === 'home');
            setCurrentPreviewSlug(hasHomePage ? 'home' : (previewData.pages[0]?.slug || 'home'));
        }
    }, [manager.selectedTemplateId, previewData.pages]);

    const currentBlocks = useMemo(() => {
        const page = previewData.pages.find(p => p.slug === currentPreviewSlug);
        return page ? (page.blocks || []) : [];
    }, [previewData.pages, currentPreviewSlug]);

    const effectiveLogo = customLogo || defaultRandomLogo;
    const handleTitleChange = (e) => {
        const { val, error } = validateSiteTitle(e.target.value);
        setTitleError(error); setFormData(prev => ({ ...prev, title: val }));
    };

    const handleSlugChange = (e) => {
        const sanitizedVal = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setFormData(prev => ({ ...prev, slug: sanitizedVal }));
    };

    const handleSubmit = async () => {
        const trimmedTitle = formData.title.trim();
        if (isLimitReached || !trimmedTitle || !formData.slug || !manager.selectedTemplateId || slugStatus !== 'available' || titleError || slugError) return;
        setIsSubmitting(true);
        try {
            const isBlank = manager.selectedTemplateId === 'blank';
            const payload = {
                sitePath: formData.slug, 
                title: trimmedTitle, 
                selected_logo_url: effectiveLogo,
                isBlank: isBlank
            };
            if (!isBlank) {
                payload.templateId = manager.selectedTemplateId;
            }
            const res = await apiClient.post('/sites/create', payload);
            toast.success('Сайт створено успішно!');
            window.location.href = `/dashboard/${res.data.site.site_path}`;
        } catch (err) {
            setIsSubmitting(false); 
            toast.error(err.response?.data?.message || 'Помилка при створенні сайту');
        }
    };

    const handleConfirmAction = async () => {
        const { actionType, template } = manager.modals.confirmModal;
        await manager.actions.handleAction(actionType, template);
        manager.modals.setConfirmModal({ isOpen: false, template: null, actionType: null });
    };

    const getFullUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http') || path.startsWith('data:')) return path;
        if (path.startsWith('/logos/')) return path; 
        if (path.includes('/assets/') || path.includes('/src/') || path.includes('@fs')) return path;
        return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    };

    if (isInitialLoad) return <div className="absolute inset-0 flex items-center justify-center bg-(--platform-bg) z-50"><LoadingState title="Завантаження даних..." layout="page" /></div>;
    const isFormReady = !isLimitReached && formData.title.trim().length >= 2 && !titleError && formData.slug && slugStatus === 'available' && !slugError;
    return (
        <div className="relative flex w-full h-full overflow-hidden bg-(--platform-bg)">
            <ConfirmModal 
                isOpen={manager.modals.confirmModal.isOpen} 
                title={manager.modals.confirmModal.actionType === 'delete' ? "Видалити шаблон?" : "Скопіювати шаблон?"} 
                message={manager.modals.confirmModal.actionType === 'delete' ? "Ви впевнені? Це незворотньо." : "Створити копію цього шаблону? Вона буде збережена як ваша чернетка."} 
                confirmLabel={manager.modals.confirmModal.actionType === 'delete' ? 'Видалити' : 'Скопіювати'} 
                cancelLabel="Скасувати" 
                onConfirm={handleConfirmAction} 
                onCancel={() => manager.modals.setConfirmModal({ isOpen: false, template: null, actionType: null })} 
                type={manager.modals.confirmModal.actionType === 'delete' ? "danger" : "primary"} 
            />
            <TemplateModal 
                isOpen={manager.modals.isEditModalOpen} 
                initialData={manager.modals.editingTemplate} 
                onClose={() => { manager.modals.setIsEditModalOpen(false); manager.modals.setEditingTemplate(null); }} 
                onSave={manager.actions.handleSaveTemplateChanges} 
            />
            <div 
                className={`
                    flex flex-col h-full bg-(--platform-card-bg) z-40 shrink-0 overflow-hidden
                    transition-all duration-300 ease-in-out absolute md:relative
                    ${isSidebarOpen 
                        ? 'w-[calc(100%-28px)] md:w-105 lg:w-120 opacity-100 border-r border-(--platform-border-color) shadow-2xl md:shadow-[10px_0_15px_-3px_rgba(0,0,0,0.05)]' 
                        : 'w-0 opacity-0 border-none pointer-events-none'}
                `}
            >
                <div className="w-[calc(100vw-28px)] md:w-105 lg:w-120 h-full flex flex-col shrink-0">
                    <div className="p-4 md:p-6 border-b border-(--platform-border-color) shrink-0">
                        <div className="flex items-center mb-4 md:mb-6">
                            <h1 className="text-xl font-bold text-(--platform-text-primary) m-0">Новий сайт</h1>
                        </div>
                        <div className="flex p-1 bg-(--platform-bg) rounded-xl border border-(--platform-border-color)">
                            <button className={`flex-1 py-2 px-2 md:py-2.5 md:px-3 rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-1.5 md:gap-2 transition-all ${panelTab === 'info' ? 'bg-(--platform-card-bg) text-(--platform-text-primary) shadow-sm' : 'text-(--platform-text-secondary)'}`} onClick={() => setPanelTab('info')}>
                                <Info size={16} className="shrink-0" /> <span className="truncate">1. Інформація</span>
                            </button>
                            <button className={`flex-1 py-2 px-2 md:py-2.5 md:px-3 rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-1.5 md:gap-2 transition-all ${panelTab === 'design' ? 'bg-(--platform-card-bg) text-(--platform-text-primary) shadow-sm' : 'text-(--platform-text-secondary)'}`} onClick={() => setPanelTab('design')}>
                                <Palette size={16} className="shrink-0" /> <span className="truncate">2. Дизайн</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-6 pb-6 pt-0 bg-(--platform-bg) min-h-0 [scrollbar-gutter:stable]">
                        {panelTab === 'info' ? (
                             <div className="flex flex-col gap-5 md:gap-6 pt-4 md:pt-6">
                                <div className={`p-4 rounded-xl border flex items-center justify-between ${isLimitReached ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400' : 'bg-(--platform-card-bg) border-(--platform-border-color)'}`}>
                                    <div className="flex items-center gap-2"><Globe size={18} /><span className="font-medium text-sm">Створено сайтів:</span></div>
                                    <span className="font-bold text-lg">{currentSiteCount} / {maxSitesDisplay}</span>
                                </div>
                                {isLimitReached && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-start gap-2 -mt-2 md:-mt-3">
                                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                        <span>Ви досягли ліміту створення сайтів для вашого тарифу (<b>{plan}</b>). Щоб створити новий, видаліть один із існуючих.</span>
                                    </div>
                                )}
                                <div className="p-4 md:p-5 bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) shadow-sm space-y-4">
                                    <div><Input label="Назва сайту" value={formData.title} onChange={handleTitleChange} placeholder="Мій Сайт" autoFocus disabled={isLimitReached} error={titleError} wrapperStyle={{ marginBottom: titleError ? 0 : '0.5rem' }}/></div>
                                    <div><Input label="Веб-адреса" value={formData.slug} onChange={handleSlugChange} maxLength={TEXT_LIMITS.SITE_SLUG} placeholder="my-cool-shop" rightIcon={slugStatus === 'checking' ? <Loader size={16} className="animate-spin" /> : slugStatus === 'available' ? <Check size={18} className="text-emerald-500" /> : (slugStatus === 'taken' || slugStatus === 'invalid') ? <AlertCircle size={18} className="text-red-500" /> : <Globe size={16} />} error={slugError} helperText={`kendr.site/${formData.slug || '...'}`} disabled={isLimitReached} wrapperStyle={{ marginBottom: slugError ? 0 : '0.5rem' }}/></div>
                                </div>
                                <div className={`p-4 md:p-5 bg-(--platform-card-bg) rounded-2xl border border-(--platform-border-color) shadow-sm ${isLimitReached ? 'opacity-60 pointer-events-none' : ''}`}>
                                    <label className="mb-3 font-semibold text-(--platform-text-primary) text-sm flex items-center gap-2"><Sparkles size={18} className="text-(--platform-accent)" /> Логотип</label>
                                    <UniversalMediaInput type="image" value={customLogo} onChange={setCustomLogo} aspect={1} circularCrop={true} triggerStyle={{ width: '100%', border: 'none', background: 'transparent', padding: 0 }}>
                                        {customLogo ? (
                                            <div key="custom-logo" className="relative group w-28 h-28 md:w-32 md:h-32 mx-auto rounded-xl border border-(--platform-border-color) bg-(--platform-bg) flex items-center justify-center overflow-hidden cursor-pointer hover:border-(--platform-accent) transition-colors shadow-sm">
                                                <img src={getFullUrl(customLogo)} alt="Custom Logo" className="w-full h-full object-contain p-2" />
                                                <button onClick={(e) => { e.stopPropagation(); setCustomLogo(null); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-md" title="Видалити та повернути стандартний"><Trash size={14} /></button>
                                            </div>
                                        ) : (
                                            <div key="default-logo" className="w-full h-28 md:h-32 border-2 border-dashed border-(--platform-border-color) rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-(--platform-accent) hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group bg-(--platform-bg)">
                                                <div className="w-10 h-10 md:w-12 md:h-12 opacity-50 grayscale group-hover:grayscale-0 transition-all flex items-center justify-center">
                                                     {defaultRandomLogo ? (<img src={getFullUrl(defaultRandomLogo)} className="w-full h-full object-contain" alt="Default" />) : (<Image size={40} className="text-gray-400" />)}
                                                </div>
                                                <span className="text-xs md:text-sm font-medium text-(--platform-text-secondary) group-hover:text-(--platform-accent)">Змінити логотип</span>
                                            </div>
                                        )}
                                    </UniversalMediaInput>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="sticky top-0 -mx-4 md:-mx-6 px-4 md:px-6 pt-4 pb-2 bg-(--platform-bg)/95 z-20 mb-4 backdrop-blur-sm border-b border-transparent transition-all">
                                    <TemplateFilters filters={manager.filters} isAdmin={isAdmin} />
                                </div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 pb-4 px-1 relative">
                                    {manager.isLoading && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-(--platform-bg)/50 backdrop-blur-sm rounded-xl">
                                            <Loader size={32} className="animate-spin text-(--platform-accent)" />
                                        </div>
                                    )}
                                    {displayTemplates.length > 0 ? displayTemplates.map(tpl => {
                                        if (tpl.id === 'blank') {
                                            const isSelected = manager.selectedTemplateId === 'blank';
                                            return (
                                                <div 
                                                    key="blank"
                                                    onClick={() => manager.setSelectedTemplateId('blank')}
                                                    className={`relative flex flex-col items-center justify-center p-5 md:p-6 rounded-2xl cursor-pointer transition-all duration-200 h-full min-h-65 md:min-h-75 bg-(--platform-bg) hover:border-(--platform-accent) group ${isSelected ? 'border-2 border-(--platform-accent) ring-4 ring-(--platform-accent)/10' : 'border-2 border-dashed border-(--platform-border-color)'}`}
                                                >
                                                    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full shadow-sm flex items-center justify-center mb-4 md:mb-5 transition-all duration-300 ${isSelected ? 'bg-(--platform-accent) text-white scale-110' : 'bg-(--platform-card-bg) text-(--platform-text-secondary) group-hover:text-(--platform-accent) group-hover:scale-110'}`}>
                                                        <Layout size={28} className="md:w-8 md:h-8" />
                                                    </div>
                                                    <h3 className="text-lg md:text-xl font-bold text-(--platform-text-primary) mb-2 md:mb-3">Пустий сайт</h3>
                                                    <p className="text-xs md:text-sm text-(--platform-text-secondary) text-center max-w-[90%] md:max-w-[85%]">
                                                        Почніть з чистого аркуша і створіть свій ідеальний сайт.
                                                    </p>
                                                    {isSelected && (
                                                        <div className="absolute top-3 right-3 md:top-4 md:right-4 w-6 h-6 md:w-7 md:h-7 bg-(--platform-accent) text-white rounded-full flex items-center justify-center shadow-md animate-in zoom-in">
                                                            <Check size={14} className="md:w-4 md:h-4" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return (
                                            <TemplateCard 
                                                key={tpl.id}
                                                template={tpl}
                                                isSelected={manager.selectedTemplateId === tpl.id}
                                                onClick={() => manager.setSelectedTemplateId(tpl.id)}
                                                getFullUrl={getFullUrl}
                                                badge={<TemplateBadge template={tpl} user={user} isAdmin={isAdmin} sourceTab={manager.filters.templateSourceTab} />}
                                                actions={(manager.filters.templateSourceTab === 'personal' || isAdmin) && (
                                                    <>
                                                        {isAdmin && manager.filters.templateSourceTab === 'system' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); manager.modals.setConfirmModal({ isOpen: true, template: tpl, actionType: 'copy' }); }} 
                                                                className="p-1.5 text-(--platform-text-secondary) hover:text-(--platform-text-primary) hover:bg-(--platform-hover-bg) rounded-md transition-colors" 
                                                                title="Скопіювати як чернетку"
                                                            >
                                                                <Copy size={14}/>
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); manager.modals.setEditingTemplate(tpl); manager.modals.setIsEditModalOpen(true); }} 
                                                            className="p-1.5 text-(--platform-text-secondary) hover:text-(--platform-text-primary) hover:bg-(--platform-hover-bg) rounded-md transition-colors" 
                                                            title="Редагувати шаблон"
                                                        >
                                                            <Edit size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); manager.modals.setConfirmModal({ isOpen: true, template: tpl, actionType: 'delete' }); }} 
                                                            className="p-1.5 text-(--platform-text-secondary) hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" 
                                                            title="Видалити шаблон"
                                                        >
                                                            <Trash size={14}/>
                                                        </button>
                                                    </>
                                                )}
                                            />
                                        );
                                    }) : <div className="col-span-1 xl:col-span-2 mt-10"><EmptyState title="Не знайдено" description="Спробуйте змінити фільтри" icon={Layout}/></div>}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 md:p-6 bg-(--platform-card-bg) border-t border-(--platform-border-color) shrink-0">
                        {panelTab === 'design' && !isFormReady ? (
                            <Button variant="outline" className="w-full justify-center text-sm md:text-base py-2.5 md:py-3" onClick={() => setPanelTab('info')}>
                                Далі: Заповніть інформацію <ArrowLeft size={18} className="rotate-180 ml-2" />
                            </Button>
                        ) : (
                            <Button variant="primary" className="w-full justify-center text-sm md:text-base py-2.5 md:py-3" onClick={handleSubmit} disabled={!isFormReady || isSubmitting}>
                                {isSubmitting ? <Loader size={18} className="animate-spin" /> : <>Створити сайт <Check size={20} className="ml-2" /></>}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            <div 
                className={`flex absolute z-50 top-1/2 -translate-y-1/2 items-center justify-center transition-all duration-300 ease-in-out ${
                    isSidebarOpen 
                        ? 'left-[calc(100%-28px)] md:left-105 lg:left-120 md:-ml-px' 
                        : 'left-0'
                }`}
            >
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                    title={isSidebarOpen ? "Згорнути панель" : "Розгорнути панель"} 
                    className={`group flex items-center justify-center w-7 h-28 bg-(--platform-card-bg) border border-(--platform-border-color) shadow-md cursor-pointer transition-all duration-200 focus:outline-none rounded-r-xl ${isSidebarOpen ? 'border-l-0' : ''} hover:border-(--platform-accent)`}
                >
                    <div className="transition-transform duration-200 group-hover:scale-110 text-(--platform-text-secondary) group-hover:text-(--platform-accent)">
                        {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                    </div>
                </button>
            </div>
            <div className="flex-1 min-w-0 h-full relative bg-(--platform-bg) z-10">
                <SitePreviewer 
                    previewData={previewData} 
                    currentBlocks={currentBlocks} 
                    isLoading={manager.isLoading}
                    emptyTitle="Оберіть шаблон" 
                    emptyDescription="Оберіть шаблон для попереднього перегляду" 
                    url={`kendr.site/${formData.slug || 'your-site'}`} 
                    userTitle={formData.title} 
                    userLogo={effectiveLogo} 
                />
            </div>
        </div>
    );
};

export default CreateSitePage;