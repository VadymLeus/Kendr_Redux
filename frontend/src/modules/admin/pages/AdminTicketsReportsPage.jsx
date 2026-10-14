// frontend/src/modules/admin/pages/AdminTicketsReportsPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button } from '../../../shared/ui/elements/Button';
import Avatar from '../../../shared/ui/elements/Avatar';
import CustomSelect from '../../../shared/ui/elements/CustomSelect';
import { Input } from '../../../shared/ui/elements/Input';
import DateRangePicker from '../../../shared/ui/elements/DateRangePicker';
import AdminPageLayout from '../components/AdminPageLayout';
import { AdminTable, AdminTh, AdminRow, AdminCell, LoadingRow, EmptyRow, FilterBar, GenericBadge, CsvExportButton } from '../components/AdminTableComponents';
import { useDataList } from '../../../shared/hooks/useDataList';
import { useConfirm } from '../../../shared/hooks/useConfirm';
import apiClient from '../../../shared/api/api';
import { exportToCsv } from '../../../shared/utils/exportToCsv';
import { MessageSquare, CheckCircle, Gavel, XCircle, RotateCcw, Clock, ExternalLink, Inbox, User, HelpCircle, Wrench, CreditCard, Handshake, Search, ShieldAlert, X, AlertTriangle, FileWarning, Ban, Copyright, Check } from 'lucide-react';

const CATEGORY_OPTIONS = [
    { value: 'all', label: 'Всі', icon: Inbox }, { value: 'general', label: 'Загальні', icon: HelpCircle },
    { value: 'technical', label: 'Технічні', icon: Wrench }, { value: 'billing', label: 'Оплата', icon: CreditCard },
    { value: 'complaint', label: 'Скарга', icon: MessageSquare }, { value: 'partnership', label: 'Співпраця', icon: Handshake }, { value: 'appeal', label: 'Апеляція', icon: Gavel }
];

const TICKET_COLORS = { 
    general: 'var(--platform-accent)', technical: '#8b5cf6', billing: 'var(--platform-success)', 
    complaint: 'var(--platform-danger)', partnership: '#ec4899', appeal: 'var(--platform-warning)' 
};

const REASON_OPTIONS = [
    { value: 'all', label: 'Всі причини', icon: Inbox }, { value: 'spam', label: 'Спам', icon: Ban },
    { value: 'scam', label: 'Шахрайство', icon: ShieldAlert }, { value: 'inappropriate_content', label: 'Заборонений контент', icon: FileWarning },
    { value: 'copyright', label: 'Авторські права', icon: Copyright }, { value: 'other', label: 'Інше', icon: HelpCircle }
];

const REPORT_STATUS_CONFIG = {
    new: { bg: 'color-mix(in srgb, var(--platform-danger), transparent 90%)', color: 'var(--platform-danger)', label: 'Нова', icon: AlertTriangle },
    dismissed: { bg: 'var(--platform-hover-bg)', color: 'var(--platform-text-secondary)', label: 'Відхилено', icon: X },
    banned: { bg: 'color-mix(in srgb, var(--platform-text-primary), transparent 90%)', color: 'var(--platform-text-primary)', label: 'Заблоковано', icon: Ban },
    resolved: { bg: 'color-mix(in srgb, var(--platform-success), transparent 90%)', color: 'var(--platform-success)', label: 'Вирішено', icon: CheckCircle }
};

const REPORT_STATUS_OPTIONS = [
    { value: 'new', label: 'Нові', icon: AlertTriangle },
    { value: 'dismissed', label: 'Відхилені', icon: X },
    { value: 'banned', label: 'Заблоковані', icon: Ban },
    { value: 'all', label: 'Всі', icon: Inbox }
];

const AdminTicketsReportsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(location.search);
        return params.get('tab') === 'reports' ? 'reports' : 'tickets';
    });

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('tab') !== activeTab) {
            navigate({ search: `?tab=${activeTab}` }, { replace: true });
        }
    }, [activeTab, navigate, location.search]);

    const { confirm } = useConfirm();
    const handleAction = async (fn, msg, refreshFn) => { 
        try { 
            await fn(); 
            toast.success(msg); 
            refreshFn(); 
        } catch { 
            toast.error('Помилка виконання дії'); 
        } 
    };

    const [ticketStatus, setTicketStatus] = useState('active');
    const [ticketCategory, setTicketCategory] = useState('all');
    const [ticketStartDate, setTicketStartDate] = useState('');
    const [ticketEndDate, setTicketEndDate] = useState('');
    const [ticketSort, setTicketSort] = useState({ key: 'updated_at', direction: 'desc' });
    const ticketsData = useDataList(`/support/admin/tickets?status=${ticketStatus}`, ['subject', 'username', 'user_email', 'id']);
    const processedTickets = useMemo(() => {
        let res = ticketCategory !== 'all' ? ticketsData.filteredData.filter(t => t.type === ticketCategory) : [...ticketsData.filteredData];
        if (ticketStartDate) {
            const start = new Date(`${ticketStartDate}T00:00:00`);
            res = res.filter(t => new Date(t.updated_at || t.created_at) >= start);
        }
        if (ticketEndDate) {
            const end = new Date(`${ticketEndDate}T23:59:59`);
            res = res.filter(t => new Date(t.updated_at || t.created_at) <= end);
        }
        return res.sort((a, b) => (a[ticketSort.key] < b[ticketSort.key] ? -1 : 1) * (ticketSort.direction === 'asc' ? 1 : -1));
    }, [ticketsData.filteredData, ticketCategory, ticketSort, ticketStartDate, ticketEndDate]);
    
    const handleTicketSort = (key) => setTicketSort(c => ({ key, direction: c.key === key && c.direction === 'desc' ? 'asc' : 'desc' }));
    const ticketActions = {
        closeTicket: async (id) => {
            const isConfirmed = await confirm({ title: 'Закрити?', message: `Тікет #${id} в архів.`, type: 'warning', confirmText: 'Закрити' });
            if (isConfirmed) {
                handleAction(() => apiClient.put(`/support/${id}/status`, { status: 'closed' }), 'Закрито', ticketsData.refresh);
            }
        },
        restoreTicket: async (id) => {
            const isConfirmed = await confirm({ title: 'Відновити?', message: `Тікет #${id} активний.`, type: 'info', confirmText: 'Відновити' });
            if (isConfirmed) {
                handleAction(() => apiClient.put(`/support/${id}/status`, { status: 'open' }), 'Відновлено', ticketsData.refresh);
            }
        }
    };
    
    const handleExportTickets = () => {
        if (!processedTickets?.length) return toast.info('Немає даних');
        exportToCsv(processedTickets.map(t => ({
            id: t.id, subject: t.subject, category: CATEGORY_OPTIONS.find(o => o.value === t.type)?.label || t.type,
            user: t.username, email: t.user_email, status: t.status === 'open' ? 'Відкрито' : t.status === 'answered' ? 'Відповідь' : 'Закрито',
            updated: new Date(t.updated_at).toLocaleString('uk-UA')
        })), { id: 'ID', subject: 'Тема', category: 'Категорія', user: 'Користувач', email: 'Email', status: 'Статус', updated: 'Оновлено' }, `tickets_${new Date().toLocaleDateString('uk-UA')}`);
    };

    const [reportStatus, setReportStatus] = useState('new');
    const [reportReason, setReportReason] = useState('all');
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const [reportSort, setReportSort] = useState({ key: 'created_at', direction: 'desc' });
    const reportsData = useDataList(`/admin/reports?status=${reportStatus}`, ['site_title', 'reporter_email', 'reason', 'description', 'id']);
    const processedReports = useMemo(() => {
        let res = reportReason !== 'all' ? reportsData.filteredData.filter(i => i.reason === reportReason) : [...reportsData.filteredData];
        if (reportStartDate) {
            const start = new Date(`${reportStartDate}T00:00:00`);
            res = res.filter(r => new Date(r.created_at) >= start);
        }
        if (reportEndDate) {
            const end = new Date(`${reportEndDate}T23:59:59`);
            res = res.filter(r => new Date(r.created_at) <= end);
        }
        return res.sort((a, b) => (a[reportSort.key] < b[reportSort.key] ? -1 : 1) * (reportSort.direction === 'asc' ? 1 : -1));
    }, [reportsData.filteredData, reportReason, reportSort, reportStartDate, reportEndDate]);
    
    const handleReportSort = (key) => setReportSort(c => ({ key, direction: c.key === key && c.direction === 'desc' ? 'asc' : 'desc' }));
    const filterByUser = (email, e) => { e.stopPropagation(); reportsData.setSearchQuery(email); toast.info(`Фільтр: ${email}`); };
    const reportActions = {
        dismiss: async (id) => {
            const isConfirmed = await confirm({ 
                title: 'Відхилити скаргу?', 
                message: 'Скаргу буде відхилено. Для підтвердження введіть "CANCEL".', 
                type: 'warning', 
                confirmText: 'Відхилити',
                requireInput: true,
                expectedInput: 'CANCEL'
            });
            if (isConfirmed) {
                handleAction(() => apiClient.put(`/admin/reports/${id}/dismiss`), 'Відхилено', reportsData.refresh);
            }
        },
        ban: async (id) => {
            const isConfirmed = await confirm({ 
                title: 'Заблокувати сайт?', 
                message: 'Сайт буде заблоковано. Для підтвердження введіть "SUSPEND".', 
                type: 'danger', 
                confirmText: 'Заблокувати',
                requireInput: true,
                expectedInput: 'SUSPEND'
            });
            if (isConfirmed) {
                handleAction(() => apiClient.post(`/admin/reports/${id}/ban`), 'Заблоковано', reportsData.refresh);
            }
        },
        reopen: async (id) => {
            const isConfirmed = await confirm({ 
                title: 'Відновити?', 
                message: 'Повернути на розгляд.', 
                type: 'info', 
                confirmText: 'Відновити' 
            });
            if (isConfirmed) {
                handleAction(() => apiClient.put(`/admin/reports/${id}/reopen`), 'Відновлено', reportsData.refresh);
            }
        }
    };

    const handleExportReports = () => {
        if (!processedReports?.length) return toast.info('Немає даних');
        exportToCsv(processedReports.map(r => ({
            id: r.id, site: r.site_title || 'N/A', url: r.site_path, reason: REASON_OPTIONS.find(o => o.value === r.reason)?.label || r.reason,
            reporter: r.reporter_email || 'Анонім', status: REPORT_STATUS_CONFIG[r.status]?.label || r.status, created: new Date(r.created_at).toLocaleString('uk-UA'), desc: r.description
        })), { id: 'ID', site: 'Сайт', url: 'URL', reason: 'Причина', reporter: 'Скаржник', status: 'Статус', created: 'Дата', desc: 'Опис' }, `reports_${new Date().toLocaleDateString('uk-UA')}`);
    };

    const currentLoading = activeTab === 'tickets' ? ticketsData.loading : reportsData.loading;
    const currentRefresh = activeTab === 'tickets' ? ticketsData.refresh : reportsData.refresh;
    return (
        <AdminPageLayout 
            title="Підтримка та Скарги" 
            icon={MessageSquare} 
            onRefresh={currentRefresh} 
            loading={currentLoading}
        >
            <div className="flex p-1 bg-(--platform-bg) rounded-xl border border-(--platform-border-color) w-full sm:w-fit mb-4 sm:mb-6 overflow-x-auto hide-scrollbar">
                <button
                    className={`flex-1 sm:flex-none py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all whitespace-nowrap ${activeTab === 'tickets' ? 'bg-(--platform-card-bg) text-(--platform-text-primary) shadow-sm' : 'text-(--platform-text-secondary) hover:text-(--platform-text-primary)'}`}
                    onClick={() => setActiveTab('tickets')}
                >
                    <MessageSquare size={16} /> Тікети
                </button>
                <button
                    className={`flex-1 sm:flex-none py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all whitespace-nowrap ${activeTab === 'reports' ? 'bg-(--platform-card-bg) text-(--platform-text-primary) shadow-sm' : 'text-(--platform-text-secondary) hover:text-(--platform-text-primary)'}`}
                    onClick={() => setActiveTab('reports')}
                >
                    <ShieldAlert size={16} /> Скарги
                </button>
            </div>
            {activeTab === 'tickets' && (
                <>
                    <div className="mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                        <FilterBar className="w-full xl:w-auto grid grid-cols-1 sm:flex gap-3">
                            <div className="flex overflow-x-auto hide-scrollbar bg-(--platform-card-bg) p-0.5 rounded-lg border border-(--platform-border-color) w-full sm:w-auto shrink-0">
                                {['active', 'closed'].map(s => (
                                    <Button 
                                        key={s} 
                                        variant="ghost" 
                                        onClick={() => setTicketStatus(s)} 
                                        className={`flex-1 sm:flex-none whitespace-nowrap px-3 sm:px-4 h-9 text-[13px] rounded-md transition-all ${ticketStatus === s ? 'bg-(--platform-bg) text-(--platform-text-primary) shadow-sm' : 'text-(--platform-text-secondary)'}`}
                                    >
                                        {s === 'active' ? 'Активні' : 'Архів'}
                                    </Button>
                                ))}
                            </div>
                            <div className="w-full sm:w-44 shrink-0">
                                <CustomSelect value={ticketCategory} onChange={(e) => setTicketCategory(e.target.value)} options={CATEGORY_OPTIONS} variant="minimal" style={{ height: '40px', background: 'var(--platform-card-bg)' }} />
                            </div>
                            <div className="w-full sm:w-auto overflow-x-auto hide-scrollbar">
                                <DateRangePicker 
                                    startDate={ticketStartDate}
                                    endDate={ticketEndDate}
                                    onStartDateChange={setTicketStartDate}
                                    onEndDateChange={setTicketEndDate}
                                    onClear={() => { setTicketStartDate(''); setTicketEndDate(''); }}
                                />
                            </div>
                        </FilterBar>
                        <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center w-full xl:w-auto">
                            <div className="flex-1 w-full sm:w-64 min-w-50">
                                <Input placeholder="Пошук тікетів..." leftIcon={<Search size={16}/>} value={ticketsData.searchQuery || ''} onChange={(e) => ticketsData.setSearchQuery(e.target.value)} wrapperStyle={{margin: 0}} />
                            </div>
                            <CsvExportButton onClick={handleExportTickets} disabled={ticketsData.loading || !processedTickets.length} />
                        </div>
                    </div>
                    <AdminTable>
                        <colgroup>
                            <col style={{width: '80px'}} />
                            <col style={{width: '28%'}} />
                            <col style={{width: '140px'}} />
                            <col style={{width: '18%'}} />
                            <col style={{width: '160px'}} />
                            <col style={{width: '140px'}} />
                            <col style={{width: '90px'}} />
                        </colgroup>
                        <thead>
                            <tr>
                                <AdminTh label="ID" sortKey="id" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Тема" sortKey="subject" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Категорія" sortKey="type" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Користувач" sortKey="username" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Статус" sortKey="status" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Оновлено" sortKey="updated_at" currentSort={ticketSort} onSort={handleTicketSort} />
                                <AdminTh label="Дії" align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {ticketsData.loading ? <LoadingRow cols={7} /> : !processedTickets.length ? <EmptyRow cols={7} /> : processedTickets.map(t => {
                                const catOpt = CATEGORY_OPTIONS.find(o => o.value === t.type) || CATEGORY_OPTIONS[1];
                                const sProps = t.status === 'open' 
                                    ? { bg: 'color-mix(in srgb, var(--platform-warning), transparent 90%)', c: 'var(--platform-warning)', i: Clock, l: 'Відкрито'} 
                                    : t.status === 'answered'
                                        ? { bg: 'color-mix(in srgb, var(--platform-success), transparent 90%)', c: 'var(--platform-success)', i: MessageSquare, l: 'Відповідь'}
                                        : { bg: 'var(--platform-hover-bg)', c: 'var(--platform-text-secondary)', i: CheckCircle, l: 'Закрито'};
                                const categoryColor = TICKET_COLORS[t.type] || 'var(--platform-accent)';
                                return (
                                    <AdminRow key={t.id} onClick={(e) => {e.stopPropagation();navigate(`/support/ticket/${t.id}`)}} style={{ background: t.status!=='closed' ? 'color-mix(in srgb, var(--platform-accent), transparent 98%)' : 'transparent' }}>
                                        <AdminCell style={{opacity: 0.6, fontSize: '13px'}}>#{t.id}</AdminCell>
                                        <AdminCell>
                                            <div className="font-semibold text-[15px] truncate max-w-50 sm:max-w-75 lg:max-w-100" title={t.subject}>{t.subject}</div>
                                            <div className="text-[13px] opacity-70 truncate max-w-50 sm:max-w-75 lg:max-w-100" title={t.body}>{t.body}</div>
                                        </AdminCell>
                                        <AdminCell><GenericBadge color={categoryColor} bg={`color-mix(in srgb, ${categoryColor}, transparent 90%)`} icon={catOpt.icon}>{catOpt.label}</GenericBadge></AdminCell>
                                        <AdminCell>
                                            <div className="flex items-center gap-2.5">
                                                <div className="shrink-0">
                                                    <Avatar url={t.user_avatar_url || t.avatar_url} name={t.username} size={32} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">{t.username}</div>
                                                    <div className="text-[12px] opacity-60 truncate">{t.user_email}</div>
                                                </div>
                                            </div>
                                        </AdminCell>
                                        <AdminCell><GenericBadge color={sProps.c} bg={sProps.bg} icon={sProps.i}>{sProps.l}</GenericBadge></AdminCell>
                                        <AdminCell>
                                            <div style={{fontSize: '13px'}}>{new Date(t.updated_at).toLocaleDateString()}</div>
                                            <div style={{fontSize: '11px', opacity: 0.6}}>{new Date(t.updated_at).toLocaleTimeString()}</div>
                                        </AdminCell>
                                        <AdminCell align="right">
                                            <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" className="text-(--platform-accent) p-1.5 h-auto w-auto" icon={<ExternalLink size={18} />} onClick={(e) => {e.stopPropagation();navigate(`/support/ticket/${t.id}`)}} />
                                                <Button variant="ghost" title={t.status==='closed'?"Відновити":"Закрити"} onClick={() => t.status==='closed' ? ticketActions.restoreTicket(t.id) : ticketActions.closeTicket(t.id)} className={`p-1.5 h-auto w-auto ${t.status==='closed'?'text-(--platform-success)':'text-(--platform-danger)'}`} icon={t.status==='closed' ? <RotateCcw size={18} /> : <XCircle size={18} />} />
                                            </div>
                                        </AdminCell>
                                    </AdminRow>
                                );
                            })}
                        </tbody>
                    </AdminTable>
                </>
            )}

            {activeTab === 'reports' && (
                <>
                    <div className="mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                        <FilterBar className="w-full xl:w-auto grid grid-cols-1 sm:flex gap-3">
                            <div className="w-full sm:w-44 shrink-0">
                                <CustomSelect 
                                    value={reportStatus} 
                                    onChange={(e) => setReportStatus(e.target.value)} 
                                    options={REPORT_STATUS_OPTIONS} 
                                    variant="minimal" 
                                    placeholder="Статус" 
                                    style={{ height: '40px', background: 'var(--platform-card-bg)' }} 
                                />
                            </div>
                            <div className="w-full sm:w-44 shrink-0">
                                <CustomSelect 
                                    value={reportReason} 
                                    onChange={(e) => setReportReason(e.target.value)} 
                                    options={REASON_OPTIONS} 
                                    variant="minimal" 
                                    style={{ height: '40px', background: 'var(--platform-card-bg)' }} 
                                />
                            </div>
                            <div className="w-full sm:w-auto overflow-x-auto hide-scrollbar">
                                <DateRangePicker 
                                    startDate={reportStartDate}
                                    endDate={reportEndDate}
                                    onStartDateChange={setReportStartDate}
                                    onEndDateChange={setReportEndDate}
                                    onClear={() => { setReportStartDate(''); setReportEndDate(''); }}
                                />
                            </div>
                        </FilterBar>
                        <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center w-full xl:w-auto">
                            <div className="flex-1 w-full sm:w-64 min-w-50">
                                <Input placeholder="Пошук скарг..." leftIcon={<Search size={16}/>} value={reportsData.searchQuery || ''} onChange={(e) => reportsData.setSearchQuery(e.target.value)} wrapperStyle={{margin: 0}} />
                            </div>
                            <CsvExportButton onClick={handleExportReports} disabled={reportsData.loading || !processedReports.length} />
                        </div>
                    </div>
                    <AdminTable>
                        <colgroup><col style={{width: '80px'}} /><col style={{width: '25%'}} /><col style={{width: 'auto'}} /><col style={{width: '20%'}} /><col style={{width: '15%'}} /><col style={{width: '150px'}} /><col style={{width: '120px'}} /></colgroup>
                        <thead><tr><AdminTh label="ID" sortKey="id" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Сайт" sortKey="site_title" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Причина" sortKey="reason" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Скаржник" sortKey="reporter_email" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Дата" sortKey="created_at" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Статус" sortKey="status" currentSort={reportSort} onSort={handleReportSort} /><AdminTh label="Дії" align="right" /></tr></thead>
                        <tbody>
                            {reportsData.loading ? <LoadingRow cols={7} /> : !processedReports.length ? <EmptyRow cols={7} /> : processedReports.map(r => {
                                const RIcon = (REASON_OPTIONS.find(o => o.value === r.reason) || REASON_OPTIONS[5]).icon;
                                const sStyle = REPORT_STATUS_CONFIG[r.status] || REPORT_STATUS_CONFIG.new;
                                return (
                                    <AdminRow key={r.id} style={{ background: r.status === 'new' ? 'color-mix(in srgb, var(--platform-danger), transparent 98%)' : 'transparent' }}>
                                        <AdminCell style={{opacity: 0.6}}>#{r.id}</AdminCell>
                                        <AdminCell>
                                            <div className="font-semibold text-[15px] truncate max-w-37.5 sm:max-w-50" title={r.site_title}>{r.site_title || 'N/A'}</div>
                                            {r.site_path && (
                                                <a href={`/site/${r.site_path}`} target="_blank" onClick={e=>e.stopPropagation()} className="inline-block mt-1">
                                                    <Button variant="outline" icon={<ExternalLink size={12} />} className="h-6 text-[11px] px-2 py-0">Перевірити</Button>
                                                </a>
                                            )}
                                        </AdminCell>
                                        <AdminCell>
                                            <GenericBadge bg="color-mix(in srgb, var(--platform-warning), transparent 90%)" color="var(--platform-warning)" icon={RIcon} style={{marginBottom:'4px'}}>
                                                {REASON_OPTIONS.find(o=>o.value===r.reason)?.label}
                                            </GenericBadge>
                                            {r.description && <div className="text-[12px] opacity-70 truncate max-w-37.5 sm:max-w-50 lg:max-w-62.5" title={r.description}>"{r.description}"</div>}
                                        </AdminCell>
                                        <AdminCell>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate max-w-30 sm:max-w-45" title={r.reporter_email}>{r.reporter_email || 'Анонім'}</span>
                                                {r.reporter_email && (
                                                    <div onClick={(e)=>filterByUser(r.reporter_email, e)} className="cursor-pointer opacity-50 hover:opacity-100 shrink-0 transition-opacity">
                                                        <User size={14}/>
                                                    </div>
                                                )}
                                            </div>
                                        </AdminCell>
                                        <AdminCell>
                                            <div style={{fontSize: '13px'}}>{new Date(r.created_at).toLocaleDateString()}</div>
                                            <div style={{fontSize: '11px', opacity: 0.6}}>{new Date(r.created_at).toLocaleTimeString()}</div>
                                        </AdminCell>
                                        <AdminCell><GenericBadge color={sStyle.color} bg={sStyle.bg} icon={sStyle.icon}>{sStyle.label}</GenericBadge></AdminCell>
                                        <AdminCell align="right">
                                            <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                                                {r.status === 'new' ? (
                                                    <>
                                                        <Button variant="ghost" className="text-(--platform-danger) p-1.5 h-auto w-auto" title="Заблокувати" onClick={() => reportActions.ban(r.id)} icon={<Check size={18} />} />
                                                        <Button variant="ghost" className="text-(--platform-text-secondary) p-1.5 h-auto w-auto" title="Відхилити" onClick={() => reportActions.dismiss(r.id)} icon={<X size={18} />} />
                                                    </>
                                                ) : (
                                                    <Button variant="ghost" className="text-(--platform-accent) p-1.5 h-auto w-auto" title="Відновити" onClick={() => reportActions.reopen(r.id)} icon={<RotateCcw size={18} />} />
                                                )}
                                            </div>
                                        </AdminCell>
                                    </AdminRow>
                                );
                            })}
                        </tbody>
                    </AdminTable>
                </>
            )}
        </AdminPageLayout>
    );
};

export default AdminTicketsReportsPage;