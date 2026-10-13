// frontend/src/modules/dashboard/pages/SiteDashboardPage.jsx
import React, { useState, useEffect, useCallback, useContext, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import apiClient from '../../../shared/api/api';
import { toast } from 'react-toastify';
import { AuthContext } from '../../../app/providers/AuthContext';
import BlockEditor from '../../editor/core/BlockEditor';
import EditorSidebar from '../../editor/ui/EditorSidebar';
import GeneralSettingsTab from '../features/settings/GeneralSettingsTab';
import StyleSettingsTab from '../features/settings/StyleSettingsTab';
import CommerceTab from '../features/commerce/CommerceTab';
import OverviewTab from '../features/overview/OverviewTab';
import DashboardHeader from '../components/DashboardHeader';
import LoadingState from '../../../shared/ui/complex/LoadingState';
import ConfirmModal from '../../../shared/ui/complex/ConfirmModal';
import { Button } from '../../../shared/ui/elements/Button';
import useHistory from '../../../shared/hooks/useHistory';
import { generateBlockId } from '../../editor/core/editorConfig';
import { getDefaultBlockData } from '../../editor/core/blockRegistry';
import { updateBlockDataByPath, removeBlockByPath, addBlockByPath, moveBlock, handleDrop } from '../../editor/core/blockUtils';
import PagesManagerModal from '../features/settings/PagesManagerModal';
import { resolveAccentColor } from '../../../shared/utils/themeUtils';
import FontLoader from '../../renderer/components/FontLoader';
import { Lock, Monitor, ShieldAlert } from 'lucide-react';

const DeviceIframe = ({ children, className, style }) => {
    const [iframeRef, setIframeRef] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    useEffect(() => {
        if (!iframeRef) return;
        const doc = iframeRef.contentDocument;
        if (!doc) return;
        const writeDoc = () => {
            doc.open();
            doc.write('<!DOCTYPE html><html><head></head><body><div id="iframe-root" style="height: 100%;"></div></body></html>');
            doc.close();
            const head = doc.head;
            document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
                head.appendChild(el.cloneNode(true));
            });
            const baseStyle = doc.createElement('style');
            baseStyle.innerHTML = `
                html, body { height: 100%; margin: 0; padding: 0; overflow-x: hidden; background-color: transparent; -ms-overflow-style: none; scrollbar-width: none; }
                * { box-sizing: border-box; -ms-overflow-style: none; scrollbar-width: none; }
                ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent; }
                *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                body { font-family: var(--site-font-main, inherit); color: var(--site-text-primary, inherit); }
            `;
            head.appendChild(baseStyle);
            setIsLoaded(true);
        };
        const timer = setTimeout(writeDoc, 50);
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'STYLE' || (node.tagName === 'LINK' && node.rel === 'stylesheet')) {
                        doc.head.appendChild(node.cloneNode(true));
                    }
                });
            });
        });
        observer.observe(document.head, { childList: true });
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [iframeRef]);
    return (
        <iframe
            ref={setIframeRef}
            className={className}
            style={style}
            title="Mobile Preview"
        >
            {isLoaded && iframeRef.contentDocument && createPortal(
                children,
                iframeRef.contentDocument.getElementById('iframe-root')
            )}
        </iframe>
    );
};

const useDragAutoScroll = (ref, isEnabled) => {
    useEffect(() => {
        const container = ref.current;
        if (!container || !isEnabled) return;
        let animationFrameId;
        let currentSpeed = 0;
        const animateScroll = () => {
            if (currentSpeed !== 0) {
                container.scrollTop += currentSpeed;
            }
            animationFrameId = requestAnimationFrame(animateScroll);
        };
        animationFrameId = requestAnimationFrame(animateScroll);
        const onDragOver = (e) => {
            const { clientY, clientX } = e;
            const rect = container.getBoundingClientRect();
            if (clientX < rect.left || clientX > rect.right) {
                currentSpeed = 0;
                return;
            }
            const topDist = clientY - rect.top;
            const bottomDist = rect.bottom - clientY;
            const threshold = 150; 
            const maxSpeed = 20;
            if (topDist >= 0 && topDist < threshold) {
                currentSpeed = -maxSpeed * (1 - topDist / threshold);
            } else if (bottomDist >= 0 && bottomDist < threshold) {
                currentSpeed = maxSpeed * (1 - bottomDist / threshold);
            } else {
                currentSpeed = 0;
            }
        };
        const stopScrolling = () => { currentSpeed = 0; };
        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('dragend', stopScrolling, true);
        document.addEventListener('drop', stopScrolling, true);
        return () => {
            cancelAnimationFrame(animationFrameId);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('dragend', stopScrolling, true);
            document.removeEventListener('drop', stopScrolling, true);
        };
    }, [isEnabled]);
};

const NoAccessScreen = () => (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 w-full">
        <div 
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6 border border-(--platform-accent) shadow-sm"
            style={{ background: 'color-mix(in srgb, var(--platform-accent), transparent 90%)', borderColor: 'color-mix(in srgb, var(--platform-accent), transparent 70%)' }}
        >
            <ShieldAlert size={40} className="text-(--platform-accent)" />
        </div>
        <h2 className="text-2xl font-bold text-(--platform-text-primary) mb-2">Немає доступу</h2>
        <p className="text-(--platform-text-secondary) max-w-md">
            Власник сайту не надав вам прав для перегляду жодного з розділів панелі керування. 
            Зверніться до адміністратора сайту для отримання доступу.
        </p>
        <button 
            onClick={() => window.location.href = '/my-sites'}
            className="mt-8 px-6 py-2.5 bg-(--platform-card-bg) border border-(--platform-border-color) rounded-xl text-sm font-medium text-(--platform-text-primary) hover:border-(--platform-accent) hover:text-(--platform-accent) transition-all cursor-pointer shadow-sm"
        >
            Повернутися до моїх сайтів
        </button>
    </div>
);

const SiteDashboardPage = () => {
    const { site_path } = useParams();
    const navigate = useNavigate();
    const { siteData, setSiteData, isSiteLoading } = useOutletContext();
    const { user, isAdmin } = useContext(AuthContext);
    const [isPagesManagerOpen, setIsPagesManagerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        const saved = localStorage.getItem(`editor_active_tab_${site_path}`) || 'editor';
        return saved === 'pages' ? 'editor' : saved;
    });
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem(`editor_view_mode_${site_path}`) || 'editor';
    });
    const [isSwitchingView, setIsSwitchingView] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
    const pcScrollRef = useRef(null);
    useDragAutoScroll(pcScrollRef, activeTab === 'editor');
    const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
    const tabScrollPositions = useRef({});
    const settingsContainerRef = useRef(null);
    const isOwner = user?.id === siteData?.user_id;
    const isStaff = user?.role === 'admin' || user?.role === 'moderator';
    const hasNoAccess = siteData && !isOwner && !isStaff && (!siteData.my_permissions || siteData.my_permissions.length === 0);
    const checkAccess = useCallback((tabKey) => {
        if (!siteData) return false;
        if (isOwner || isStaff) return true;
        if (siteData.my_permissions && Array.isArray(siteData.my_permissions)) {
            return siteData.my_permissions.includes(tabKey);
        }
        return true; 
    }, [isOwner, isStaff, siteData]);
    const handleViewModeChange = useCallback((mode) => {
        setViewMode(prev => {
            if (prev === mode) return prev;
            setIsSwitchingView(true);
            setTimeout(() => setIsSwitchingView(false), 500);
            return mode;
        });
    }, []);

    const handleSettingsScroll = (e) => {
        if (activeTab !== 'editor') {
            tabScrollPositions.current[activeTab] = e.target.scrollTop;
        }
    };

    useEffect(() => {
        if (settingsContainerRef.current && activeTab !== 'editor') {
            settingsContainerRef.current.scrollTop = tabScrollPositions.current[activeTab] || 0;
        }
    }, [activeTab]);

    useEffect(() => {
        let timeoutId;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setIsMobileScreen(window.innerWidth <= 768);
            }, 100);
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
        };
    }, []);
    
    useEffect(() => {
        if (isMobileScreen && !hasNoAccess) {
            if (activeTab !== 'editor' && activeTab !== 'settings') {
                setActiveTab(checkAccess('settings') ? 'settings' : 'editor');
            }
        }
    }, [isMobileScreen, activeTab, checkAccess, hasNoAccess]);

    useEffect(() => {
        if (siteData && siteData.site_path && siteData.site_path !== site_path) {
            navigate(`/dashboard/${siteData.site_path}`, { replace: true });
        }
    }, [siteData?.site_path, site_path, navigate]);

    useEffect(() => {
        if (!siteData || hasNoAccess) return;
        const hiddenTabs = siteData.dashboard_config?.hiddenTabs || [];
        const hasAccessToCurrent = checkAccess(activeTab);
        const isCurrentHidden = !['editor', 'settings'].includes(activeTab) && hiddenTabs.includes(activeTab);
        if (isCurrentHidden || !hasAccessToCurrent) {
            const allTabs = ['editor', 'theme', 'commerce', 'overview', 'settings'];
            const availableTabs = allTabs.filter(tab => {
                const isUnhideable = tab === 'editor' || tab === 'settings';
                const isHidden = !isUnhideable && hiddenTabs.includes(tab);
                return !isHidden && checkAccess(tab);
            });

            if (availableTabs.length > 0) {
                setActiveTab(availableTabs[0]);
            }
        }
    }, [siteData, activeTab, checkAccess, hasNoAccess]);

    useEffect(() => {
        const handleLockStatus = (e) => {
            const serverLocked = e.detail;
            if (serverLocked && !isAdmin) {
                setIsReadOnly(true);
            } else {
                setIsReadOnly(false);
            }
        };
        window.addEventListener('editor_locked_status', handleLockStatus);
        return () => window.removeEventListener('editor_locked_status', handleLockStatus);
    }, [isAdmin]);

    useEffect(() => {
        if (siteData && siteData.status === 'suspended') {
            toast.error('Доступ до редагування заблоковано. Сайт заблоковано.');
            navigate('/dashboard');
        }
    }, [siteData, navigate]);

    useEffect(() => {
        if (site_path && !hasNoAccess) {
            localStorage.setItem(`editor_active_tab_${site_path}`, activeTab);
            localStorage.setItem(`editor_view_mode_${site_path}`, viewMode);
        }
    }, [activeTab, viewMode, site_path, hasNoAccess]);

    const [blocks, setBlocks, undo, redo, { canUndo, canRedo }] = useHistory([]);
    const [savedBlocksStr, setSavedBlocksStr] = useState('');
    const [currentPageId, setCurrentPageId] = useState(() => {
        const savedPage = localStorage.getItem(`last_edited_page_${site_path}`);
        return savedPage ? parseInt(savedPage, 10) : null;
    });
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [selectedBlockPath, setSelectedBlockPath] = useState(null);
    const [allPages, setAllPages] = useState([]);
    const [collapsedBlocks, setCollapsedBlocks] = useState(() => {
        if (!site_path) return [];
        let targetId = null;
        const savedPage = localStorage.getItem(`last_edited_page_${site_path}`);
        if (savedPage) targetId = parseInt(savedPage, 10);
        if (targetId) {
            const key = `collapsed_blocks_${site_path}_${targetId}`;
            try {
                const savedState = localStorage.getItem(key);
                return savedState ? JSON.parse(savedState) : [];
            } catch (e) { return []; }
        }
        return [];
    });
    
    const themeSettings = useMemo(() => {
        if (!siteData) return {};
        let ts = siteData.theme_settings;
        if (typeof ts === 'string') {
            try { ts = JSON.parse(ts); } catch (e) { ts = {}; }
        }
        return ts || {};
    }, [siteData]);

    const siteIsolationStyles = useMemo(() => {
        if (!siteData) return {};
        const isSiteDark = siteData.site_theme_mode === 'dark';
        const siteBg = isSiteDark ? '#1a202c' : '#f7fafc';
        const siteText = isSiteDark ? '#f7fafc' : '#1a202c';
        const siteCardBg = isSiteDark ? '#2d3748' : '#ffffff';
        const siteBorder = isSiteDark ? '#4a5568' : '#e2e8f0';
        const siteAccent = resolveAccentColor(siteData.site_theme_accent || 'orange');
        const styles = {
            '--site-bg': siteBg,
            '--site-text-primary': siteText,
            '--site-text-secondary': isSiteDark ? '#a0aec0' : '#718096',
            '--site-card-bg': siteCardBg,
            '--site-border-color': siteBorder,
            '--site-accent': siteAccent,
            '--site-font-main': themeSettings.font_body || "'Inter', sans-serif",
            '--site-font-headings': themeSettings.font_heading || themeSettings.font_body || "'Inter', sans-serif"
        };
        let hex = siteAccent.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        if (hex.length === 6) {
            styles['--site-accent-rgb'] = `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
        }
        return styles;
    }, [siteData, themeSettings]);

    useEffect(() => {
        if (site_path && currentPageId) {
            const key = `collapsed_blocks_${site_path}_${currentPageId}`;
            localStorage.setItem(key, JSON.stringify(collapsedBlocks));
        }
    }, [collapsedBlocks, site_path, currentPageId]);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isThemeSaving, setIsThemeSaving] = useState(false);
    const [componentsSaving, setComponentsSaving] = useState({
        pages: false, commerce: false, overview: false, settings: false
    });
    const [savedBlocksUpdateTrigger, setSavedBlocksUpdateTrigger] = useState(0);
    useEffect(() => {
        if (isPageLoading || !currentPageId || !siteData?.id || isReadOnly) return;
        const currentBlocksStr = JSON.stringify(blocks);
        const draftKey = `draft_${siteData.id}_${currentPageId}`;
        if (currentBlocksStr !== savedBlocksStr && savedBlocksStr !== '') {
            localStorage.setItem(draftKey, currentBlocksStr);
        } else if (currentBlocksStr === savedBlocksStr) {
            localStorage.removeItem(draftKey);
        }
    }, [blocks, savedBlocksStr, currentPageId, siteData?.id, isPageLoading, isReadOnly]);

    const handleDiscardChanges = useCallback(() => {
        setIsDiscardModalOpen(true);
    }, []);

    const executeDiscardChanges = useCallback(() => {
        setIsDiscardModalOpen(false);
        const draftKey = `draft_${siteData.id}_${currentPageId}`;
        localStorage.removeItem(draftKey);
        try {
            const originalBlocks = JSON.parse(savedBlocksStr);
            setBlocks(originalBlocks, false);
            toast.success('Зміни скасовано');
        } catch (e) {
            console.error("Помилка відновлення сторінки:", e);
            toast.error('Не вдалося скинути зміни');
        }
    }, [savedBlocksStr, siteData?.id, currentPageId, setBlocks]);

    const setComponentSaving = useCallback((component, isSaving) => {
        setComponentsSaving(prev => ({ ...prev, [component]: isSaving }));
    }, []);
    
    const handleBlockSaved = useCallback(() => {
        setSavedBlocksUpdateTrigger(prev => prev + 1);
    }, []);
    
    useEffect(() => {
        const anyComponentSaving = Object.values(componentsSaving).some(saving => saving);
        setIsSaving(anyComponentSaving);
    }, [componentsSaving]);
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            if (document.querySelector('.ReactModal__Content') || isPagesManagerOpen) return;
            if (isReadOnly || hasNoAccess) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) { e.preventDefault(); redo(); }
                else { e.preventDefault(); undo(); }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault(); redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, isReadOnly, isPagesManagerOpen, hasNoAccess]);

    const fetchPageContent = async (pageId) => {
        setIsPageLoading(true);
        try {
            const response = await apiClient.get(`/pages/${pageId}`);
            let content = response.data.block_content || [];
            if (typeof content === 'string') {
                try { content = JSON.parse(content); } catch (e) { content = []; }
            }
            content = content.map(block => {
                if (block.type === 'global-header' || block.type === 'header') {
                    let globalData = typeof siteData.header_content === 'string' ? JSON.parse(siteData.header_content || '{}') : (siteData.header_content || {});
                    if (Object.keys(globalData).length === 0) globalData = getDefaultBlockData('global-header');
                    return { ...block, type: 'global-header', data: globalData };
                }
                if (block.type === 'global-footer' || block.type === 'footer') {
                    let globalData = typeof siteData.footer_content === 'string' ? JSON.parse(siteData.footer_content || '{}') : (siteData.footer_content || {});
                    if (Object.keys(globalData).length === 0) globalData = getDefaultBlockData('global-footer');
                    return { ...block, type: 'global-footer', data: globalData };
                }
                return block;
            });
            const serverBlocksStr = JSON.stringify(content);
            setSavedBlocksStr(serverBlocksStr); 
            const draftKey = `draft_${siteData.id}_${pageId}`;
            const draftStr = localStorage.getItem(draftKey);
            if (draftStr && draftStr !== serverBlocksStr && !isReadOnly) {
                try {
                    const parsedDraft = JSON.parse(draftStr);
                    setBlocks(parsedDraft, false);
                } catch (e) {
                    setBlocks(content, false);
                }
            } else {
                setBlocks(content, false);
            }
        } catch (err) {
            console.error('Помилка завантаження сторінки:', err);
            if (err.response && err.response.status === 404) {
               localStorage.removeItem(`last_edited_page_${site_path}`);
               refreshPageList();
            }
            toast.error('Не вдалося завантажити вміст сторінки');
        } finally {
            setIsPageLoading(false);
        }
    };
    
    const handleEditPage = (pageId) => {
        if (pageId === currentPageId && !isPageLoading && blocks.length > 0) return;
        setCurrentPageId(pageId);
        localStorage.setItem(`last_edited_page_${site_path}`, pageId);
        try {
            const key = `collapsed_blocks_${site_path}_${pageId}`;
            const savedState = localStorage.getItem(key);
            setCollapsedBlocks(savedState ? JSON.parse(savedState) : []);
        } catch (e) { setCollapsedBlocks([]); }
        fetchPageContent(pageId);
        setSelectedBlockPath(null);
    };
    
    useEffect(() => {
        if (siteData && !allPages.length && !hasNoAccess) {
            apiClient.get(`/sites/${siteData.id}/pages`)
                .then(res => {
                    const pages = res.data;
                    setAllPages(pages);
                    if (pages.length > 0) {
                        let targetId = currentPageId;
                        const pageExists = pages.find(p => p.id === targetId);
                        if (!targetId || !pageExists) {
                            const home = pages.find(p => p.is_homepage) || pages[0];
                            targetId = home.id;
                        }
                        handleEditPage(targetId);
                    }
                })
                .catch(console.error);
        }
    }, [siteData, hasNoAccess]);
    
    const handleMoveBlock = (drag, hover) => !isReadOnly && setBlocks(prev => moveBlock(prev, drag, hover));
    const handleDropBlock = (item, path) => !isReadOnly && setBlocks(prev => handleDrop(prev, item, path));
    const handleAddBlock = (path, type, preset) => {
        if (isReadOnly) return;
        if (type.startsWith('global-')) {
            const exists = blocks.some(b => b.type === type);
            if (exists) {
                toast.warning(`Цей глобальний блок вже додано на сторінку.`);
                return;
            }
        }
        let blockData = getDefaultBlockData(type, preset);
        if (type === 'global-header') {
            const globalData = typeof siteData?.header_content === 'string' 
                ? JSON.parse(siteData.header_content || '{}') 
                : (siteData?.header_content || {});
            if (Object.keys(globalData).length > 0) blockData = globalData;
        } else if (type === 'global-footer') {
            const globalData = typeof siteData?.footer_content === 'string' 
                ? JSON.parse(siteData.footer_content || '{}') 
                : (siteData?.footer_content || {});
            if (Object.keys(globalData).length > 0) blockData = globalData;
        }
        const newBlock = { block_id: generateBlockId(), type, data: blockData };
        setBlocks(prev => addBlockByPath(prev, newBlock, path));
    };

    const handleDeleteBlock = (path) => {
        if (isReadOnly) return;
        setBlocks(prev => removeBlockByPath(prev, path));
        setSelectedBlockPath(null);
    };
    
    const handleUpdateBlockData = (path, data, addToHistory = true) => {
        if (isReadOnly) return;
        setBlocks(prev => updateBlockDataByPath(prev, path, data), addToHistory);
    };

    const handleSaveError = (error) => {
        console.error("Помилка при збереженні:", error);
        if (error.response && (error.response.status === 503 || error.response.data?.editor_locked)) {
            setIsReadOnly(true);
        } else {
            toast.error('Не вдалося зберегти зміни.');
        }
    };

    const savePageContent = async (currentBlocks) => {
        if (isReadOnly) return; 
        const blocksToProcess = currentBlocks || blocks;
        setIsSaving(true);
        try {
            let updatedHeaderData = null;
            let updatedFooterData = null;
            const blocksToSave = blocksToProcess.map(block => {
                if (block.type === 'global-header' || block.type === 'header') {
                    updatedHeaderData = block.data;
                    return { ...block, data: {} };
                }
                if (block.type === 'global-footer' || block.type === 'footer') {
                    updatedFooterData = block.data;
                    return { ...block, data: {} };
                }
                return block;
            });
            const requests = [
                apiClient.put(`/pages/${currentPageId}/content`, { block_content: blocksToSave })
            ];
            const siteUpdates = {};
            if (updatedHeaderData) siteUpdates.header_content = updatedHeaderData;
            if (updatedFooterData) siteUpdates.footer_content = updatedFooterData;
            if (Object.keys(siteUpdates).length > 0) {
                requests.push(apiClient.put(`/sites/${siteData.site_path}/settings`, siteUpdates));
            }
            await Promise.all(requests);
            const savedStr = JSON.stringify(blocksToProcess);
            setSavedBlocksStr(savedStr);
            localStorage.removeItem(`draft_${siteData.id}_${currentPageId}`);
            if (Object.keys(siteUpdates).length > 0) {
                setSiteData(prev => ({ ...prev, ...siteUpdates }));
            }
        } catch (error) {
            handleSaveError(error);
        } finally {
            setTimeout(() => setIsSaving(false), 500);
        }
    };

    const saveThemeSettings = async (updatedData) => {
        if (isReadOnly) return;
        setIsThemeSaving(true);
        try {
            const updateData = {};
            const restrictedKeys = ['site_path', 'title', 'slug', 'status'];
            Object.keys(updatedData).forEach(key => {
                if (updatedData[key] !== siteData[key] && !restrictedKeys.includes(key)) {
                    updateData[key] = updatedData[key];
                }
            });
            if (Object.keys(updateData).length > 0) {
                const targetSlug = updatedData.site_path || siteData.site_path;
                await apiClient.put(`/sites/${targetSlug}/settings`, updateData);
                setSiteData(prev => ({ ...prev, ...updateData }));
            }
        } catch (error) {
            handleSaveError(error);
        } finally {
            setTimeout(() => setIsThemeSaving(false), 500);
        }
    };

    const handleSiteDataUpdate = (newData) => {
        setSiteData(prev => ({ ...prev, ...newData }));
        saveThemeSettings(newData);
    };
    const refreshPageList = () => {
        apiClient.get(`/sites/${siteData.id}/pages`)
            .then(response => {
                setAllPages(response.data);
                if (typeof currentPageId === 'number' && !response.data.find(p => p.id === currentPageId)) {
                     const home = response.data.find(p => p.is_homepage) || response.data[0];
                     if(home) handleEditPage(home.id);
                }
            })
            .catch(console.error);
    };
    const toggleBlockCollapse = (blockId) => {
        setCollapsedBlocks(prev => prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]);
    };

    const handleSavingChange = useCallback((isSaving) => {
        const tabMap = { pages: 'pages', commerce: 'commerce', overview: 'overview', settings: 'settings' };
        if (tabMap[activeTab]) setComponentSaving(tabMap[activeTab], isSaving);
    }, [activeTab, setComponentSaving]);
    if (isSiteLoading || !siteData) {
        return <LoadingState title="Завантаження редактора..." />;
    }
    if (hasNoAccess) {
        return (
            <div className="flex flex-col h-screen overflow-hidden relative bg-(--platform-bg)">
                <NoAccessScreen />
            </div>
        );
    }
    const isFullHeightTab = ['commerce', 'overview'].includes(activeTab);
    const hasUnsavedChanges = JSON.stringify(blocks) !== savedBlocksStr && savedBlocksStr !== '';
    return (
        <div className="flex flex-col h-screen overflow-hidden relative bg-(--platform-bg)">
            {siteData && themeSettings && (
                <FontLoader fontHeading={themeSettings.font_heading} fontBody={themeSettings.font_body} />
            )}
            <style>
                {`
                .editor-site-context {
                    font-family: var(--site-font-main);
                    background-color: var(--platform-bg); 
                    color: var(--site-text-primary);
                }
                .editor-site-context * { box-sizing: border-box; }
                .site-scrollbar { scrollbar-width: thin; scrollbar-color: var(--site-accent) transparent; }
                .site-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .site-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .site-scrollbar::-webkit-scrollbar-thumb { background-color: var(--site-accent); border-radius: 10px; }
                .site-scrollbar::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
                `}
            </style>
            <ConfirmModal 
                isOpen={isDiscardModalOpen}
                title="Скинути зміни?"
                message="Ви впевнені, що хочете скинути всі незбережені зміни? Вони будуть видалені безповоротно."
                confirmLabel="Скинути"
                cancelLabel="Скасувати"
                onConfirm={executeDiscardChanges}
                onCancel={() => setIsDiscardModalOpen(false)}
                type="danger" 
            />
            <PagesManagerModal 
                isOpen={isPagesManagerOpen} 
                onClose={() => setIsPagesManagerOpen(false)} 
                siteId={siteData.id} 
                onPageUpdate={refreshPageList} 
                onEditPage={(id) => { 
                    handleEditPage(id); 
                    setActiveTab('editor'); 
                    setIsPagesManagerOpen(false); 
                }} 
                onSavingChange={(isSaving) => setComponentSaving('pages', isSaving)} 
            />
            {isReadOnly && (
                <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-sm z-50 animate-in slide-in-from-top-2 duration-300">
                    <Lock size={16} />
                    <span>Редактор тимчасово заблоковано для оновлення платформи. Ви в режимі перегляду.</span>
                </div>
            )}
            <DashboardHeader
                siteData={siteData}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                undo={undo} redo={redo}
                canUndo={canUndo && !isReadOnly} 
                canRedo={canRedo && !isReadOnly}
                isSaving={isSaving || isThemeSaving}
                isReadOnly={isReadOnly}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                onUpdateConfig={handleSiteDataUpdate}
                hasChanges={hasUnsavedChanges}
                onSave={() => savePageContent()}
                onDiscardChanges={handleDiscardChanges}
            />
            <div className="flex-1 flex overflow-hidden relative">
                {activeTab === 'editor' && checkAccess('editor') && (
                    isMobileScreen ? (
                        <div className="flex-1 flex flex-col items-center justify-center bg-(--platform-bg) p-6 text-center z-10 overflow-y-auto">
                            <div className="max-w-md w-full flex flex-col items-center bg-(--platform-card-bg) p-8 rounded-2xl border border-(--platform-border-color) shadow-sm">
                                <div className="w-16 h-16 bg-(--platform-bg) rounded-full flex items-center justify-center mb-6 shadow-inner border border-(--platform-border-color)">
                                    <Monitor size={32} className="text-(--platform-text-secondary)" />
                                </div>
                                <h2 className="text-xl md:text-2xl font-bold text-(--platform-text-primary) mb-3">Редактор недоступний</h2>
                                <p className="text-sm text-(--platform-text-secondary) mb-8 leading-relaxed">
                                    Для доступу до візуального конструктора сайтів необхідний пристрій з більшим екраном. Будь ласка, відкрийте Kendr на комп'ютері або планшеті.
                                </p>
                                <Button variant="primary" onClick={() => setActiveTab('settings')} className="w-full justify-center">
                                    Перейти до налаштувань
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div 
                                className={`flex-1 overflow-hidden flex flex-col items-center justify-center transition-colors duration-300 ${viewMode === 'mobile' ? 'bg-[#111827] py-4 sm:py-6' : 'bg-(--platform-bg) p-0'}`}
                            >
                                {isPageLoading ? (
                                    <LoadingState layout="component" title="Завантаження сторінки..." className="h-75" />
                                ) : isSwitchingView ? (
                                    <div className={`shadow-2xl overflow-hidden flex flex-col bg-(--platform-bg) transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] mx-auto ${
                                        viewMode === 'mobile' 
                                            ? 'w-103.5 h-[calc(100vh-120px)] max-h-212.5 border-14 border-slate-900 rounded-[3rem] ring-1 ring-white/10' 
                                            : 'w-full h-full border-0 border-transparent rounded-none ring-0'
                                    }`}>
                                        <div className="h-full flex items-center justify-center w-full">
                                            <LoadingState title="Зміна масштабу..." layout="component" iconSize={48} />
                                        </div>
                                    </div>
                                ) : viewMode === 'mobile' ? (
                                    <div className="relative shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] w-103.5 h-[calc(100vh-120px)] max-h-212.5 border-14 border-slate-900 rounded-[3rem] ring-1 ring-white/10 overflow-hidden isolate mx-auto">
                                        <DeviceIframe 
                                            className="w-full h-full border-none outline-none block"
                                            style={{ ...siteIsolationStyles, backgroundColor: siteIsolationStyles['--site-bg'] }}
                                        >
                                            <div 
                                                className={`@container editor-site-context flex flex-col w-full h-full overflow-hidden ${isReadOnly ? 'pointer-events-none opacity-80' : ''}`}
                                                style={siteIsolationStyles}
                                            >
                                                <BlockEditor 
                                                    blocks={blocks} 
                                                    siteData={siteData}
                                                    onAddBlock={handleAddBlock}
                                                    onMoveBlock={handleMoveBlock}
                                                    onDropBlock={handleDropBlock}
                                                    onDeleteBlock={handleDeleteBlock}
                                                    onSelectBlock={setSelectedBlockPath}
                                                    selectedBlockPath={selectedBlockPath}
                                                    collapsedBlocks={collapsedBlocks}
                                                    onToggleCollapse={toggleBlockCollapse}
                                                    onBlockSaved={handleBlockSaved}
                                                    viewMode={viewMode}
                                                />
                                            </div>
                                        </DeviceIframe>
                                    </div>
                                ) : (
                                    <div 
                                        className={`@container editor-site-context shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col ${isReadOnly ? 'pointer-events-none opacity-80' : ''} w-full h-full overflow-hidden border-0 border-transparent rounded-none ring-0`}
                                        style={siteIsolationStyles}
                                    >
                                        <BlockEditor 
                                            blocks={blocks} 
                                            siteData={siteData}
                                            onAddBlock={handleAddBlock}
                                            onMoveBlock={handleMoveBlock}
                                            onDropBlock={handleDropBlock}
                                            onDeleteBlock={handleDeleteBlock}
                                            onSelectBlock={setSelectedBlockPath}
                                            selectedBlockPath={selectedBlockPath}
                                            collapsedBlocks={collapsedBlocks}
                                            onToggleCollapse={toggleBlockCollapse}
                                            onBlockSaved={handleBlockSaved}
                                            viewMode={viewMode}
                                        />
                                    </div>
                                )}
                            </div>
                            {viewMode === 'editor' && (
                                <div className={isReadOnly ? 'pointer-events-none opacity-50 grayscale' : ''}>
                                    <EditorSidebar
                                        blocks={blocks}
                                        siteData={siteData}
                                        onMoveBlock={handleMoveBlock}
                                        onDeleteBlock={handleDeleteBlock}
                                        selectedBlockPath={selectedBlockPath}
                                        onSelectBlock={setSelectedBlockPath}
                                        onUpdateBlockData={handleUpdateBlockData}
                                        onAddBlock={handleAddBlock}
                                        allPages={allPages}
                                        currentPageId={currentPageId}
                                        onSelectPage={(id) => handleEditPage(id)}
                                        savedBlocksUpdateTrigger={savedBlocksUpdateTrigger}
                                        onOpenPagesManager={() => setIsPagesManagerOpen(true)}
                                    />
                                </div>
                            )}
                        </>
                    )
                )}
                {activeTab !== 'editor' && checkAccess(activeTab) && (
                    <div 
                        ref={settingsContainerRef}
                        onScroll={handleSettingsScroll}
                        className={`flex-1 bg-(--platform-bg) ${
                            isFullHeightTab
                                ? 'overflow-hidden pl-6 pt-6 pr-6 pb-6' 
                                : 'overflow-y-auto p-8'
                        }`}
                    >
                        <div 
                            className={`mx-auto ${
                                isFullHeightTab ? 'w-full h-full' : (activeTab === 'settings' ? 'w-full' : 'max-w-250')
                            } ${isReadOnly ? 'pointer-events-none opacity-70' : ''}`}
                        >
                            {activeTab === 'commerce' && <CommerceTab siteData={siteData} onSavingChange={handleSavingChange} />}
                            {activeTab === 'theme' && <StyleSettingsTab siteData={siteData} onUpdate={handleSiteDataUpdate} isSaving={isThemeSaving} />}
                            {activeTab === 'overview' && (
                                <OverviewTab 
                                    siteData={siteData} 
                                    onSavingChange={handleSavingChange}
                                    onGoToOrders={() => {
                                        setActiveTab('commerce');
                                        navigate(`?commerceTab=orders`);
                                    }} 
                                />
                            )}
                            {activeTab === 'settings' && <GeneralSettingsTab siteData={siteData} onUpdate={handleSiteDataUpdate} onSavingChange={handleSavingChange} />}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SiteDashboardPage;