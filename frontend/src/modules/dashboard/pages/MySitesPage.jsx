// frontend/src/modules/dashboard/pages/MySitesPage.jsx
import React, { useState, useEffect, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../app/providers/AuthContext';
import apiClient from '../../../shared/api/api';
import { toast } from 'react-toastify';
import SiteFilters from '../../../shared/ui/complex/SiteFilters';
import SiteGridCard from '../../../shared/ui/complex/SiteGridCard';
import EmptyState from '../../../shared/ui/complex/EmptyState';
import LoadingState from '../../../shared/ui/complex/LoadingState';
import { Button } from '../../../shared/ui/elements/Button';
import { countOwnedSites } from '../../../shared/utils/siteUtils';
import { Plus, Search, Globe } from 'lucide-react';

const ITEMS_PER_PAGE = 20;
const SORT_OPTIONS = [
    { value: 'created_at:desc', label: 'Дата' },
    { value: 'created_at:asc', label: 'Дата' },
    { value: 'title:asc', label: 'Назва' },
    { value: 'title:desc', label: 'Назва' },
    { value: 'views:desc', label: 'Перегляди' },
    { value: 'views:asc', label: 'Перегляди' }
];

const MySitesPage = () => {
    const [sites, setSites] = useState([]);
    const [totalSiteCount, setTotalSiteCount] = useState(0);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState(null);
    const [sortOption, setSortOption] = useState('created_at:desc');
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
    const [onlyPinned, setOnlyPinned] = useState(false);
    const [limits, setLimits] = useState(null);
    const { user, plan } = useContext(AuthContext);
    const navigate = useNavigate();
    const searchTimeoutRef = useRef(null);
    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        apiClient.get('/tags').then(res => setTags(res.data)).catch(console.error);
        apiClient.get('/sites/catalog', { params: { scope: 'my' } })
            .then(res => setTotalSiteCount(countOwnedSites(res.data, user.id)))
            .catch(console.error);
            
        apiClient.get('/media/limits')
            .then(res => setLimits(res.data))
            .catch(console.error);
    }, [user, navigate]);
    
    const fetchMySites = async () => {
        try {
            setLoading(true);
            const params = { scope: 'my', search: searchTerm, sort: sortOption, tag: selectedTag };
            const response = await apiClient.get('/sites/catalog', { params });
            if (Array.isArray(response.data)) {
                setSites(response.data);
            } else {
                setSites([]);
            }
            setVisibleCount(ITEMS_PER_PAGE);
        } catch (err) { 
            toast.error('Не вдалося завантажити ваші сайти.'); 
            setSites([]);
        } finally { 
            setLoading(false); 
        }
    };
    
    useEffect(() => {
        if (!user) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => { fetchMySites(); }, 500);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [searchTerm, selectedTag, sortOption, user]);
    
    const handleSearchSubmit = () => { 
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); 
        fetchMySites(); 
    };
    
    const handleLoadMore = () => setVisibleCount(prev => prev + ITEMS_PER_PAGE);
    const formatDate = (d) => new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const handleDeleteSite = async (e, sitePath, siteTitle) => {
        try {
            await apiClient.delete(`/sites/${sitePath}`);
            setSites(prev => prev.filter(s => s.site_path !== sitePath));
            setTotalSiteCount(prev => Math.max(0, prev - 1));
            toast.success('Видалено!');
        } catch (err) { 
            toast.error('Помилка при видаленні'); 
        }
    };

    const handleStatusChange = async (site, requestedStatus) => {
        try {
            const newStatus = requestedStatus || (site.status === 'published' ? 'maintenance' : 'published');
            await apiClient.put(`/sites/${site.site_path}/settings`, { status: newStatus });
            setSites(prev => prev.map(s => s.id === site.id ? { ...s, status: newStatus } : s));
            
            if (newStatus === 'private') toast.success('Сайт приховано');
            else if (newStatus === 'published') toast.success('Сайт опубліковано');
            else toast.success('Сайт переведено в режим обслуговування');
        } catch (err) { 
            if (err.response && err.response.status === 403) {
                 toast.error(err.response.data.message);
            } else {
                 toast.error('Помилка при зміні статусу'); 
            }
        }
    };
    
    const handleTogglePin = async (siteId) => {
        try {
            const res = await apiClient.patch(`/sites/${siteId}/pin`);
            setSites(prev => prev.map(s => s.id === siteId ? { ...s, is_pinned: res.data.is_pinned } : s));
        } catch (error) { toast.error('Помилка'); }
    };
    
    const safeSites = Array.isArray(sites) ? sites : [];
    const filteredSites = safeSites.filter(s => onlyPinned ? s.is_pinned : true)
        .sort((a, b) => (a.is_pinned === b.is_pinned ? 0 : a.is_pinned ? -1 : 1));
    const visibleSites = filteredSites.slice(0, visibleCount);
    const isPlanAdmin = plan && String(plan).trim().toUpperCase() === 'ADMIN';
    const maxSites = isPlanAdmin ? '∞' : (limits ? limits.maxSites : '...');
    const isLimitReached = !isPlanAdmin && limits && totalSiteCount >= limits.maxSites;
    return (
        <div className="-m-4 sm:-m-8 w-[calc(100%+2rem)] sm:w-[calc(100%+4rem)] min-h-[calc(100vh-64px+4rem)] flex flex-col bg-(--platform-bg)">
            <div className="sticky top-0 z-50 bg-(--platform-bg) shadow-sm border-b border-(--platform-border-color)">
                <div className="px-4 py-4 sm:px-8 lg:px-10 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 border-b border-(--platform-border-color) bg-(--platform-bg)">
                    <div className="w-full sm:w-1/3 flex justify-center sm:justify-start shrink-0">
                        <div 
                            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors
                                ${isLimitReached 
                                    ? 'bg-[color-mix(in_srgb,var(--platform-accent),transparent_90%)] text-(--platform-accent) border-[color-mix(in_srgb,var(--platform-accent),transparent_70%)]' 
                                    : 'bg-(--platform-card-bg) text-(--platform-text-secondary) border-(--platform-border-color)'
                                }
                            `}
                            title={isLimitReached ? "Ліміт сайтів вичерпано" : "Створені сайти"}
                        >
                            <Globe size={16} className="shrink-0" />
                            <span>Сайти: {totalSiteCount} / {maxSites}</span>
                        </div>
                    </div>
                    <div className="w-full sm:w-1/3 flex justify-center shrink-0">
                        <h1 className="text-lg sm:text-xl font-bold m-0 text-(--platform-text-primary)">
                            Мої Сайти
                        </h1>
                    </div>
                    <div className="w-full sm:w-1/3 flex justify-center sm:justify-end shrink-0">
                        <Link to="/create-site" className="w-full sm:w-auto no-underline" onClick={(e) => isLimitReached && e.preventDefault()}>
                            <Button 
                                variant="primary" 
                                disabled={isLimitReached} 
                                title={isLimitReached ? "Ліміт сайтів вичерпано" : ""}
                                className="w-full sm:w-auto h-10 shadow-sm"
                            >
                                <Plus size={18} className="shrink-0 mr-1.5" /> Створити новий
                            </Button>
                        </Link>
                    </div>
                </div>
                <SiteFilters 
                    searchTerm={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    onSearchSubmit={handleSearchSubmit}
                    sortOption={sortOption} 
                    onSortChange={setSortOption}
                    sortOptions={SORT_OPTIONS}
                    tags={tags} 
                    selectedTag={selectedTag} 
                    onTagSelect={setSelectedTag}
                    showStarFilter={true} 
                    isStarActive={onlyPinned} 
                    onStarClick={() => setOnlyPinned(!onlyPinned)}
                    starTitle="Тільки закріплені"
                />
            </div>
            <div className="flex-1 p-4 sm:p-8 lg:p-10 relative bg-(--platform-bg)">
                {loading ? (
                    <LoadingState layout="page" />
                ) : filteredSites.length === 0 ? (
                    <EmptyState 
                        title="Сайтів не знайдено"
                        description={safeSites.length === 0 ? "У вас ще немає створених сайтів" : "Спробуйте змінити параметри пошуку"}
                        icon={Search}
                        action={
                            (searchTerm || selectedTag || onlyPinned) ? (
                                <Button variant="ghost" onClick={() => { setSearchTerm(''); setSelectedTag(null); setOnlyPinned(false); }}>
                                    Очистити фільтри
                                </Button>
                            ) : (
                                <Link to="/create-site" className="no-underline w-full sm:w-auto" onClick={(e) => isLimitReached && e.preventDefault()}>
                                    <Button variant="outline" disabled={isLimitReached} className="w-full sm:w-auto">
                                        <Plus size={16} className="mr-1.5" /> Створити сайт
                                    </Button>
                                </Link>
                            )
                        }
                    />
                ) : (
                    <>
                        <div className="grid gap-4 sm:gap-5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                            {visibleSites.map(site => {
                                const isSiteOwner = site.user_id === user?.id;
                                return (
                                    <SiteGridCard 
                                        key={site.id} 
                                        site={site} 
                                        variant={isSiteOwner ? 'owner' : 'collaborator'} 
                                        onTagClick={setSelectedTag} 
                                        formatDate={formatDate}
                                        onDelete={handleDeleteSite} 
                                        onToggleStatus={handleStatusChange}
                                        onTogglePin={handleTogglePin}
                                    />
                                );
                            })}
                        </div>
                        {filteredSites.length > visibleCount && (
                            <div className="text-center mt-8 pb-6">
                                <Button variant="outline" onClick={handleLoadMore} className="rounded-full px-6">
                                    Показати ще ({filteredSites.length - visibleCount})
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MySitesPage;